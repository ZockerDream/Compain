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

Last updated: 2026-11-26 (version 1.14.0, Android app 1.1.0). The project is paused here; everything below works and is tested.

Done (all verified with tests; details per release in [CHANGELOG.md](CHANGELOG.md), design decisions in [technical.md](technical.md)):
- **Accounts and security:** username and email (log in with either), 48-hour and "stay logged in" sessions, two-factor login (TOTP, recovery codes), login guard per address and account, invite-code sign-up, maintenance mode, device list, password and account changes, deleting the own account. Roles *Admin* / *User* set in Server Management (not your own). One-time 18+ question.
- **Characters:** owner rules, adults-only check (`content.py`), pictures, card import/export (V1–V3, PNG and JSON, lists), Compain character lists with pictures (`picture` data URI, `picture_url` for admins, checked like uploads, no private addresses) and `visibility`, character assistant (the model drafts all fields), publish with admin review, Community with likes. `examples/demo-characters.json`: 50 test characters with placeholder pictures.
- **Chats:** streaming as server tasks (closing the connection only stops watching), Stop, Regenerate with versions, Continue, edit, delete, rewind, search in a chat and over all chats, bookmarks, important messages, story summary every 40 messages, relationship (trust, affection, mood; judged every `relation_every` messages), persona, reply length, reply language (*Same as the interface* follows the account language), export (Markdown, JSON) and import, delete a whole chat. The character of a chat is fixed. No group chats (owner decision).
- **Fast replies on CPU:** the context window moves in steps (`chats.window_step`) and the relationship note sits right before the reply, so llama.cpp reuses its prompt cache; only new messages are read (measured 4 s instead of ~30 s for one more message).
- **Smooth live updates:** the open chat is reconciled in place (`drawMessages`, `refresh` in `renderConversation`), the chat list redraws alone (`state.updateChatList`); nothing is redrawn after a reply. On touch screens the input never gets focus by itself (no keyboard popping up). Chats scroll to the end on new messages.
- **Look:** crescent logo (`static/icons/`), four designs, seven colour themes, light/dark/system, glass backgrounds, own background picture; text on accent colours and accent text are chosen by contrast in `applyContrast` (app.js), tested for all themes. German and English interface (`i18n.js`).
- **Phones:** bottom bar, chat header with back, picture, name and a ⋮ menu for all tools; tested at Galaxy S25 Ultra size (412 × 891).
- **Android app** (`mobile_app/`): native WebView app in Java, full screen, file picker, downloads, back gesture, server address on first start, Settings → App (full-screen chats, change server, **in-app update** from `/static/android/` with SHA-256 check and Android's installer). Built in Docker with `mobile_app/build.sh`, which also publishes the APK and `version.json` to `app/compain/static/android/`. The signing key is in `mobile_app/keystore/` (never committed; the owner keeps a copy).
- **Help:** FAQ, guide (including installing and updating the app, server updates), Markdown reference, support tickets with internal notes, status, priority and assignment.
- **Server:** Server Management (users, Community review, models, hosted API, security, domain, backups with restore and a second place, storage, logs, model queue), changelog, Impressum and Datenschutz popovers. Updates are `git pull` and `docker compose up -d`; static files are sent with `Cache-Control: no-cache` and the service worker is network-first, so browsers and the app pick up a new version at once. Built-in Caddy is off by default (`COMPOSE_PROFILES=https`); behind an own proxy, `COMPAIN_PORT=127.0.0.1:8080`.
- **Model:** Gemma 4 26B-A4B uncensored on llama.cpp (default), Mistral Small 3.2 as alternative; CPU by default, NVIDIA card with `./scripts/llm.sh gpu`.
- **Tests:** 92 API tests (`app/tests`) and 145 browser checks (`app/e2e/run.mjs`, desktop, phone, German interface, app mode with a simulated `window.CompainApp`, contrast of all themes), passing with the real Gemma model on a fresh database.

Open:
1. Test adult scenarios with Gemma on the server before relying on it.
2. The real-person rule is not checked by code; the admin review is the safeguard.
3. The adults-only filter is a keyword check: a character assistant draft that mentions "child" (for example a backstory "as a child") is refused. Either tell the assistant to avoid it or allow such phrases when the character's age is adult (owner to decide).
4. The Android app was not tested on an emulator here, only by the owner on a Galaxy S25 Ultra (1.0.0 works); the in-app update (1.1.0) is tested in the browser with a simulated bridge.
5. HTTPS with the built-in Caddy is tested only locally; the owner uses an own reverse proxy.
6. There is no admin function to move characters to another user. It was done once by SQL on the owner's server: `UPDATE characters SET owner_id = (SELECT id FROM users WHERE ...) WHERE ...` inside a transaction, after a backup.

Known risks:
- The adults-only check is a keyword and age heuristic (`app/compain/content.py`).
- Changing `COMPAIN_SECRET_KEY` makes the stored hosted API key and the 2FA secrets unreadable (2FA must then be set up again).
- The login guard and the model queue live in memory: a restart clears them.
- Restoring a backup replaces all data and logs out sessions created after the backup.
- Prompt processing is slow on CPU: the first reply in a chat, and one reply every `window_step` messages or after a new story summary, read the whole story (a minute or two on the server).
- Losing `mobile_app/keystore/` means installed apps cannot be updated any more (uninstall and install again).
- New migration: change `models.py`, then generate with Alembic (see technical.md) and check the file by hand (booleans need `sa.false()`, foreign keys need names).

## How to release

1. Raise the version in `app/compain/main.py` (`FastAPI(version=...)`) and `CACHE` in `app/compain/static/sw.js`.
2. Add a section at the top of [CHANGELOG.md](CHANGELOG.md) (the app shows it as the changelog).
3. If `mobile_app/` changed: raise `versionCode`/`versionName` in `mobile_app/app/build.gradle`, run `mobile_app/build.sh`, commit `app/compain/static/android/`.
4. Run the API tests and `./scripts/test-browser.sh` (browser checks on a fresh database; it backs up and restores the local data).
5. Commit on `develop` (git identity `timpner`), tag `vX.Y.Z`, push `develop` and the tag. Never commit `.env`, `.impressum`, `.datenschutz`, `models/`, `offsite-backups/` or `mobile_app/keystore/`.

## Layout

- `docker-compose.yml`: `db` (PostgreSQL 17), `app` (API and web UI on port 8080), `llm` (llama.cpp on port 8081 inside Docker, aliases `llm-gemma` and `llm-mistral`; `scripts/llm-start.sh` downloads the model named by `LLM_MODEL` on the first start, file names and addresses in `scripts/models.sh`), optional profile `https` (Caddy on 80/443, off by default; `COMPOSE_PROFILES=https` in `.env` turns it on), app port from `COMPAIN_PORT` (default 8080). The app has `pull_policy: build`, so `docker compose up -d` rebuilds it after `git pull`. `docker-compose.gpu.yml` puts `llm` on an NVIDIA card (`server-cuda` image), added through `COMPOSE_FILE` by `scripts/llm.sh gpu`. Reads `.env`.
- `Caddyfile`: HTTPS reverse proxy for `COMPAIN_DOMAIN` (only with `COMPOSE_PROFILES=https`).
- `mobile_app/`: the Android app (see [mobile_app/README.md](mobile_app/README.md)): `MainActivity.java` (WebView, full screen, file picker, downloads, update via `PackageInstaller`, `window.CompainApp` bridge), `assets/setup.html` and `offline.html`, `build.sh` and `docker/Dockerfile` (JDK 17, Gradle, Android SDK 35). `keystore/` and `dist/` are git-ignored.
- `examples/demo-characters.json`: 50 test characters (Compain character list).
- `scripts/`: `llm-start.sh` and `models.sh` (model server), `llm.sh` (CPU/GPU), `update.sh`, `download-models.sh`, `test-browser.sh` (browser checks on a fresh database with backup and restore).
- `models/`: GGUF model files (git-ignored, several GB).
- `.env.example`: all variables. Copy to `.env` and set real passwords.
- `app/`: the FastAPI service and the web UI.
  - `compain/static/`: `index.html`, `app.js` (plain JavaScript, no build), `i18n.js` (German), `help.js` (FAQ, guide and Markdown texts in both languages), `style.css`, `designs.css`, `designs-palettes.css`, `sprite.svg`, `sw.js` (service worker), `manifest.webmanifest`, `icons/` (crescent logo, favicon, app icons) and `android/` (the newest APK and `version.json`, written by `mobile_app/build.sh`).
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
  - `compain/accounts.py`: username and email rules, login lookup.
  - `compain/migrations/`: Alembic revisions 0001–0006.
  - `compain/routes/`: `auth.py`, `characters.py` (also the character assistant), `chats.py` (streaming replies, context building, story memory, relationship), `admin.py`, `help.py` (support tickets), `export.py` (export and import, pictures in character lists), `media.py` (pictures, card import/export), `legal.py` (changelog, Impressum, Datenschutz).
  - `compain/main.py`: app factory, router wiring, first admin from environment.
  - `tests/`: API tests (pytest).
  - `.venv/`: local virtualenv (git-ignored).
- `design/mockup.html`: approved design.

## Commands

- API tests: `cd app && ./.venv/bin/python -m pytest -q`
- Browser tests: `cd app/e2e && npm install` once, then `./scripts/test-browser.sh` (fresh database, local data backed up and restored, takes 10–15 minutes with the real model). Directly: `cd app/e2e && BASE_URL=http://localhost:8080 node run.mjs` (the admin login comes from `.env`; `ADMIN_USER`/`ADMIN_PW` override it)
- Run with Docker: `docker compose up --build -d`
- Health check: `curl http://localhost:8080/api/health`
- Start everything, including the model (downloaded on the first start): `docker compose up -d`
- On the graphics card: `./scripts/llm.sh gpu` (needs the NVIDIA Container Toolkit, see README); back: `./scripts/llm.sh cpu`
- Browser tests with a real model: add `REPLY_TIMEOUT=300000` (milliseconds) before `node run.mjs`
- With the built-in HTTPS: set `COMPAIN_DOMAIN` and `COMPOSE_PROFILES=https` in `.env`, then `docker compose up -d`
- Android app: `cd mobile_app && ./build.sh` (needs only Docker; writes `dist/` and publishes to `app/compain/static/android/`)
- Stop: `docker compose down` (keeps the database volume; add `-v` only to delete all data)
