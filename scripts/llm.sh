#!/usr/bin/env bash
# Chooses where the self-hosted model runs: on the graphics card (gpu) or only on the processor (cpu).
# Usage: ./scripts/llm.sh gpu|cpu [gemma|mistral]      (default model: gemma)
#        ./scripts/llm.sh status
# Writes LLM_DEVICE, COMPOSE_PROFILES and the model settings into .env, stops the other model
# server and starts the chosen one. After that a plain "docker compose up -d" keeps the choice.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo ".env is missing (cp .env.example .env)"; exit 1; }

setenv() {  # setenv KEY VALUE: replace the line in .env or append it
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

if [ "${1:-}" = "status" ]; then
  grep -E "^(LLM_DEVICE|COMPOSE_PROFILES|COMPAIN_MODEL_BASE_URL|COMPAIN_MODEL_NAME)=" .env || true
  docker compose ps --format '{{.Service}}  {{.Status}}' | grep '^llm-' || echo "no model server running"
  exit 0
fi

device="${1:-}"; model="${2:-gemma}"
case "$device" in gpu|cpu) ;; *) echo "Usage: $0 gpu|cpu [gemma|mistral]  or  $0 status"; exit 1 ;; esac
case "$model" in
  gemma)   name=gemma-4-26b-a4b ;;
  mistral) name=mistral-small-3.2 ;;
  *) echo "Unknown model: $model (gemma or mistral)"; exit 1 ;;
esac

if [ "$device" = gpu ]; then
  command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1 \
    || { echo "No NVIDIA graphics card found. Use: $0 cpu $model"; exit 1; }
  docker info 2>/dev/null | grep -qi nvidia \
    || { echo "Docker cannot use the graphics card yet. Install the NVIDIA Container Toolkit first (see README, 'Graphics card')."; exit 1; }
  profile="llm-$model-gpu"
else
  profile="llm-$model"
fi

setenv LLM_DEVICE "$device"
profiles="$profile"
grep -q '^COMPAIN_DOMAIN=.\+' .env && profiles="$profiles,https"
setenv COMPOSE_PROFILES "$profiles"
setenv COMPAIN_MODEL_BASE_URL "http://llm-$model:8081/v1"
setenv COMPAIN_MODEL_NAME "$name"

# Only one model server at a time: two would need twice the memory.
for other in llm-gemma llm-gemma-gpu llm-mistral llm-mistral-gpu; do
  [ "$other" = "$profile" ] || docker compose --profile "$other" rm -sf "$other" >/dev/null 2>&1 || true
done
docker compose up -d
echo "Model server $profile starts. Loading the model takes a few minutes; the app shows 'loading' until then."
