# Compain: Technical Notes

Design reference: [design/mockup.html](design/mockup.html). The UI must match it. Features are described in [concept.md](concept.md).

## Status

Decisions from the owner's answers and the approved mockup. Items marked **open** need a choice during the first build.

## Requirements

- Runs as Docker containers (Docker Compose). Developed in WSL2, deployed later on the owner's server.
- CPU only on the server: Intel Core i7-8700, 64 GB RAM, no GPU.
- Browser access with login over HTTPS. Starts on IP and port; the domain is set in Server Management.
- Multi-user with admin role.
- Live sync of chats across devices in real time (WebSocket).
- Streaming replies.
- Responsive web UI for desktop and phone (the mockup's bottom bar on phones). Android app later.
- Character import (card V1/V2/V3 as JSON or in PNG, JSON lists, plain text) and card export (V2 in the PNG picture or JSON); export of characters and chats (JSON, one chat also as Markdown) and import of these files.
- Story memory for chats of about 500 messages. Up to 10 important messages per chat, always in context.
- Hosted API limited to 100 messages per user per day, and a total daily cap (default 500). Self-hosted models unlimited.
- Login: 48 hours, or permanent with "remember me". Phones stay logged in. Lockout after failed logins.
- Nightly backups, configured in Server Management, with restore and encryption.

## Decisions

| Area | Decision | Status |
| --- | --- | --- |
| Deployment | Docker Compose with app and PostgreSQL now. Model runtime, backup job and reverse proxy to be added. | app + db built, rest open |
| Database | PostgreSQL 17 in Docker (same major version as `pg_dump` in the app image). Tables created on start; new columns added by `db.py` (`ADDED_COLUMNS`); Alembic later. | decided, built |
| Backend | Python 3.12 with FastAPI, SQLAlchemy 2, httpx. Password hashing with scrypt from the standard library. | decided, built |
| Model client | OpenAI-compatible streaming via httpx. `mock` URL for tests. | built |
| Realtime | WebSocket for live sync between devices. | recommended, open |
| Frontend | Web UI served by the backend, responsive. Plain HTML/JS or a light framework, no heavy build chain. The mockup's CSS tokens and components are the starting point. | recommended, open |
| Auth | Accounts with hashed passwords. Sessions: 48 hours, or the "stay logged in" duration. Lockout after failed tries. Admin role. | recommended, open |
| HTTPS | Reverse proxy (for example Caddy) with automatic certificate. Starts on IP and port; domain set in Server Management. | recommended, open |
| Model runtime (self-hosted) | llama.cpp server or Ollama, running GGUF models on CPU. Both expose an OpenAI-compatible API. | recommended, open |
| Model access (hosted) | OpenAI-compatible API behind a provider interface. Per-user daily limit and a total daily cap. | recommended, open |
| Model switch | Per user: self-hosted or hosted API. Per chat: model can be chosen from the models the admin allows. | decided |
| Backups | Nightly `pg_dump` plus character picture files. Location, retention, encryption set in Server Management. | decided (details open) |
| Theme | Five color palettes as CSS tokens (`data-palette`), light, dark and system as `data-mode`. Stored per device. | decided |
| Android app | Later. Plan: wrap the same web app, or make it a PWA first. | later |

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

## Data model (planned)

- `users`: id, username, display name, role (admin or user), status, password hash, storage and API overrides, language, preferences (JSON).
- `sessions`: user, token hash, created, expires, "stay logged in" flag, device.
- `characters`: id, owner, name, tagline, description, personality, greeting, scenario, picture path, visibility (private, pending review, public), tags, source format on import.
- `chats`: id, owner, character, title, pinned, created, updated, model.
- `messages`: id, chat, sender (user or character), content, created, important flag, bookmarked flag (only for the user, never in the prompt).
- `summaries`: chat, text, updated (story memory).
- `api_usage`: user, date, message count (hosted API only).
- `settings`: key and value for server-wide options set in Server Management.
- `audit_log`: time, user, action, detail.
- `tickets`: id, user, subject, category (question, bug, idea, account, other), priority (low, normal, high), status (open, in_progress, answered, closed), assigned admin, created, updated, read markers for the user and the admins.
- `ticket_messages`: id, ticket, author, from admin, internal note, content, created.
- `backups`: time, size, type (daily or weekly), location, encrypted flag.

## Architecture (draft)

```
Browser / phone  (later: Android app)
        |  HTTPS + login + WebSocket
        v
Reverse proxy (HTTPS)
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
                            - self-hosted (llama.cpp / Ollama, CPU)
                            - hosted API (OpenAI-compatible, limits per user and in total)

Docker: backup job (nightly pg_dump + pictures) -> configured location
```

## Configuration (planned)

- `COMPAIN_DB_URL`: PostgreSQL connection string
- `COMPAIN_SECRET_KEY`: session signing key
- `COMPAIN_ADMIN_PASSWORD_HASH`: first admin account
- `COMPAIN_HOSTED_API_BASE_URL`: hosted provider endpoint (can also be set in Server Management)
- `COMPAIN_HOSTED_API_KEY`: hosted provider key, never stored in the repository
- `COMPAIN_SELF_HOSTED_URL`: local model endpoint

Domain, ports, backup location and retention, daily limits, sign-up mode, and model settings are set in Server Management, not in environment variables.

## Risks and checks

- **HTTP on IP and port:** until HTTPS is set up, login details travel unencrypted on the network. Do not expose the server outside the home network before HTTPS works.
- **Content rules:** the adults-only and real-person rules from [concept.md](concept.md) must be enforced where characters are created, edited, and published, not only described in the docs.
- **Model quality:** Gemma 4 26B-A4B and Mistral Small 3.2 may still drift or refuse. Test before committing.
- **Hosted provider policies:** free providers can change limits or policies at any time. Check the content policy of the chosen provider before relying on it for adult roleplay.
- **Mockup vs. build:** the mockup uses canned replies and no real login. Every behaviour (lockout, limits, sync, backups) must be built and tested for real.

## Built (version 1)

- **Age check:** `users.age_confirmed_at`. Until it is set, every API call except `/api/auth/me`, `/confirm-age`, `/logout`, `/logout-all` and `/preferences` returns 403 `age_confirmation_required`. The web app shows the question once; "No" ends the session. Both answers go into the audit log.
- **Auth:** session cookie (`compain_session`, HTTP-only, `Secure` behind HTTPS) or Bearer token (for the Android app later). Session lengths, lockout and password length come from Server Management. Sign-up only with an invite code when the admin allows it.
- **Characters:** owner-only edit and delete, admins all. Adults-only check on save and import. Pictures checked by file content. Card import: SillyTavern JSON V1/V2, PNG with an embedded card (the PNG becomes the picture), plain text.
- **Chats:** streaming over Server-Sent Events. Context = system prompt (character, roleplay rules, reply length, reply language) + story summary + important messages (own lines and replies, each with its speaker: persona name or "User", or the character) + the last N messages. Turns are merged and start with a user turn, because Mistral and Gemma chat templates need alternating roles. The greeting is the first message.
- **Story memory:** after every 40 new messages, a background task asks the same model for a summary of at most 180 words and stores it.
- **Live sync:** WebSocket `/ws`. The server sends `{"type": "chats"}` to all devices of a user when their chats change; the client reloads from the API.
- **Hosted API:** provider, endpoint, model and key set in Server Management (key encrypted with a key derived from `COMPAIN_SECRET_KEY`), or from `.env`. Limits per user and in total per day.
- **Backups:** `pg_dump --clean` plus pictures in one `.tar.gz` under the data volume. Nightly at the configured time, retention in days, restore in one transaction with a 30-second lock timeout.
- **Maintenance mode:** blocks everyone except admins with HTTP 503 and shows the notice.
- **Web UI:** plain JavaScript served by the API from `compain/static/`, built on the mockup's CSS. German via `i18n.js` (translates interface strings only, never user text).
- **Designs:** `<html data-design data-palette data-mode data-bg>` plus CSS variables `--g-blur`, `--g-alpha`, `--g-dim`. Glass designs blur panels over `#bg-layer`; on phones the blur is off. Modern designs hide the sidebar and show `#topnav-pills`; phones keep the bottom bar.
- **Changelog and Impressum:** `routes/legal.py` serves `/api/changelog`, `/api/legal/impressum` and simple pages; the web app shows both as popovers (text rendered with text nodes only). The Impressum file is bind-mounted read-only (`create_host_path: false`).
- **Migrations:** Alembic in `app/compain/migrations` (0001 = schema 0.3.0, 0002 = 0.4.0, 0003 = help tickets in 1.1.0, 0004 = message bookmarks in 1.3.0). `db.init_db` runs `upgrade head` on every start; a database without `alembic_version` gets the old extra columns and is stamped 0001 first. New revision: change `models.py`, then run Alembic's `revision --autogenerate` against a database at head (see the snippet in the 0.4.0 commit), and fix booleans (`sa.false()`) and constraint names by hand.
- **Chat tools:** `POST /api/chats/{id}/reply` with `mode` `next` (continue) or `regenerate` (new version stored in `messages.variants`); `POST .../messages/{id}/variant`; `PATCH .../messages/{id}` (text, important); `DELETE .../messages/{id}` and `.../after`. Stop = the browser aborts the request; the stream generator catches the cancellation and saves the part written so far.
- **Search and bookmarks (1.3.0):** `GET /api/chats/search?q=` searches the text of all own messages (case-insensitive `ILIKE`, `%` and `_` escaped, at least 2 characters, newest 50, with a snippet). `PATCH .../messages/{id}` takes `bookmarked`; `GET /api/chats/bookmarks` lists them. Both routes sit before `/{chat_id}`.
- **Export and import (1.3.0):** `GET /api/export/chat/{id}?format=md|json`. `POST /api/export/import` takes the body of a `compain-chat-v1`, `compain-chats-v1`, `compain-all-v1` or `compain-characters-v1` file; everything comes in new. Characters are matched by name (own, then public), else created from `character_card` (adults-only check). At most 200 chats, 5000 messages per chat, 10 important. Cards: `cards.parse_cards` (V1–V3, `ccv3` before `chara`, JSON arrays), `GET /api/characters/{id}/card?format=auto|png|json` writes a V2 card (`cards.png_with_card` puts a `chara` tEXt chunk before IEND).
- **Model queue (1.3.0):** `modelqueue.QUEUE` (in memory, one uvicorn process) lets at most `model_slots` replies and story summaries of the self-hosted model run at once; the rest wait in order. The reply stream sends `{"status": "queued", "position": n}`, `loading`/`down` (llama.cpp `/health` gives 503 while loading; waits up to 10 minutes) and `thinking` before the first `delta`. `GET /api/chats/model-status` gives state, slots, running and waiting; the admin overview has `model_queue`. Keep `model_slots` equal to `LLM_SLOTS`.
- **Account security:** TOTP (`totp.py`, RFC 6238, secret encrypted with `COMPAIN_SECRET_KEY`), recovery codes as SHA-256 hashes, sessions with `mfa_pending` (5 minutes, only `/login/2fa`), device data (`user_agent`, `ip`, `last_seen`), login guard in memory (`loginguard.py`).
- **PWA:** manifest and service worker at the root (`/manifest.webmanifest`, `/sw.js`); static files cache-first with background refresh, the page network-first, the API never cached. Service workers need HTTPS or localhost.
- **Replies:** copied speaker marks ("[Name]:", "Name:") are removed before saving; a stop before the first real word saves nothing.
- **Help and tickets:** `routes/help.py` under `/api/tickets` (list with `scope=mine|all` and `status`, `summary` for the badge, `admins`, create, get (sets the read marker), `POST .../messages` (admins: `internal`, `status`), `PATCH` (owner: close or reopen; admins: status, priority, category, `assigned_to`/`unassign`), `DELETE` (admins)). Others' tickets return 404. Up to 10 open tickets per user, 5000 characters per post. A user's post reopens an answered or closed ticket; an admin's post sets "answered" and assigns the ticket if nobody has it. Live event `{"type": "tickets"}` to the owner and all admins. Admin actions go to the audit log. Help texts (FAQ, guide, Markdown) are in `static/help.js` in English and German, written in Markdown and shown with the chat renderer. Migration 0003.
- **Tests:** 68 API tests and 86 browser checks (desktop and phone, German interface) pass against the Docker build.

## Model test results

Measured on 2026-11-24 on the development machine (WSL2, 15 GB RAM, llama.cpp CPU build, 6 threads, Q4_K_M files, one German and one English roleplay prompt). The owner's server (i7-8700, 64 GB RAM) has a slower CPU but enough memory to keep the whole model in RAM, so expect numbers in the same range.

| Model | File | Size | Writing speed | Reading the prompt | Roleplay quality |
| --- | --- | --- | --- | --- | --- |
| **Gemma 4 26B-A4B uncensored** (recommended) | `gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf` (llmfan46 on Hugging Face) | 16.8 GB | **9.8–12.8 tokens/s** | 9–19 tokens/s | Very good: stays in character, rich German and English, follows the length guide |
| Mistral Small 3.2 24B abliterated | `huihui-mistral-small-3.2-24b-instruct-2506-abliterated-q4_k_m.gguf` (maerong3 on Hugging Face) | 14.3 GB | 1.9–3.5 tokens/s | 2–6.5 tokens/s | Good, but short replies and slow |

Notes:
- Gemma 4 is a mixture-of-experts model: only about 4B parameters work per token, so it is about four times faster on CPU. A medium reply (about 150 tokens) takes 15–25 seconds.
- Gemma 4 "thinks" before answering by default. The model servers start with `--reasoning off`; without it, replies come back empty.
- Reading a long history is the slow part on CPU. llama.cpp reuses the unchanged start of the prompt between turns, so only new messages are read.
- Content limits were not tested beyond normal roleplay. Test adult scenarios yourself before relying on either model.

Decision: **Gemma 4 26B-A4B uncensored is the default self-hosted model** (`--profile llm-gemma`). Mistral stays available as `--profile llm-mistral`.

## Decisions log

- Project folder created at `/opt/docker/Compain`.
- Owner requirements recorded: Docker, login, no GPU, uncensored roleplay, German and English, adjustable reply and context length, character switching mid-chat, story memory, multi-user, live sync, PostgreSQL, nightly backups, HTTPS.
- First model test set: Mistral Small 3.2 abliteration, Gemma 4 26B-A4B uncensored.
- Design approved: `design/mockup.html` is the reference for all screens (version 6 of the mockup).
- Backend v0 built and tested: API, Docker Compose with PostgreSQL, 14 tests passing.
- Version 1 features built: Server Management (all sections), live sync, story memory, card import, backups with restore, German interface, provider picker. PostgreSQL moved to 17.
- Hosted provider list added (Groq, OpenRouter, Cerebras, Mistral, Google AI Studio, Venice, DeepSeek).
- 2026-11-24: models measured; Gemma 4 26B-A4B uncensored chosen as the default self-hosted model.
