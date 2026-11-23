# Compain

A private, self-hosted AI roleplay chat app. Compain is a personal replacement for commercial character-chat apps like Chai. Chats and characters stay on the owner's server, and the hosted model is limited to a free daily quota, so cost is not tied to a subscription.

## Status

Planning and design complete for version 1. The clickable design is approved. The backend (v0) is built and runs in Docker with PostgreSQL. The browser UI is not connected to it yet. See [agent.md](agent.md) for the exact state and next steps.

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

The model is `mock` by default, so the app answers with a test reply. Set `COMPAIN_MODEL_BASE_URL` (self-hosted) or `COMPAIN_HOSTED_API_BASE_URL` plus `COMPAIN_HOSTED_API_KEY` (hosted) to use a real model.

To see the design, open `design/mockup.html` in a browser. It works offline except for the two web fonts. The mockup is not connected to the API yet.

Run the tests (needs Python 3.12): `cd app && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m pytest -q`
