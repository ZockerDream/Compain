# Agent Guide: Compain

This file is for any AI agent working on Compain, not only Claude Code. It is also the hand-off note: if work stops, the next agent continues from "Current status".

## What this project is

A private, self-hosted, multi-user AI roleplay chat app. It replaces a paid character-chat service for the owner and the users the owner invites. Read [README.md](README.md), [concept.md](concept.md), and [technical.md](technical.md) first.

## Before you change anything

1. Read [technical.md](technical.md) for the stack, decisions, data model, and risks.
2. Open [design/mockup.html](design/mockup.html) to see the approved look and behaviour of every screen.
3. Read "Current status" below.
4. Check `graphify-out/` if it exists, for an overview of the code.
5. Ask the owner if a decision is still marked open and affects the change.

## Principles

- Privacy first: data stays on the owner's server.
- Simple over clever: a personal tool with a few users, not a product.
- No secrets in the repository. `.env` is git-ignored; `.env.example` is the template.
- Enforce the content rules in [concept.md](concept.md) in the code, not only in the docs.
- The mockup is the visual and behavioural reference. Its canned replies and fake login are not real behaviour.
- Every architecture decision goes into [technical.md](technical.md).

## Done means

- Tests pass: `cd app && ./.venv/bin/python -m pytest -q`.
- The change runs in Docker: `docker compose up --build`, and `curl http://localhost:8080/api/health` returns ok.
- Relevant docs are updated, and the UI still matches [design/mockup.html](design/mockup.html).
- Nothing from the non-goals in [concept.md](concept.md) was added.
- Model behaviour changes are tested with the roleplay prompt before they are called done.

## Current status

Last updated: 2026-11-24 (version 1.3.0).

