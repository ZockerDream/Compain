# Compain: Concept

Design reference: [design/mockup.html](design/mockup.html). Everything shown in the mockup is part of version 1, unless it is listed under "Later".

## Problem

Commercial AI character-chat apps are useful for roleplay, but:

- Pricing tiers gate basic features such as message volume and speed.
- Prices and features change without notice.
- Chats and character definitions live on someone else's servers.
- Some services restrict adult or dark roleplay content.
- Chai has no export, so characters and chats cannot be moved out.

## Goal

A private, self-hosted roleplay app for the owner and the people the owner invites:

- Chat with AI characters in roleplay, stories, or everyday-life scenarios.
- Characters behave like people, or as the story says they are.
- Unrestricted content, including adult roleplay between consenting fictional adults.
- Runs in Docker on the owner's own server, reachable through a login over HTTPS.
- Everything (users, characters, chats, settings) stored under the owner's control.
- Free to run: self-hosted models are unlimited, and the hosted API has a daily limit.

## Users and roles

- **Multi-user.** Any number of users, each with their own login.
- **Admin:** everything a user can do, plus Server Management and editing or deleting any character.
- **User:** creates characters, edits and deletes only the characters they created, and chats privately.

## Screens (version 1)

| Screen | What it does |
| --- | --- |
| Login | Username and password. "Stay logged in" keeps the login permanently on that device. |
| Home | Greeting, the last open chat, quick actions, usage stats for today, recent activity, and a profile card. |
| Chats | Searchable chat list with filters (All, Unread, Important), pinned chats, and groups (Pinned, Today, Earlier). Opens the conversation beside the list. |
| Characters | The user's own characters, with chat, edit and delete actions, and a tile to create a new one. |
| Community | Characters published by other users, with a featured character, filters by genre, and "Add" to put one in the user's list. |
| Profile | Display name, About, profile picture, activity numbers, and preferences. Links to Settings and, for admins, Server Management. |
| Settings | Color theme, appearance (System, Light, Dark), interface and reply language, reply length, context length, notifications. |
| Help | FAQ with search, a guide to every feature, a Markdown reference with live preview, and support tickets to the admins. Admins see and answer all tickets there. |
| Server Management | Admin only. Ten sections, listed below. |

## Chat features (version 1)

1. **Streaming replies:** a typing indicator appears, then text shows word by word.
2. **Chat list:** search, filters, pinned chats, unread counts, and grouping.
3. **Switch character:** start a chat with any of the user's characters or a character added from Community. Each character has its own chat history.
4. **Important messages:** the user can mark up to 10 messages per chat, their own lines (important context) and the character's replies. They are always kept in the context, each with its speaker.
5. **Story memory:** long chats (about 500 messages) keep a running summary and key facts so the story stays consistent. The chat header shows when the summary was last updated.
6. **Quick replies:** one-tap prompts above the input (Continue, Describe the scene, Shorter, Longer, Narrate the weather).
7. **Live sync:** a message sent on the phone appears on the computer, and the reverse, in real time.
8. **Pinned chats:** the user can pin any chat to the top of the list.
9. **Chat only:** no voice, no image generation.
11. **Chat tools (0.4.0):** Markdown in messages, Stop, Regenerate with versions, Continue, edit and delete messages, "Save and resend", search in a chat.
12. **Persona:** your role name and description; every character knows it.
10. **Model per chat:** the user can choose the model for each chat from the chat header, from the models the admin has allowed. A hosted model counts against the user's daily limit.

## Character features (version 1)

1. Create and edit a character with name, tagline, description, personality, greeting, scenario, and a profile picture.
2. Profile pictures are imported by the user (PNG, JPG, WebP, up to 10 MB). No image generation.
3. Edit and delete: users only their own characters, admins all characters.
4. Import character cards: SillyTavern/TavernAI JSON (V1 and V2), V2 data embedded in PNG, and plain text.
5. Export characters and chats as JSON: per character, per chat, and everything at once (Settings, Data and export; chat header; character cards).
6. Community: a user can publish a character. The admin can approve it, hide it, or leave it in the review queue. Other users add it to their list and chat with it.

## Settings and preferences (version 1)

- **Design:** Classic, Glass (with background picture, blur, opacity and dimming), Modern, Modern Glass.
- **Color theme:** seven themes (Ember, Indigo, Emerald, Ocean, Rose, Amber, Mono) with tinted surfaces.
- All of these belong to the account and update live on every device and browser.
- **Appearance:** System, Light, or Dark.
- **Language:** interface in English or German. Replies in English or German. Default in Profile: "Reply in German by default".
- **Reply length:** Short, Medium, or Long.
- **Context:** how many recent messages and how much summary are sent to the model (last 20, last 60 plus summary, or full history plus summary).
- **Notifications:** live sync on or off, sound on or off.
- **Typing indicator** and **auto-scroll** can be turned off in Profile.

## Login and sessions

- Standard login lasts 48 hours.
- Optional two-factor login with an authenticator app and recovery codes.
- Every user can change the own password, see the logged-in devices and log them out, and delete the own account with all data.
- Wrong passwords lock only the address that tried them, not the account for everyone.
- "Stay logged in" keeps the login on that device. The duration is set by the admin (mockup default: 365 days).
- Phones stay logged in.
- After a set number of failed logins (default 5), the account is locked for a set time (default 15 minutes).
- The admin can log out all devices.

