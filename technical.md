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
- Character import (SillyTavern V1/V2 JSON, V2 in PNG, plain text), export of characters and chats.
- Story memory for chats of about 500 messages. Up to 10 important messages per chat, always in context.
- Hosted API limited to 100 messages per user per day, and a total daily cap (default 500). Self-hosted models unlimited.
- Login: 48 hours, or permanent with "remember me". Phones stay logged in. Lockout after failed logins.
- Nightly backups, configured in Server Management, with restore and encryption.

## Decisions

| Area | Decision | Status |
| --- | --- | --- |
| Deployment | Docker Compose with app and PostgreSQL now. Model runtime, backup job and reverse proxy to be added. | app + db built, rest open |
| Database | PostgreSQL 16 in Docker. Tables created on start for now; Alembic later. | decided, built |
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
- `messages`: id, chat, sender (user or character), content, created, important flag.
- `summaries`: chat, text, updated (story memory).
- `api_usage`: user, date, message count (hosted API only).
- `settings`: key and value for server-wide options set in Server Management.
- `audit_log`: time, user, action, detail.
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

## Backend v0 (built)

- Login with a session cookie (`compain_session`, HTTP-only) or a Bearer token (for the Android app later). "Stay logged in" sets the longer lifetime.
- Lockout: after 5 failed logins the account is locked for 15 minutes.
- Characters: owner-only edit and delete, admins can do all. Publish sends a character to a review queue; the admin approves or hides it.
- Chats: streaming replies over Server-Sent Events. Context = character, summary, important messages, last 60 messages.
- Hosted limit: per user per day and a total per day, read from Server Management first, then from environment defaults.
- Admin API: overview, users, settings (limits), community review queue. Other Server Management sections are not built yet.
- Web UI: plain JavaScript served by the API from `compain/static/`, built on the mockup's CSS. Uses only the API.
- Pictures: PNG, JPG or WebP up to 10 MB, checked by file content, stored in the data volume.
- Export: JSON of characters, chats, everything, and one chat.
- Tests: 14 API tests and 23 browser checks (desktop and phone) pass against the Docker build.

Environment variables are listed in `.env.example`.

## Decisions log

- Project folder created at `/opt/docker/Compain`.
- Owner requirements recorded: Docker, login, no GPU, uncensored roleplay, German and English, adjustable reply and context length, character switching mid-chat, story memory, multi-user, live sync, PostgreSQL, nightly backups, HTTPS.
- First model test set: Mistral Small 3.2 abliteration, Gemma 4 26B-A4B uncensored.
- Design approved: `design/mockup.html` is the reference for all screens (version 6 of the mockup).
- Backend v0 built and tested: API, Docker Compose with PostgreSQL, 14 tests passing.
- Hosted provider list added (Groq, OpenRouter, Cerebras, Mistral, Google AI Studio, Venice, DeepSeek).
