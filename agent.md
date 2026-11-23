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
- Backend v0 in `app/` (FastAPI, SQLAlchemy, PostgreSQL). 14 API tests pass (SQLite).
- `docker compose up --build` runs the app with PostgreSQL. Verified: health check, admin login, character creation, adults-only check, chat streaming (mock model) with both messages stored.

Not done yet (next, in this order):
1. Connect the UI: replace the mockup's canned data with calls to the API, keep the mockup's look. Login, chats (streaming), characters, community, settings, Server Management.
2. Measure Mistral Small 3.2 and Gemma 4 26B-A4B on the server (tokens per second, memory). Set `COMPAIN_MODEL_BASE_URL` to the real runtime.
3. Story memory: generate `chats.summary` automatically (every 40 messages).
4. Backups: nightly `pg_dump` and picture files, with the settings from Server Management, and restore.
5. Live sync between devices (WebSocket).
6. Character card import (SillyTavern V1/V2 JSON, PNG V2, plain text) and export endpoints.
7. Server Management endpoints for domain, HTTPS, sessions, models, backups, storage and logs (only settings and users exist so far).
8. Migrations with Alembic instead of `create_all`.

Known gaps and risks:
- The adults-only check is a keyword and age heuristic in `app/compain/content.py`. It is not complete. Community review by the admin is the second safety layer.
- The real-person rule is not checked by code yet.
- Sessions use a cookie without `Secure` until HTTPS is set up.
- Lockout and "stay logged in" work in the API, not yet in the UI.
- The Compose file uses the `mock` model by default.

## Layout

- `docker-compose.yml`: `db` (PostgreSQL 16) and `app` (the API on port 8080). Reads `.env`.
- `.env.example`: all variables. Copy to `.env` and set real passwords.
- `app/`: the FastAPI service.
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

- Tests: `cd app && ./.venv/bin/python -m pytest -q`
- Run with Docker: `docker compose up --build -d`
- Health check: `curl http://localhost:8080/api/health`
- Stop: `docker compose down` (keeps the database volume; add `-v` only to delete all data)
