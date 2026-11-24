#!/usr/bin/env bash
# Chooses where the self-hosted model runs: on an NVIDIA graphics card (gpu) or only on the processor (cpu).
# Usage: ./scripts/llm.sh gpu|cpu [gemma|mistral]      (default model: the one in .env, else gemma)
#        ./scripts/llm.sh status
# Without this script the model runs on the processor. "gpu" writes LLM_DEVICE=gpu and
# COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml into .env, so a plain "docker compose up -d"
# keeps the choice from then on.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo ".env is missing (cp .env.example .env)"; exit 1; }

setenv() {  # setenv KEY VALUE: replace the line in .env or append it
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
unsetenv() { sed -i "/^$1=/d" .env; }

if [ "${1:-}" = "status" ]; then
  grep -E "^(LLM_DEVICE|LLM_MODEL|COMPOSE_FILE)=" .env || echo "defaults: processor, gemma"
  docker compose ps llm --format '{{.Service}}  {{.Image}}  {{.Status}}'
  exit 0
fi

device="${1:-}"
current="$(grep -E '^LLM_MODEL=' .env | cut -d= -f2 || true)"
model="${2:-${current:-gemma}}"
case "$device" in gpu|cpu) ;; *) echo "Usage: $0 gpu|cpu [gemma|mistral]  or  $0 status"; exit 1 ;; esac
case "$model" in gemma|mistral|none) ;; *) echo "Unknown model: $model (gemma or mistral)"; exit 1 ;; esac

if [ "$device" = gpu ]; then
  command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1 \
    || { echo "No NVIDIA graphics card found. Use: $0 cpu"; exit 1; }
  docker info 2>/dev/null | grep -qi nvidia \
    || { echo "Docker cannot use the graphics card yet. Install the NVIDIA Container Toolkit first (see README, 'Graphics card')."; exit 1; }
  setenv LLM_DEVICE gpu
  setenv COMPOSE_FILE docker-compose.yml:docker-compose.gpu.yml
else
  unsetenv LLM_DEVICE
  unsetenv COMPOSE_FILE
fi
setenv LLM_MODEL "$model"

docker compose up -d
echo "The model server restarts on the $device. Loading the model takes a few minutes."
