#!/usr/bin/env bash
# Browser checks (app/e2e/run.mjs) on a fresh database, without losing the local data:
# back up the database and the pictures, empty the database, run the checks, restore both.
# Usage: ./scripts/test-browser.sh            (needs: cd app/e2e && npm install, once)
# The model must be running; a reply can take minutes on a processor (REPLY_TIMEOUT below).
set -u
cd "$(dirname "$0")/.."
KEEP=$(mktemp -d)
echo "Backup in $KEEP"
docker compose exec -T db pg_dump -U compain compain > "$KEEP/before.sql" || { echo "pg_dump failed, nothing changed"; exit 1; }
mkdir -p "$KEEP/pictures"
docker compose cp app:/srv/app/data/pictures/. "$KEEP/pictures/" >/dev/null 2>&1

restore() {
  docker compose stop app >/dev/null 2>&1
  docker compose exec -T db psql -q -U compain compain -c "drop schema public cascade; create schema public;" >/dev/null 2>&1
  docker compose exec -T db psql -q -U compain compain < "$KEEP/before.sql" >/dev/null
  docker compose start app >/dev/null 2>&1; sleep 4
  docker compose exec -T -u root app sh -c 'rm -f /srv/app/data/pictures/*'
  docker compose cp "$KEEP/pictures/." app:/srv/app/data/pictures/ >/dev/null 2>&1
  docker compose exec -T -u root app chown -R compain:compain /srv/app/data/pictures
  echo "Local data restored (backup kept in $KEEP)."
}
trap restore EXIT

docker compose up --build -d app >/dev/null 2>&1
docker compose exec -T db psql -q -U compain compain -c "drop schema public cascade; create schema public;" >/dev/null 2>&1
docker compose restart llm app >/dev/null 2>&1
for i in $(seq 1 40); do curl -sf localhost:8080/api/health >/dev/null && break; sleep 3; done
for i in $(seq 1 100); do docker compose ps llm --format '{{.Status}}' | grep -q healthy && break; sleep 5; done
(cd app/e2e && BASE_URL=http://localhost:8080 REPLY_TIMEOUT=300000 node run.mjs 2>&1 | grep -v "^PASS")
