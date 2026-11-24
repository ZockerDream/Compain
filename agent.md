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

Last updated: 2026-11-23 (night).

Done (version 1, verified with tests):
- One-time age question ("Are you 18 or older?") at the first login of every account, enforced by the API.
- Login with 48-hour and "stay logged in" sessions, lockout, invite-code sign-up, maintenance mode with a notice, log out everywhere. Secure cookie behind HTTPS.
- Characters: create, edit, delete (owner rules), adults-only check, pictures (PNG/JPG/WebP, size limit from settings), card import (SillyTavern JSON V1/V2, PNG cards, plain text), publish to Community with admin review, add from Community.
- Chats: greeting opens the chat, streaming replies, roleplay system prompt with reply length and reply language, important messages (max 10, always in context), story summary every 40 messages, unread counts, pinning, search and filters, per-chat model, export (one chat, all chats, characters, everything).
- Live sync between devices (WebSocket at `/ws`).
- Per-user preferences on the server (theme, appearance, reply length, context, reply language, interface language).
- German and English interface (`static/i18n.js`).
- Server Management, all ten sections: overview (disk, endpoints), users, characters (review queue, card import switch), hosted API (provider presets, encrypted key, connection test, limits), access and security (sign-up, invite codes, sessions, lockout, password length, log out everyone), domain and HTTPS, models (default model, name, speed test), backups (nightly, retention, pictures, run now, download, restore), storage (upload limit, disk warning, cleanup), logs and maintenance (maintenance mode, notice, audit log).
- Backups: `pg_dump` + pictures as `.tar.gz`; restore tested end to end on PostgreSQL 17.
- Docker Compose: app, PostgreSQL 17, optional `llm-mistral` / `llm-gemma` (llama.cpp) and `https` (Caddy) profiles.
- Tests: 33 API tests (`app/tests`), 34 browser checks against the Docker build (`app/e2e`, desktop and phone, German interface).

- Models measured (technical.md, "Model test results"): Gemma 4 26B-A4B uncensored is the default (10–13 tokens/s here), Mistral Small 3.2 the alternative (2–3.5 tokens/s). The browser tests also pass against the real Gemma model.

Open:
1. Android app (later, by design).
2. Test adult scenarios with Gemma on the server before relying on it.
3. Real-person rule is not checked by code; the admin review is the safeguard.
4. Alembic migrations: for now `db.py` adds new columns on start (`ADDED_COLUMNS`). Move to Alembic before the data model changes a lot.
5. Unread counts are per chat, not per device.

Known risks:
- The adults-only check is a keyword and age heuristic (`app/compain/content.py`). Admin review is the second layer.
- Changing `COMPAIN_SECRET_KEY` makes the stored hosted API key unreadable (enter it again).
- Restoring a backup replaces all data and logs out sessions created after the backup.
- Free hosted providers change limits and policies without notice.

## Layout

- `docker-compose.yml`: `db` (PostgreSQL 17), `app` (API and web UI on port 8080), optional profiles `llm-mistral`, `llm-gemma` (llama.cpp on port 8081 inside Docker) and `https` (Caddy on 80/443). Reads `.env`.
- `Caddyfile`: HTTPS reverse proxy for `COMPAIN_DOMAIN`.
- `models/`: GGUF model files (git-ignored, several GB).
- `.env.example`: all variables. Copy to `.env` and set real passwords.
- `app/`: the FastAPI service and the web UI.
  - `compain/static/`: `index.html`, `app.js` (plain JavaScript, no build), `i18n.js` (German), `style.css` and `sprite.svg` (from the mockup).
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
  - `compain/cards.py`: character card import.
  - `compain/ws.py`: live sync hub and `/ws` endpoint.
  - `compain/llm.py`: OpenAI-compatible streaming client. `mock` URL gives a test reply.
  - `compain/routes/`: `auth.py`, `characters.py`, `chats.py` (streaming replies), `admin.py`.
  - `compain/main.py`: app factory, router wiring, first admin from environment.
  - `tests/test_api.py`: API tests.
  - `.venv/`: local virtualenv (git-ignored).
- `design/mockup.html`: approved design.

## Commands

- API tests: `cd app && ./.venv/bin/python -m pytest -q`
- Browser tests: `cd app/e2e && npm install && BASE_URL=http://localhost:8080 node run.mjs`
- Run with Docker: `docker compose up --build -d`
- Health check: `curl http://localhost:8080/api/health`
- With the model: `./scripts/download-models.sh`, set `COMPAIN_MODEL_BASE_URL=http://llm-gemma:8081/v1` in `.env`, then `docker compose --profile llm-gemma up -d`
- Browser tests with a real model: add `REPLY_TIMEOUT=300000` (milliseconds) before `node run.mjs`
- With HTTPS: set `COMPAIN_DOMAIN` in `.env`, then `docker compose --profile https up -d`
- Stop: `docker compose down` (keeps the database volume; add `-v` only to delete all data)
