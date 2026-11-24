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

- **Self-hosted (free, unlimited):** download the model with `./scripts/download-models.sh` (Gemma 4, about 17 GB), set `COMPAIN_MODEL_BASE_URL=http://llm-gemma:8081/v1` in `.env`, and start with `docker compose --profile llm-gemma up -d`. For Mistral use `mistral` and `llm-mistral` instead.
- **Hosted (free tier or paid):** choose the provider in Server Management, Hosted API, enter the key, and press "Test connection".

For HTTPS from outside your home network: point a domain to the server, set `COMPAIN_DOMAIN` in `.env`, open ports 80 and 443, and start with `docker compose --profile https up -d`.

Open http://localhost:8080 for the app. The design reference is `design/mockup.html`.

Run the API tests (needs Python 3.12): `cd app && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m pytest -q`

Run the browser tests against the running stack: `cd app/e2e && npm install && BASE_URL=http://localhost:8080 node run.mjs` (needs Chromium; see agent.md).

## Install on the server

1. Get the code: `git clone -b develop git@github.com:ZockerDream/Compain.git /opt/docker/Compain && cd /opt/docker/Compain`
2. Legal pages: `cp .impressum-example .impressum` and `cp .datenschutz-example .datenschutz`, then enter your own details (required: the app does not start without these files).
3. Settings: `cp .env.example .env`, then set real values for `POSTGRES_PASSWORD`, `COMPAIN_SECRET_KEY` (long random text, keep it safe) and `COMPAIN_ADMIN_PASSWORD`. The model settings in `.env.example` already point to Gemma 4.
4. Model (about 17 GB, roughly an hour): `./scripts/download-models.sh` (Gemma 4; `mistral` or `all` for the others).
5. Start: `docker compose --profile llm-gemma up -d --build`
6. Open `http://<server-ip>:8080`, log in as `admin`, then in Server Management, Models, press "Run speed test".
7. Optional HTTPS: point a domain to the server, set `COMPAIN_DOMAIN` in `.env`, open ports 80 and 443, and add `--profile https` to the start command. Then turn on "HTTPS is set up" in Server Management, Domain & HTTPS.
8. Backups run every night (Server Management, Backups). They are stored in the `compain-data` volume; copy them off the server from time to time.

Update later: `./scripts/update.sh` (pulls, checks `.env`, `.impressum` and `.datenschutz`, rebuilds, runs the migrations, checks health).

Install as an app: open Compain over HTTPS in Chrome or Safari on the phone and choose "Install app" / "Add to Home Screen".
