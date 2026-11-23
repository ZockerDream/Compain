# Compain

A private, self-hosted AI roleplay chat app. Compain is a personal replacement for commercial character-chat apps like Chai. Chats and characters stay on the owner's server, and the hosted model is limited to a free daily quota, so cost is not tied to a subscription.

## Status

Version 1 is built: web app (English and German), API, Server Management, live sync, story memory, backups, Docker with PostgreSQL, and tests (API and browser). Only the Android app is planned for later. See [agent.md](agent.md) for the exact state.

## Files

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Project overview (this file) |
| [concept.md](concept.md) | Goal, users, screens, all version 1 features, server management, content rules |
| [technical.md](technical.md) | Stack, decisions, hosted API providers, data model, architecture, risks |
| [design/mockup.html](design/mockup.html) | Approved clickable design (open in a browser) |
| [claude.md](claude.md) | Working rules for Claude Code in this repo |
| [agent.md](agent.md) | Guidance for any AI agent working on this project |
| `graphify-out/` | Knowledge-graph output from the graphify skill (empty for now) |

## Getting started

Requirements: Docker with Compose.

1. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `COMPAIN_SECRET_KEY`, and `COMPAIN_ADMIN_PASSWORD` (at least 12 characters).
2. Start: `docker compose up --build -d`
3. Check: `curl http://localhost:8080/api/health`
4. Stop: `docker compose down`

The model is `mock` by default, so the app answers with a test reply. To use a real model:

- **Self-hosted (free, unlimited):** put a GGUF file in `models/` (see technical.md for the tested files), set `COMPAIN_MODEL_BASE_URL=http://llm-mistral:8081/v1` in `.env`, and start with `docker compose --profile llm-mistral up -d`. Use `llm-gemma` for the Gemma model.
- **Hosted (free tier or paid):** choose the provider in Server Management, Hosted API, enter the key, and press "Test connection".

For HTTPS from outside your home network: point a domain to the server, set `COMPAIN_DOMAIN` in `.env`, open ports 80 and 443, and start with `docker compose --profile https up -d`.

Open http://localhost:8080 for the app. The design reference is `design/mockup.html`.

Run the API tests (needs Python 3.12): `cd app && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m pytest -q`

Run the browser tests against the running stack: `cd app/e2e && npm install && BASE_URL=http://localhost:8080 node run.mjs` (needs Chromium; see agent.md).
