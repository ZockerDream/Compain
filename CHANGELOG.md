# Changelog

All notable changes to Compain. Newest first.

## 0.3.0 – 2026-11-24

- Four designs, like in the RP-Management-Board: Classic (sidebar), Glass (glass panels over a background picture with sliders for blur, opacity and dimming), Modern (navigation on top as pills) and Modern Glass.
- Seven colour themes with tinted surfaces: Ember, Indigo, Emerald, Ocean, Rose, Amber, Mono (Forest and Violet became Emerald and Indigo).
- Changelog and Impressum open as popups from the top bar, like the notifications in the RP-Management-Board. A dot shows when there is something new in the changelog.
- Age check: every account answers "Are you 18 or older?" once at the first login.
- Impressum (`/impressum`), filled from the file `.impressum`; template in `.impressum-example`. Changelog also at `/changelog`.
- Four reply lengths: Short (one action and one line), Medium (one paragraph), Long (two paragraphs), Extra long (four paragraphs).
- Theme, appearance, languages and reply settings belong to the account and update live on every open device and browser.

## 0.2.0 – 2026-11-24

- Server Management with ten sections: overview, users, characters, hosted API, access and security, domain and HTTPS, models, backups, storage, logs and maintenance.
- Live sync of chats between devices.
- Story summary every 40 messages, unread counts, pinned chats, filters.
- Character card import (SillyTavern JSON and PNG, plain text); character pictures as avatars.
- Nightly backups with restore; maintenance mode and notices; invite codes.
- German interface; hosted API provider picker with encrypted key and connection test.
- Characters open the chat with their greeting; better roleplay instructions.
- Self-hosted model: Gemma 4 26B-A4B uncensored is the default after measuring (10–13 tokens/s on CPU).

## 0.1.0 – 2026-11-23

- First build: login, characters, chats with streaming replies, important messages, community review, export.
- Web app based on the approved mockup, Docker Compose with PostgreSQL, API and browser tests.
