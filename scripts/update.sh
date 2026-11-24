#!/usr/bin/env bash
# Update Compain on the server: get the newest code, check the files that are not in git, rebuild, check health.
# Usage: ./scripts/update.sh   (the same as "git pull" and "docker compose up -d --build", with checks)
set -euo pipefail
cd "$(dirname "$0")/.."
ARGS=()
grep -q '^COMPAIN_DOMAIN=.\+' .env 2>/dev/null && ARGS+=(--profile https)

for f in .env .impressum .datenschutz; do
  if [ ! -s "$f" ]; then
    echo "Missing or empty: $f  (templates: .env.example, .impressum-example, .datenschutz-example)"; exit 1
  fi
done
if grep -q "Max Mustermann" .impressum .datenschutz; then
  echo "Warning: .impressum or .datenschutz still contains the example name (Max Mustermann)."
fi

echo "1/4 Getting the newest code"
git pull --ff-only
echo "2/4 Building and starting (migrations run on start)"
docker compose "${ARGS[@]}" up -d --build
echo "3/4 Waiting for the app"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8080/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
echo "4/4 Health:"
curl -fsS http://localhost:8080/api/health && echo
docker compose "${ARGS[@]}" ps