Done (release 1.3.0, verified with tests):
- Login with 48-hour and "stay logged in" sessions, two-factor login (TOTP, QR code, 8 recovery codes), login guard per address and account (`loginguard.py`, in memory) plus 30 tries per address in 10 minutes, invite-code sign-up, maintenance mode with notice, device list with "Log out", password change, deleting the own account with all data. One-time 18+ question.
- Characters: owner rules, adults-only check, pictures, card import, publish with admin review, add from Community. Community likes and usage counts (`character_likes`), most liked first.
- Chats: Markdown in messages (rendered with DOM nodes only), streaming, Stop (the written part is saved when the connection closes; llama.cpp cancels the task), Regenerate with versions (`messages.variants`, `variant_index`), Continue (`POST /api/chats/{id}/reply`), edit and delete messages, rewind (`DELETE .../messages/{id}/after`), search in a chat, switching the character in a running chat (`messages.character_id` keeps the author; other characters' lines are marked `[Name]:` in the prompt), persona (`users.persona_*`) in the system prompt, story summary, important messages (own lines and replies, each labelled with its speaker in the prompt), unread counts, export, sound when a reply is complete.
- Help page: FAQ, guide, Markdown reference with live preview (`static/help.js`, English and German) and support tickets (`routes/help.py`, tables `tickets` and `ticket_messages`, migration 0003) with internal notes, status, priority, category, assignment, unread badge and live updates. Admins can set a user's password in Server Management → Users.
- 1.3.0: search over all chats (`GET /api/chats/search`), bookmarks (`messages.bookmarked`, migration 0004, never in the prompt), chat export as Markdown and import of export files (`POST /api/export/import`), card V3, card lists and card export (`GET /api/characters/{id}/card`), model waiting line with status events (`modelqueue.py`, setting `model_slots`).
- Profile picture and own glass background picture per user (`data/avatars`, `data/backgrounds`).
- Four designs, seven colour themes, per account and live on all devices; German and English interface.
- Changelog, Impressum (`.impressum`) and Datenschutzerklärung (`.datenschutz`) as popovers and pages; Compose refuses to start without the two files.
- Server Management, all ten sections; backups with restore, retention and a second place (`BACKUP_OFFSITE_DIR`).
- Installable web app (PWA): `manifest.webmanifest`, `sw.js` (never caches `/api`), icons in `static/icons/`. Bump `CACHE` in `sw.js` with every release.
- Database migrations with Alembic (`app/compain/migrations`, run on start by `db.init_db`); databases from before 0.4.0 are completed and stamped as 0001 automatically.
- Self-hosted model: Gemma 4 26B-A4B uncensored (default), Mistral Small 3.2 as alternative.
- Tests: 68 API tests (`app/tests`) and 86 browser checks against the Docker build (`app/e2e`), passing with the real Gemma model on a fresh database. Run the browser checks on a fresh database; data left over from many runs makes some checks pick other chats.
- `scripts/update.sh` for updates on the server, `scripts/download-models.sh` for the models.

Open:
1. Android app as a native app (the PWA covers installing on phones for now).
2. Test adult scenarios with Gemma on the server before relying on it.
3. Real-person rule is not checked by code; the admin review is the safeguard.
4. HTTPS: tested locally through Caddy with its own certificate for `localhost` (health, Secure cookie, HTTP→HTTPS redirect, live sync over wss). Not yet tested with a real domain and Let's Encrypt.
5. Install and measure on the owner's server (i7-8700, 64 GB).

Known risks:
- The adults-only check is a keyword and age heuristic (`app/compain/content.py`).
- Changing `COMPAIN_SECRET_KEY` makes the stored hosted API key and the 2FA secrets unreadable (2FA must then be set up again).
- The login guard lives in memory: a restart clears the counters.
- Restoring a backup replaces all data and logs out sessions created after the backup.
- Prompt processing is slow on CPU: after switching the character or with long chats, the first reply can take a minute or two.
- New migration: change `models.py`, then generate with Alembic (see technical.md) and check the file by hand (booleans need `sa.false()`, foreign keys need names).

## Layout

- `docker-compose.yml`: `db` (PostgreSQL 17), `app` (API and web UI on port 8080), optional profiles `llm-mistral`, `llm-gemma` (llama.cpp on port 8081 inside Docker) and `https` (Caddy on 80/443). Reads `.env`.
- `Caddyfile`: HTTPS reverse proxy for `COMPAIN_DOMAIN`.
- `models/`: GGUF model files (git-ignored, several GB).
- `.env.example`: all variables. Copy to `.env` and set real passwords.
- `app/`: the FastAPI service and the web UI.
  - `compain/static/`: `index.html`, `app.js` (plain JavaScript, no build), `i18n.js` (German), `help.js` (FAQ, guide and Markdown texts in both languages), `style.css` and `sprite.svg` (from the mockup).
  - `e2e/`: browser tests (`node run.mjs`, needs `npm install` in that folder). Screenshots go to `e2e/screens/` (not committed).
  - `Dockerfile`, `requirements.txt`, `requirements-dev.txt`.
  - `compain/config.py`: settings from environment variables.
  - `compain/db.py`: engine, session factory, table creation.
  - `compain/models.py`: tables (users, sessions, characters, chats, messages, api_usage, server_settings, audit_log).
  - `compain/security.py`: scrypt password hashing, hashed session tokens.
  - `compain/deps.py`: database session, current user, admin check.
  - `compain/content.py`: adults-only check.
  - `compain/settings.py`: server settings (Server Management) with validation.
  - `compain/secret.py`: encryption of the stored API key.
  - `compain/backup.py`: backup, restore, retention, nightly schedule check.
  - `compain/cards.py`: character card import (V1–V3, lists) and V2 card export (also inside the PNG).
  - `compain/modelqueue.py`: waiting line for the self-hosted model and its `/health` state.
  - `compain/ws.py`: live sync hub and `/ws` endpoint.
  - `compain/llm.py`: OpenAI-compatible streaming client. `mock` URL gives a test reply.
  - `compain/routes/`: `auth.py`, `characters.py`, `chats.py` (streaming replies), `admin.py`, `help.py` (support tickets).
  - `compain/main.py`: app factory, router wiring, first admin from environment.
  - `tests/test_api.py`: API tests.
  - `.venv/`: local virtualenv (git-ignored).
- `design/mockup.html`: approved design.

## Commands

- API tests: `cd app && ./.venv/bin/python -m pytest -q`
- Browser tests: `cd app/e2e && npm install && BASE_URL=http://localhost:8080 node run.mjs` (the admin login comes from `.env`; `ADMIN_USER`/`ADMIN_PW` override it)
- Run with Docker: `docker compose up --build -d`
- Health check: `curl http://localhost:8080/api/health`
- With the model: `./scripts/download-models.sh`, set `COMPAIN_MODEL_BASE_URL=http://llm-gemma:8081/v1` in `.env`, then `docker compose --profile llm-gemma up -d`
- Browser tests with a real model: add `REPLY_TIMEOUT=300000` (milliseconds) before `node run.mjs`
- With HTTPS: set `COMPAIN_DOMAIN` in `.env`, then `docker compose --profile https up -d`
- Stop: `docker compose down` (keeps the database volume; add `-v` only to delete all data)
