#!/usr/bin/env bash
# Downloads the self-hosted models into ./models ahead of time (resumes if interrupted).
# Not needed normally: the llm service downloads its model on the first start by itself.
# Usage: ./scripts/download-models.sh [gemma|mistral|all]   (default: gemma, the recommended model)
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/models.sh
mkdir -p models

get() {
  local file; file="$(model_file "$1")"
  [ -s "models/$file" ] && { echo "$file is already there."; return; }
  echo "Downloading $file (this can take an hour) ..."
  curl -L --fail -C - -o "models/$file.part" "$(model_url "$1")"
  mv "models/$file.part" "models/$file"
}

case "${1:-gemma}" in
  gemma|mistral) get "$1" ;;
  all) get gemma; get mistral ;;
  *) echo "Usage: $0 [gemma|mistral|all]"; exit 1 ;;
esac
echo "Done. Files in ./models:"
ls -lh models
