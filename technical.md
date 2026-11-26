# Compain: Technical Notes

Design reference: [design/mockup.html](design/mockup.html). The UI must match it. Features are described in [concept.md](concept.md).

## Status

Version 1.14.0 (2026-11-26) with the Android app 1.1.0. All decisions below are built; the current state and open points are in [agent.md](agent.md), every change in [CHANGELOG.md](CHANGELOG.md).

## Requirements

- Runs as Docker containers (Docker Compose). Developed in WSL2, runs on the owner's server.
- CPU only on the server: Intel Core i7-8700, 64 GB RAM, no GPU.
- Browser access with login over HTTPS (own reverse proxy, or the built-in Caddy). Starts on IP and port; the domain is set in Server Management.
- Multi-user with admin role.
- Live sync of chats across devices in real time (WebSocket).
- Streaming replies.
- Responsive web UI for desktop and phone (the mockup's bottom bar on phones), installable as a web app; Android app (APK) in `mobile_app/`.
- Character import (card V1/V2/V3 as JSON or in PNG, JSON lists, plain text) and card export (V2 in the PNG picture or JSON); export of characters and chats (JSON, one chat also as Markdown) and import of these files.
- Story memory for chats of about 500 messages. Up to 10 important messages per chat, always in context.
- Hosted API limited to 100 messages per user per day, and a total daily cap (default 500). Self-hosted models unlimited.
- Login: 48 hours, or permanent with "remember me". Phones stay logged in. Lockout after failed logins.
- Nightly backups, configured in Server Management, with restore and encryption.

## Decisions

| Area | Decision | Status |
| --- | --- | --- |
| Deployment | Docker Compose: `app`, `db` (PostgreSQL 17), `llm` (llama.cpp, downloads its model on the first start), optional `caddy` (profile `https`). Update = `git pull` + `docker compose up -d` (`pull_policy: build`). | built |
| Database | PostgreSQL 17 in Docker (same major version as `pg_dump` in the app image). Alembic migrations 0001–0006, run on every start. | built |
| Backend | Python 3.12 with FastAPI, SQLAlchemy 2, httpx. Password hashing with scrypt from the standard library. | built |
| Model client | OpenAI-compatible streaming via httpx. `mock` URL for tests. | built |
| Realtime | WebSocket `/ws` for live sync between devices; the open chat is updated in place. | built |
| Frontend | Plain HTML/CSS/JavaScript served by the backend, no build chain. Based on the mockup's CSS tokens. | built |
| Auth | Hashed passwords (scrypt), sessions 48 h or "stay logged in", lockout, TOTP two-factor, roles Admin/User, login with username or email. | built |
| HTTPS | Own reverse proxy (recommended; must pass WebSockets and `X-Forwarded-Proto`, no buffering) or the built-in Caddy (`COMPOSE_PROFILES=https`, off by default). | built |
| Model runtime (self-hosted) | llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server`, `server-cuda` for an NVIDIA card), GGUF on CPU by default. Gemma 4 26B-A4B uncensored. | built |
| Model access (hosted) | OpenAI-compatible API, provider picked in Server Management. Per-user daily limit and a total daily cap. | built |
| Model switch | Per chat: self-hosted or hosted API, from the models the admin allows. | built |
| Backups | Nightly `pg_dump` plus pictures, retention, restore, a second place (`BACKUP_OFFSITE_DIR`). | built |
| Theme | Four designs, seven colour themes, light/dark/system, per account and live on all devices. Contrast of text on accent colours worked out at run time. | built |
| Android app | Native WebView app (Java, no libraries) in `mobile_app/`, opens the own server; in-app update from `/static/android/`. | built (1.10.0, update in 1.12.0) |

## Hosted API providers

The admin chooses one provider in Server Management. The list below is the recommendation shown in the mockup. Limits and prices change often, so the admin should check each provider's page before relying on them.

| Provider | Type | Free tier / price | Notes |
| --- | --- | --- | --- |
| Groq | Free | Rate-limited per model, roughly 1,000 to 14,400 requests per day | Very fast, OpenAI-compatible. Hosts only its own model list. **Recommended to start.** |
| OpenRouter | Free | 20+ free models behind one endpoint | Easy to compare models, including community roleplay models. Limits and policies depend on the upstream model. |
| Cerebras | Free | Free tier, OpenAI-compatible | Free-tier context capped at about 8K tokens, tight for long chats. |
| Mistral | Free plan | Rate-limited | Same model family as the first test model. Check whether a phone number is needed. |
| Google AI Studio | Free, filtered | About 1,500 requests per day on some Gemini models | Strict content filter. Not suitable for adult roleplay. |
| Venice | Paid | About $0.20 input and $0.90 output per million tokens (Dolphin-based model, third-party listing) | Built around uncensored models. **Recommended paid option.** |
| DeepSeek | Paid | About $0.14 to $0.24 input and $0.96 output per million tokens (Flash models) | Low price. The content policy for adult roleplay is not verified. Test before use. |

Sources: [OpenRouter: free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/), [Analytics Vidhya: free LLM APIs 2026](https://analyticsvidhya.com/blog/2026/01/top-free-llm-apis), [KDnuggets: free LLM API providers 2026](https://kdnuggets.com/5-free-llm-api-providers-you-can-use-in-2026), [PricePerToken: Venice Dolphin pricing](https://pricepertoken.com/pricing-page/model/cognitivecomputations-dolphin-mistral-24b-venice-edition).

## Model candidates (self-hosted)

| Order | Model | Notes |
| --- | --- | --- |
| 1 | Mistral Small 3.2 abliteration (about 24B) | Expected 1–2 tokens per second on this CPU. |
| 2 | Gemma 4 26B-A4B uncensored (mixture-of-experts, about 4B active) | Expected to be faster on CPU. Unverified until tested. |

Test both on the same roleplay prompt. Measure tokens per second, memory use, and whether the character stays consistent. Choose the quantization (for example Q4 or Q5) during testing. Install and speed-test through Server Management, Models.

## Data model

See `app/compain/models.py` for the exact columns. Summary:

- `users`: id, username, email (unique, may be empty), display name, role (admin or user), status, password hash, persona, avatar, 2FA, storage and API overrides, preferences (JSON: design, theme, languages, reply length, context).
- `sessions`: user, token hash, created, expires, "stay logged in" flag, device.
- `characters`: id, owner, name, tagline, description, personality, greeting, scenario, picture path, visibility (private, pending review, public), tags, source format on import.
- `chats`: id, owner, character, title, pinned, created, updated, model, story summary (`summary`, `summary_upto`), read marker, relationship (`relation_*`).
- `messages`: id, chat, sender (user or character), content, created, important flag, bookmarked flag (only for the user, never in the prompt).
- `api_usage`: user, date, message count (hosted API only).
- `settings`: key and value for server-wide options set in Server Management.
- `audit_log`: time, user, action, detail.
- `tickets`: id, user, subject, category (question, bug, idea, account, other), priority (low, normal, high), status (open, in_progress, answered, closed), assigned admin, created, updated, read markers for the user and the admins.
- `ticket_messages`: id, ticket, author, from admin, internal note, content, created.
- Backups are files (`compain-*.tar.gz` in the data volume and the second place), not a table.

## Architecture

```
Browser / phone / Android app (WebView)
        |  HTTPS + login + WebSocket
        v
Reverse proxy (own proxy, or Caddy with COMPOSE_PROFILES=https)
        |
        v
Docker: FastAPI app
  - web UI (design/mockup.html as the reference)
  - auth, roles, sessions, lockout
  - characters, community review, chats, important messages, story memory
  - live sync (WebSocket)
  - admin: Server Management (ten sections)
        |                          |
        v                          v
PostgreSQL (volume)        Model provider
                            - self-hosted (llama.cpp, CPU or NVIDIA card)
                            - hosted API (OpenAI-compatible, limits per user and in total)

Backups run inside the app (nightly pg_dump + pictures) -> data volume and BACKUP_OFFSITE_DIR
```

## Configuration

All variables are in `.env.example` (copy to `.env`, never commit it):

- `POSTGRES_PASSWORD`, `COMPAIN_SECRET_KEY` (sessions, encryption of the API key and 2FA secrets), `COMPAIN_ADMIN_USERNAME`, `COMPAIN_ADMIN_PASSWORD` (first admin).
- Model: `LLM_MODEL` (gemma, mistral, none), `COMPAIN_MODEL_NAME`, `COMPAIN_MODEL_BASE_URL` (`http://llm:8081/v1`, `mock` for tests), `LLM_THREADS`, `LLM_CONTEXT`, `LLM_SLOTS`, `LLM_DEVICE` and `COMPOSE_FILE` (written by `scripts/llm.sh`), `LLM_GPU_RESERVE_MB`.
- Hosted API: `COMPAIN_HOSTED_API_BASE_URL`, `COMPAIN_HOSTED_API_KEY`, `COMPAIN_HOSTED_MODEL` (can also be set in Server Management).
- Network: `COMPAIN_PORT` (default 8080, `127.0.0.1:8080` behind an own proxy), `COMPAIN_DOMAIN` and `COMPOSE_PROFILES=https` for the built-in Caddy.
- `BACKUP_OFFSITE_DIR`: second place for backups.

Domain, backup time and retention, daily limits, sign-up mode, model settings (context, slots, relationship interval) are set in Server Management.

## Risks and checks

- **HTTP on IP and port:** until HTTPS is set up, login details travel unencrypted on the network. Do not expose the server outside the home network before HTTPS works.
- **Content rules:** the adults-only and real-person rules from [concept.md](concept.md) must be enforced where characters are created, edited, and published, not only described in the docs.
- **Model quality:** Gemma 4 26B-A4B and Mistral Small 3.2 may still drift or refuse. Test before committing.
- **Hosted provider policies:** free providers can change limits or policies at any time. Check the content policy of the chosen provider before relying on it for adult roleplay.
- **Mockup vs. build:** the mockup uses canned replies and no real login. Every behaviour (lockout, limits, sync, backups) must be built and tested for real.

## Built (version 1)

- **Age check:** `users.age_confirmed_at`. Until it is set, every API call except `/api/auth/me`, `/confirm-age`, `/logout`, `/logout-all` and `/preferences` returns 403 `age_confirmation_required`. The web app shows the question once; "No" ends the session. Both answers go into the audit log.
- **Auth:** session cookie (`compain_session`, HTTP-only, `Secure` behind HTTPS) or Bearer token. The Android app uses the cookie of its WebView. Session lengths, lockout and password length come from Server Management. Sign-up only with an invite code when the admin allows it.
- **Characters:** owner-only edit and delete, admins all. Adults-only check on save and import. Pictures checked by file content. Card import: SillyTavern JSON V1/V2, PNG with an embedded card (the PNG becomes the picture), plain text.
- **Chats:** streaming over Server-Sent Events. Context = system prompt (character, roleplay rules, reply length, reply language) + story summary + important messages (own lines and replies, each with its speaker: persona name or "User", or the character) + the last N messages. Turns are merged and start with a user turn, because Mistral and Gemma chat templates need alternating roles. The greeting is the first message.
- **Story memory:** after every 40 new messages, a background task asks the same model for a summary of at most 180 words and stores it.
- **Accounts (1.6.0):** `users.email` (lower case, unique, may be empty for old accounts and accounts an admin creates without one). Login takes the username or the email (`accounts.find_login`: with @ it is an email, otherwise the username, exact or else ignoring case); the failed-login lock counts per account, whichever name was used. Usernames are unique ignoring case and contain no @. `PATCH /api/auth/account` changes username and email with the current password; admins change role, username and email in `PATCH /api/admin/users/{id}`, but not their own role.
- **Relationship (1.5.0):** columns `relation_*` on `chats` (trust and affection 0-100, mood, note, enabled, `relation_set`, `relation_upto`). After every `relation_every` new messages (setting, default 10, 0 = only on request) a background task sends the newest 20 messages and the current state to the same model and asks for JSON; each score moves at most 25 points per check. Once judged or set by hand, one line goes right before the reply, as a story note on the last user turn ("How X feels about Y right now ..."; until 1.13 it was in the system prompt). `PATCH /api/chats/{id}/relation` sets it, `POST .../relation/check` judges it now, `DELETE .../relation` resets it. The request waits in the model queue like a reply (about 7 s with Gemma on the CPU).
- **Character assistant (1.5.0):** `POST /api/characters/assist` with an idea; the default model writes one JSON object with all character fields (about 30 s with Gemma on the CPU). The draft is trimmed to the field limits and runs through the adults-only check; nothing is saved until the user saves in the editor. `llm.extract_json` reads the first JSON object even inside code fences.
- **Live sync:** WebSocket `/ws`. The server sends `{"type": "chats"}` to all devices of a user when their chats change; the client fetches the open chat and the list again and reconciles them in place (1.13.0): unchanged message nodes stay, new ones are added, changed ones replaced; the input field, the scroll position and open panels are untouched.
- **Hosted API:** provider, endpoint, model and key set in Server Management (key encrypted with a key derived from `COMPAIN_SECRET_KEY`), or from `.env`. Limits per user and in total per day.
- **Backups:** `pg_dump --clean` plus pictures in one `.tar.gz` under the data volume. Nightly at the configured time, retention in days, restore in one transaction with a 30-second lock timeout.
- **Maintenance mode:** blocks everyone except admins with HTTP 503 and shows the notice.
- **Web UI:** plain JavaScript served by the API from `compain/static/`, built on the mockup's CSS. German via `i18n.js` (translates interface strings only, never user text).
- **Designs:** `<html data-design data-palette data-mode data-bg>` plus CSS variables `--g-blur`, `--g-alpha`, `--g-dim`. Glass designs blur panels over `#bg-layer`; on phones the blur is off. Modern designs hide the sidebar and show `#topnav-pills`; phones keep the bottom bar.
- **Changelog and Impressum:** `routes/legal.py` serves `/api/changelog`, `/api/legal/impressum` and simple pages; the web app shows both as popovers (text rendered with text nodes only). The Impressum file is bind-mounted read-only (`create_host_path: false`).
- **Migrations:** Alembic in `app/compain/migrations` (0001 = schema 0.3.0, 0002 = 0.4.0, 0003 = help tickets in 1.1.0, 0004 = message bookmarks in 1.3.0, 0005 = relationship in 1.5.0, 0006 = user email in 1.6.0). `db.init_db` runs `upgrade head` on every start; a database without `alembic_version` gets the old extra columns and is stamped 0001 first. New revision: change `models.py`, then run Alembic's `revision --autogenerate` against a database at head (see the snippet in the 0.4.0 commit), and fix booleans (`sa.false()`) and constraint names by hand.
- **Chat tools:** `POST /api/chats/{id}/reply` with `mode` `next` (continue) or `regenerate` (new version stored in `messages.variants`); `POST .../messages/{id}/variant`; `PATCH .../messages/{id}` (text, important); `DELETE .../messages/{id}` and `.../after`. Replies run as server tasks (`chats.Run` in `RUNS`, one per chat): the SSE response only follows the task (`follow`), so a closed connection does not stop it. Stop = `POST /api/chats/{id}/stop` cancels the task; `stream_reply` catches the cancellation and saves the part written so far. `GET /api/chats/{id}/stream` replays and follows a running reply (204 if none); `chat_out.replying` tells the browser to follow it; a second reply in the same chat gets 409.
- **Search and bookmarks (1.3.0):** `GET /api/chats/search?q=` searches the text of all own messages (case-insensitive `ILIKE`, `%` and `_` escaped, at least 2 characters, newest 50, with a snippet). `PATCH .../messages/{id}` takes `bookmarked`; `GET /api/chats/bookmarks` lists them. Both routes sit before `/{chat_id}`.
- **Export and import (1.3.0):** `GET /api/export/chat/{id}?format=md|json`. `POST /api/export/import` takes the body of a `compain-chat-v1`, `compain-chats-v1`, `compain-all-v1` or `compain-characters-v1` file; everything comes in new. Characters are matched by name (own, then public), else created from `character_card` (adults-only check). At most 200 chats, 5000 messages per chat, 10 important. Cards: `cards.parse_cards` (V1–V3, `ccv3` before `chara`, JSON arrays), `GET /api/characters/{id}/card?format=auto|png|json` writes a V2 card (`cards.png_with_card` puts a `chara` tEXt chunk before IEND).
- **Model queue (1.3.0):** `modelqueue.QUEUE` (in memory, one uvicorn process) lets at most `model_slots` replies and story summaries of the self-hosted model run at once; the rest wait in order. The reply stream sends `{"status": "queued", "position": n}`, `loading`/`down` (llama.cpp `/health` gives 503 while loading; waits up to 10 minutes) and `thinking` before the first `delta`. `GET /api/chats/model-status` gives state, slots, running and waiting; the admin overview has `model_queue`. Keep `model_slots` equal to `LLM_SLOTS`.
- **Account security:** TOTP (`totp.py`, RFC 6238, secret encrypted with `COMPAIN_SECRET_KEY`), recovery codes as SHA-256 hashes, sessions with `mfa_pending` (5 minutes, only `/login/2fa`), device data (`user_agent`, `ip`, `last_seen`), login guard in memory (`loginguard.py`).
- **PWA:** manifest and service worker at the root (`/manifest.webmanifest`, `/sw.js`). Since 1.9.1 static files are sent with `Cache-Control: no-cache` (`NoCacheStatic` in `main.py`), the service worker is network-first (cache only offline) and a new service worker reloads open windows once, so updates show at once. The API is never cached. Service workers need HTTPS or localhost.
- **Replies:** copied speaker marks ("[Name]:", "Name:") are removed before saving; a stop before the first real word saves nothing.
- **Help and tickets:** `routes/help.py` under `/api/tickets` (list with `scope=mine|all` and `status`, `summary` for the badge, `admins`, create, get (sets the read marker), `POST .../messages` (admins: `internal`, `status`), `PATCH` (owner: close or reopen; admins: status, priority, category, `assigned_to`/`unassign`), `DELETE` (admins)). Others' tickets return 404. Up to 10 open tickets per user, 5000 characters per post. A user's post reopens an answered or closed ticket; an admin's post sets "answered" and assigns the ticket if nobody has it. Live event `{"type": "tickets"}` to the owner and all admins. Admin actions go to the audit log. Help texts (FAQ, guide, Markdown) are in `static/help.js` in English and German; FAQ and guide are shown with the document renderer (`mdDoc`, full Markdown built as DOM nodes, also used for the changelog, Impressum and Datenschutz), the Markdown reference with the chat renderer. Migration 0003.
- **Context and prompt cache (1.14.0):** the window of recent messages starts at a multiple of `window_step(limit)` (a third of *Context sent to the model*), and when the token budget is exceeded it drops whole steps; the relationship note and the language reminder are appended to the last user turn. The start of the prompt therefore stays the same for many replies and llama.cpp reuses its cache (also its RAM cache across slots). Measured: 4 s instead of 27–33 s for one more message in a 3400-token chat.
- **Readable colours (1.11.0):** `applyContrast` in app.js reads `--accent`, `--bg`, `--fg` and sets `--accent-fg` (white or near black, whichever has more contrast), `--accent-bg`, `--accent-2` (gradient end, away from the text colour) and `--accent-text` (accent text with at least 4.5:1 on the background). The browser checks measure all seven themes in light and dark mode.
- **Android app (1.10.0–1.12.0):** `mobile_app/`, Java, no AndroidX. One activity with a WebView: immersive full screen (insets for keyboard and camera cut-out as padding), file chooser, `DownloadManager` with the session cookie, back gesture through the WebView history, other sites in the browser, server address in `SharedPreferences` (`assets/setup.html`), offline page. Bridge `window.CompainApp`: `serverUrl`, `version`, `versionCode`, `setServer`, `changeServer`, `retry`, `startUpdate(url, sha256)`. Update: download from the own server only, SHA-256 check, `PackageInstaller` session, Android asks the user; needs `REQUEST_INSTALL_PACKAGES`. The web app shows Settings → App only when the bridge exists (full-screen chats in `localStorage`). Build: `mobile_app/build.sh` in Docker (JDK 17, Gradle 8.10, AGP 8.7, SDK 35), signed with `mobile_app/keystore/`, published with `version.json` to `app/compain/static/android/`.
- **Logo (1.9.0):** crescent mark with a spark; `static/icons/mark.svg`, `mark-tile.svg` (login), `icon.svg` (favicon, sidebar), `app-icon*.svg` and the PNGs rendered from them; the Android launcher icons in `mobile_app/app/src/main/res/`.
- **Import with pictures (1.7.0):** `export.import_payload` (also used by the card import for Compain lists); `_fetch_picture` follows at most three redirects and refuses non-public addresses (`_public_host`).
- **Tests:** 92 API tests and 145 browser checks (desktop and phone at 412 × 891, German interface, app mode, contrast) pass against the Docker build with the real Gemma model.

## Model test results

Measured on 2026-11-24 on the development machine (WSL2, 15 GB RAM, llama.cpp CPU build, 6 threads, Q4_K_M files, one German and one English roleplay prompt). The owner's server (i7-8700, 64 GB RAM) has a slower CPU but enough memory to keep the whole model in RAM, so expect numbers in the same range.

| Model | File | Size | Writing speed | Reading the prompt | Roleplay quality |
| --- | --- | --- | --- | --- | --- |
| **Gemma 4 26B-A4B uncensored** (recommended) | `gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf` (llmfan46 on Hugging Face) | 16.8 GB | **9.8–12.8 tokens/s** | 9–19 tokens/s | Very good: stays in character, rich German and English, follows the length guide |
| Mistral Small 3.2 24B abliterated | `huihui-mistral-small-3.2-24b-instruct-2506-abliterated-q4_k_m.gguf` (maerong3 on Hugging Face) | 14.3 GB | 1.9–3.5 tokens/s | 2–6.5 tokens/s | Good, but short replies and slow |

Notes:
- Gemma 4 is a mixture-of-experts model: only about 4B parameters work per token, so it is about four times faster on CPU. A medium reply (about 150 tokens) takes 15–25 seconds.
- Gemma 4 "thinks" before answering by default. The model servers start with `--reasoning off`; without it, replies come back empty.
- Reading a long history is the slow part on CPU (about 100 tokens/s on the development machine). llama.cpp reuses the unchanged start of the prompt between turns, so only new messages are read; since 1.14.0 the prompt is built to keep that start unchanged (see Built).
- Content limits were not tested beyond normal roleplay. Test adult scenarios yourself before relying on either model.

Decision: **Gemma 4 26B-A4B uncensored is the default self-hosted model** (`LLM_MODEL=gemma`). Mistral stays available as `LLM_MODEL=mistral`.

Decision (1.3.5): **GPU or CPU is chosen on the server, not in the app.** The `llm` service runs on the processor (`llama.cpp:server`); `docker-compose.gpu.yml` switches it to `llama.cpp:server-cuda` with an NVIDIA device reservation (`--fit` puts as much as fits into graphics memory, `--fit-target LLM_GPU_RESERVE_MB` stays free). `scripts/llm.sh gpu|cpu` writes `LLM_DEVICE` and `COMPOSE_FILE` into `.env` and restarts; the app only shows `LLM_DEVICE` (Server Management, Overview). Switching from inside the app would need the Docker socket in the app container, which means root on the host; not worth it for a setting that changes with the machine. A GPU reservation cannot start without an NVIDIA card, so the processor is the default.

Decision (1.4.0): **`git pull` and `docker compose up -d` are the whole update.** The model server is no longer behind a profile but always starts; it downloads its model itself on the first start (to `*.part`, renamed when complete, resumes after a restart). The app has `pull_policy: build`, so it is rebuilt on every `up` (cached layers make that quick). Migrations already ran on start. Only `.env`, `.impressum` and `.datenschutz` are set up once by hand, because they hold passwords and personal details.

## Decisions log

- Project folder created at `/opt/docker/Compain`.
- Owner requirements recorded: Docker, login, no GPU, uncensored roleplay, German and English, adjustable reply and context length, one fixed character per chat (switching mid-chat was removed in 1.3.1), story memory, multi-user, live sync, PostgreSQL, nightly backups, HTTPS.
- First model test set: Mistral Small 3.2 abliteration, Gemma 4 26B-A4B uncensored.
- Design approved: `design/mockup.html` is the reference for all screens (version 6 of the mockup).
- Backend v0 built and tested: API, Docker Compose with PostgreSQL, 14 tests passing.
- Version 1 features built: Server Management (all sections), live sync, story memory, card import, backups with restore, German interface, provider picker. PostgreSQL moved to 17.
- Hosted provider list added (Groq, OpenRouter, Cerebras, Mistral, Google AI Studio, Venice, DeepSeek).
- 2026-11-24: models measured; Gemma 4 26B-A4B uncensored chosen as the default self-hosted model.
- 2026-11-24: GPU/CPU switch on the server (1.3.5); `git pull` + `docker compose up -d` as the whole update (1.4.0).
- 2026-11-25: relationship and character assistant (1.5.0); email accounts and roles (1.6.0); Caddy off by default (1.6.2); import with pictures (1.7.0); delete chats, account reply language, full Markdown docs (1.8.0); crescent logo (1.9.0); no-cache static files (1.9.1); Android app (1.10.0); contrast (1.11.0); in-app app update (1.12.0).
- 2026-11-26: help written out (1.12.1); in-place chat updates, no automatic keyboard (1.13.0); prompt-cache friendly context (1.14.0). Project paused.
