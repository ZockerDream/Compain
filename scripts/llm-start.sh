#!/bin/sh
# Start command of the "llm" service (runs inside the llama.cpp container).
# Downloads the model on the first start (resumes after an interruption), then starts llama-server.
# LLM_MODEL: gemma (default), mistral or none (no self-hosted model, the service only idles).
# LLM_DEVICE=gpu (set by docker-compose.gpu.yml) leaves LLM_GPU_RESERVE_MB of graphics memory free.
set -eu
. /scripts/models.sh
MODEL="${LLM_MODEL:-gemma}"

if [ "$MODEL" = none ]; then
  echo "LLM_MODEL=none: no self-hosted model."
  exec sleep infinity
fi
FILE="$(model_file "$MODEL")" || { echo "Unknown LLM_MODEL '$MODEL' (gemma, mistral or none)"; exit 1; }
URL="$(model_url "$MODEL")"

if [ ! -s "/models/$FILE" ]; then
  echo "Downloading $FILE (about 15-17 GB, this takes a while). Compain shows the model as not reachable until then."
  curl -L --fail -C - --retry 5 --retry-delay 10 -sS -o "/models/$FILE.part" "$URL"
  mv "/models/$FILE.part" "/models/$FILE"
fi

set -- -m "/models/$FILE" --host 0.0.0.0 --port 8081 -c "${LLM_CONTEXT:-16384}" -np "${LLM_SLOTS:-2}" \
  -t "${LLM_THREADS:-6}" --reasoning off
if [ "${LLM_DEVICE:-cpu}" = gpu ]; then
  set -- "$@" --fit-target "${LLM_GPU_RESERVE_MB:-1024}"
fi
exec /app/llama-server "$@"
