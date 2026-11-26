<p align="center"><img src="app/compain/static/icons/mark-tile.svg" width="112" alt="Compain logo: a crescent moon with a spark"></p>

# Compain

A private, self-hosted AI roleplay chat app. Compain is a personal replacement for commercial character-chat apps like Chai. Chats and characters stay on the owner's server, and the hosted model is limited to a free daily quota, so cost is not tied to a subscription.

## Status

Version 1.14.0 (paused on 2026-11-26): web app (English and German), Android app, API, Server Management, live sync, story memory, relationship, backups, Docker with PostgreSQL and a self-hosted model, and tests (92 API tests, 145 browser checks). See [agent.md](agent.md) for the exact state, the open points and how to release; every change is in [CHANGELOG.md](CHANGELOG.md).

**Continue the work:** read [agent.md](agent.md) (current status, open points, release steps), then [technical.md](technical.md).

## Files

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Project overview (this file) |
| [concept.md](concept.md) | Goal, users, screens, all version 1 features, server management, content rules |
| [technical.md](technical.md) | Stack, decisions, hosted API providers, data model, architecture, risks |
| [design/mockup.html](design/mockup.html) | Approved clickable design (open in a browser) |
| [CHANGELOG.md](CHANGELOG.md) | Every release, newest first (also shown in the app) |
| [claude.md](claude.md) | Working rules for Claude Code in this repo |
| [agent.md](agent.md) | Hand-off note: current status, open points, layout, commands, how to release |
| [mobile_app/README.md](mobile_app/README.md) | The Android app: build, install, update |
| `examples/demo-characters.json` | 50 test characters to import |
| `examples/modern-character.json` | "Modern life" pack: 100 characters (70 women, 30 men, 2015–2030, all adults) to import |
| `graphify-out/` | Knowledge-graph output from the graphify skill |

## Getting started

Requirements: Docker with Compose.

1. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `COMPAIN_SECRET_KEY`, and `COMPAIN_ADMIN_PASSWORD` (at least 12 characters).
2. Start: `docker compose up -d`. This builds the app, runs the database migrations and starts the model server, which downloads Gemma 4 (about 17 GB) on the first start. Until the download is done, the app shows the model as not reachable.
3. Check: `curl http://localhost:8080/api/health`
4. Stop: `docker compose down`

Update: `git pull` and `docker compose up -d`. Nothing else is needed.

The model:

- **Self-hosted (free, unlimited):** Gemma 4 by default. `LLM_MODEL=mistral` in `.env` uses Mistral, `LLM_MODEL=none` no self-hosted model (with `COMPAIN_MODEL_BASE_URL=mock` for a test reply).
- **Graphics card (much faster):** with an NVIDIA card run `./scripts/llm.sh gpu` (back to the processor: `./scripts/llm.sh cpu`). See *Graphics card* below.
- **Hosted (free tier or paid):** choose the provider in Server Management, Hosted API, enter the key, and press "Test connection".

Only the app, the database and the model start by default. The built-in HTTPS proxy (Caddy) stays off; see *Install on the server*, step 6.

Open http://localhost:8080 for the app. The design reference is `design/mockup.html`.

Run the API tests (needs Python 3.12): `cd app && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m pytest -q`

Run the browser tests against the running stack on a fresh database (local data is backed up and restored): `cd app/e2e && npm install`, then `./scripts/test-browser.sh` (needs Chromium; see agent.md).

## Install on the server

1. Get the code: `git clone -b develop git@github.com:ZockerDream/Compain.git /opt/docker/Compain && cd /opt/docker/Compain`
2. Legal pages: `cp .impressum-example .impressum` and `cp .datenschutz-example .datenschutz`, then enter your own details (required: the app does not start without these files).
3. Settings: `cp .env.example .env`, then set real values for `POSTGRES_PASSWORD`, `COMPAIN_SECRET_KEY` (long random text, for example `openssl rand -hex 32`, keep it safe) and `COMPAIN_ADMIN_PASSWORD`. Everything else already fits (Gemma 4 on the processor).
4. Start: `docker compose up -d`. The first start downloads the model (about 17 GB, roughly an hour); `docker compose logs -f llm` shows it.
5. Open `http://<server-ip>:8080`, log in as `admin`, then in Server Management, Models, press "Run speed test".
6. HTTPS, one of the two:
   - **Your own reverse proxy (nginx, Traefik, Nginx Proxy Manager, …):** point it to `http://<server>:8080`. It must pass on WebSockets (path `/ws`, for live updates) and the header `X-Forwarded-Proto`, and must not buffer responses (replies are streamed). If the proxy runs on the same server, `COMPAIN_PORT=127.0.0.1:8080` in `.env` keeps the app reachable only through the proxy.
   - **Built-in Caddy (only without your own proxy):** point a domain to the server, set `COMPAIN_DOMAIN` and `COMPOSE_PROFILES=https` in `.env`, open ports 80 and 443, and run `docker compose up -d`.

   Then turn on "HTTPS is set up" in Server Management, Domain & HTTPS.
7. Optional test characters: Characters → **Import card**, choose `examples/demo-characters.json` (50 characters with placeholder pictures, public in the Community).
8. Backups run every night (Server Management, Backups). They are stored in the `compain-data` volume; copy them off the server from time to time.

Update later: `git pull` and `docker compose up -d` (the app is rebuilt and the migrations run on start). `./scripts/update.sh` does the same with a few checks.

## Graphics card

A reply is much faster when the model runs on an NVIDIA graphics card. llama.cpp puts as much of the model into the graphics memory as fits and keeps the rest in RAM, so a card with less memory than the model (Gemma: 17 GB) still helps a lot.

1. Once, install the NVIDIA Container Toolkit so Docker can use the card (Rocky/RHEL; on Debian/Ubuntu see NVIDIA's guide):
   ```
   curl -sL https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
   sudo dnf install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
   Under WSL the Windows NVIDIA driver is enough; do not install a driver inside WSL.
2. Switch: `./scripts/llm.sh gpu`. Back to the processor: `./scripts/llm.sh cpu`. `./scripts/llm.sh status` shows the current choice.

The script writes the choice into `.env` (`LLM_DEVICE=gpu` and `COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml`), so `docker compose up -d` keeps it. Without it the model runs on the processor, which is right for a server without a graphics card. Server Management, Overview shows where the model runs. `LLM_GPU_RESERVE_MB` (default 1024) is the graphics memory left free for the desktop.

## Phones and the Android app

- **Android app:** the server offers the newest APK (Settings → *Download the app* in the phone's browser). Install it, enter the server address, log in. Updates: Settings → App → *Update to …* in the app. Building it: `mobile_app/build.sh`, see [mobile_app/README.md](mobile_app/README.md).
- **Web app:** open Compain over HTTPS in Chrome or Safari on the phone and choose "Install app" / "Add to Home Screen".

## Updates

On the server, in the Compain folder: `git pull` and `docker compose up -d`. The app is rebuilt, the database migrated, and browsers and the Android app load the new version by themselves. A new Android app version, when there is one, is offered in the app under Settings → App.
