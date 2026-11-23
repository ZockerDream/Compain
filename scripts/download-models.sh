#!/usr/bin/env bash
# Downloads the self-hosted models into ./models (resumes if interrupted).
# Usage: ./scripts/download-models.sh [gemma|mistral|all]   (default: gemma, the recommended model)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models

MISTRAL_URL="https://huggingface.co/maerong3/Huihui-Mistral-Small-3.2-24B-Instruct-2506-abliterated-Q4_K_M-GGUF/resolve/main/huihui-mistral-small-3.2-24b-instruct-2506-abliterated-q4_k_m.gguf"
GEMMA_URL="https://huggingface.co/llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic-GGUF/resolve/main/gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf"

get() {
  echo "Downloading $2 (this can take an hour) ..."
  curl -L --fail -C - -o "models/$2" "$1"
}

case "${1:-gemma}" in
  mistral) get "$MISTRAL_URL" mistral-small-3.2-abliterated-Q4_K_M.gguf ;;
  gemma)   get "$GEMMA_URL" gemma-4-26b-a4b-uncensored-Q4_K_M.gguf ;;
  all)     get "$MISTRAL_URL" mistral-small-3.2-abliterated-Q4_K_M.gguf
           get "$GEMMA_URL" gemma-4-26b-a4b-uncensored-Q4_K_M.gguf ;;
  *) echo "Usage: $0 [gemma|mistral|all]"; exit 1 ;;
esac
echo "Done. Files in ./models:"
ls -lh models