## Server Management (admin only, version 1)

Ten sections, as in the mockup:

1. **Overview:** CPU, memory, disk, uptime, database size, model status, and health checks (app, database, model runtime, hosted API, last backup, HTTPS).
2. **Domain & HTTPS:** domain (optional), port, who can connect (home network only, anyone with the address, or an IP allowlist), automatic HTTPS certificate, HTTP to HTTPS redirect, connection test.
3. **Access & security:** sign-up mode (invite only, closed, or open with invite code), invite codes, standard and "stay logged in" durations, password minimum length, lockout settings, log out all devices, admin safety (password before admin actions, admin action log, two-factor later).
4. **Users:** list with role, status, character count, chat count, storage, and daily API use. Add user, edit, disable, resend invite. Defaults for new users: storage, characters, daily API messages, language.
5. **Characters:** community sharing on or off, review before publishing, card import on or off, adults-only check (always on), real-person check, and the community review queue (approve or hide).
6. **Models:** self-hosted runtime (llama.cpp or Ollama), endpoint, CPU threads, context window, default model, whether users can choose, speed test, and installed models (install, test, remove).
7. **Hosted API:** provider choice from the list in [technical.md](technical.md), endpoint, key (stored as a secret), connection test, limit per user per day (default 100), total limit per day for all users, switch to self-hosted when the limit is reached, and a table of recommended providers.
8. **Backups:** nightly time, daily and weekly retention, location, include pictures, encryption, last backup, last restore test, back up now, restore from a list (with confirmation), test restore, export all data.
9. **Storage:** maximum upload size, disk warning level, allowed file types, and removal of unused pictures.
10. **Logs & maintenance:** maintenance mode with a notice for users, restart, update check, log level, whether chat content may appear in logs (off by default), log retention, and a recent admin activity list.

## Model limits

- **Hosted API:** 100 messages per day per user, and a total daily cap for all users (default 500). Both are set in Server Management.
- **Self-hosted model:** unlimited.
- Free is more important than speed. A slower self-hosted model is acceptable.

## Later

- Android app that uses the same server.

## Non-goals

- No group chats with several characters at once (the owner said no). Switching the character in a running chat is fine.

- No public marketplace, feeds, or social features beyond sharing characters in Community.
- No payments or subscriptions inside the app.
- No image generation.
- No voice chat.

## Content rules

- **Age check.** At the first login every account answers once: "Are you 18 or older?". "No" logs out and the app stays closed for that account. The answer and its time are stored.
- **Adults only.** Characters must be adults in every roleplay. Any character described as a minor, or described in a way that suggests one, is not allowed, whatever the setting. The check is always on in Server Management.
- **No real people.** Sexual or degrading content about identifiable real people is not allowed. The real-person check flags it.
- Within these rules, the app adds no content restrictions of its own. The model's own rules still apply, so the model choice matters (see [technical.md](technical.md)).

## Model candidates

Hardware: Intel Core i7-8700 (6 cores, 12 threads), 64 GB RAM, 1 TB disk, no GPU.

| Order | Model | Why | Status |
| --- | --- | --- | --- |
| 1 | **Gemma 4 26B-A4B uncensored** (mixture-of-experts, about 4B active) | Tested: 10–13 tokens per second, very good roleplay in German and English. | **default** |
| 2 | Mistral Small 3.2 abliteration (about 24B) | Tested: 2–3.5 tokens per second, good but slow. | alternative |

Quantization: Q4_K_M for both. Details in [technical.md](technical.md), "Model test results".

Reference: "Eternal o1" is the name Chai uses for its model. The owner wants the same level of freedom and reply quality. The real model name is unknown.

## Open questions

- Which hosted provider does the owner pick first? (Recommended: Groq for the free start, Venice for uncensored paid use. See [technical.md](technical.md).)

## Appendix: owner's original notes

The owner's answers, kept as written, for reference.

- **Free vs. zero limits:** Free is more important. Limits should be small, like with Chai.
- **Switch self-hosted and API:** the option to switch per user.
- **Server:** 64 GB RAM, 1 TB disk, Intel Core i7-8700 at 3.20 GHz.
- **Live sync:** a message written on the phone appears on the PC and phone in real time, like WhatsApp Web.
- **Access:** HTTPS.
- **Pictures:** users import a picture for each character. No generation in the app.
- **Card formats:** the suggested SillyTavern V1/V2 and PNG formats are accepted.
- **Length:** about 500 messages per chat. Important messages are always remembered in that chat.
- **Backups:** automated nightly backup. PostgreSQL if possible.
- **Voice:** no voice. Chat only, no pictures and the like.
- **Phone layout:** yes.
- **Login:** 48 hours, permanent with "remember me". Phones stay logged in.
- **Admin panel:** manages the app, backups, users, and characters. Delete and edit characters only from admin.
- **Users:** as many as wanted.
- **Characters:** users create. Users edit and delete only their own. Admins edit and delete everything.
- **Pictures:** no image generation. Only profile pictures for users and characters.
- **API limit:** 100 messages per day. Only for the API. Self-hosted is unlimited.
- **Backups:** fully managed in Server Management.
- **Database:** PostgreSQL.
- **First model:** Mistral Small 3.2 abliteration.
- **Domain:** start with IP and port. Set the domain in Server Management.
- **Pictures:** PNG, JPG, WebP, and similar. Maximum 10 MB.
- **Important messages:** 10 per chat.
