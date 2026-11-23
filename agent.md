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

Last updated: 2026-11-23.

Done:
- Planning and design: concept, technical notes, approved mockup (`design/mockup.html`, mockup version 6).
- Backend (FastAPI, SQLAlchemy, PostgreSQL): login with 48-hour and "stay logged in" sessions, lockout, characters (owner rules, adults-only check, picture upload, publish and review, add from Community), chats with streaming replies, important messages (max 10), per-chat model choice, hosted daily limits (per user and total), JSON export (characters, chats, everything, one chat), profile name, admin users, admin limits, review queue.
- Real web UI served by the API at `/` (`app/compain/static/`): login, Home, Chats (list, filters, streaming conversation, important, pin, model, export), Characters (create, edit, delete, picture, publish, chat), Community (featured, add, chat), Profile (name, exports), Settings (five themes, System/Light/Dark, reply length, context, log out), Server Management (overview, users, characters review, hosted API limits; other sections show a "planned" note).
- Tests: 14 API tests (`app/tests`), 23 browser checks (`app/e2e`) against the Docker build, desktop and phone.
- Docker Compose runs the app and PostgreSQL. Data (pictures) is in a volume.

Not done yet (next, in this order):
1. Measure Mistral Small 3.2 and Gemma 4 26B-A4B on the server (tokens per second, memory). Set `COMPAIN_MODEL_BASE_URL` to the real runtime (llama.cpp or Ollama). Not in Compose yet.
2. Story memory: generate `chats.summary` automatically (every 40 messages). Only the field exists.
3. Server Management sections still missing: Domain and HTTPS (Caddy), Access and security controls (sign-up, sessions, lockout settings), Models, Backups (nightly pg_dump, restore), Storage cleanup, Logs and maintenance.
4. Live sync between devices (WebSocket). Right now a second device sees new messages only after reloading.
5. Character card import (SillyTavern V1/V2 JSON, PNG V2, plain text).
6. Unread counts and "Summary updated" in the UI (the mockup shows them; the API does not track them yet).
7. Alembic migrations instead of `create_all`.
8. Settings for reply length and context are stored per device (localStorage), not on the server yet.

Known gaps and risks:
- The adults-only check is a keyword and age heuristic in `app/compain/content.py`. It is not complete. Admin review of community characters is the second layer.
- The real-person rule is not checked by code yet.
- Sessions use a cookie without `Secure` until HTTPS is set up.
- The Compose file uses the `mock` model by default, so replies are test text.
- Browser tests need Chromium at `/opt/google/chrome/chrome` (linked to the Playwright download) and its system libraries (installed with dnf on this machine).

## Layout

- `docker-compose.yml`: `db` (PostgreSQL 16) and `app` (the API on port 8080). Reads `.env`.
- `.env.example`: all variables. Copy to `.env` and set real passwords.
- `app/`: the FastAPI service and the web UI.
  - `compain/static/`: `index.html`, `app.js` (plain JavaScript, no build), `style.css` and `sprite.svg` (taken from the mockup).
  - `e2e/`: browser tests (`node run.mjs`, needs `npm install` in that folder). Screenshots go to `e2e/screens/` (not committed).
  - `Dockerfile`, `requirements.txt`, `requirements-dev.txt`.
  - `compain/config.py`: settings from environment variables.
  - `compain/db.py`: engine, session factory, table creation.
  - `compain/models.py`: tables (users, sessions, characters, chats, messages, api_usage, server_settings, audit_log).
  - `compain/security.py`: scrypt password hashing, hashed session tokens.
  - `compain/deps.py`: database session, current user, admin check.
  - `compain/content.py`: adults-only check.
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
- Stop: `docker compose down` (keeps the database volume; add `-v` only to delete all data)
