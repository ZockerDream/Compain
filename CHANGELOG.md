# Changelog

All notable changes to Compain. Newest first.

## 1.12.1 – 2026-11-26

- **Phones: the character editor fits the screen again.** Forms no longer grow wider than their card (long texts, the picture field, the character assistant); this fixes every form, not only the editor.
- **Help, written out:** new FAQ answers on installing and updating the Android app, connecting it to another server, *I still see an old version* and *Text is hard to read*; new guide sections *Android app* and *Updates (admins)* (server update with `git pull` and `docker compose up -d`, publishing the app, the model). FAQ and guide now show full Markdown, so commands appear as code blocks.

## 1.12.0 – 2026-11-25

- **Update the Android app from inside the app.** Settings → App → *Update to …*: the app downloads the newest version from your own Compain server, checks its checksum and hands it to Android's installer; login and chats stay. The first time, Android asks to allow Compain to install apps. Android app 1.1.0 (from 1.0.0, install 1.1.0 once by hand: *Update* there downloads the file).
- The server now offers the newest APK under `/static/android/` (`mobile_app/build.sh` puts it there with `version.json`). Android phones in the browser see a *Download the app* card in Settings.
- **Chats follow the end.** A new message, also one from another device, scrolls to the end; while you are at the end, the chat stays there when the keyboard opens or a picture loads.

## 1.11.0 – 2026-11-25

- **Readable in every colour theme.** Text on the accent colour (own messages, buttons, the welcome box, initials, badges) now picks white or dark text by contrast, worked out from the accent the theme really uses; accent gradients keep that contrast to the end, and accent-coloured text and links are adjusted to stay readable on the background. Before, *Mono* in dark mode showed white text on a white message bubble.
- Browser tests measure all 7 colour themes in light and dark mode (at least 4.5 : 1, WCAG AA).

## 1.10.0 – 2026-11-25

- **Android app** in `mobile_app/`: Compain as an APK, in full screen, with everything the browser can do (login that stays, live updates, pictures and imports, downloads of exports, cards and backups, sound, back gesture). On the first start it asks for the server address. Build with `mobile_app/build.sh` (needs only Docker); see `mobile_app/README.md`.
- **Phones: tidy chat header.** Only back, picture, name and **⋮**. Search, relationship, bookmarks, pin, story summary, export and delete are in the ⋮ menu, each with its name.
- **Settings → App** (only in the Android app): *Full-screen chats* hides the bottom bar while a chat is open, and the chat uses the whole screen; *Change server*; app version.

## 1.9.1 – 2026-11-25

- **Updates reach phones at once.** App files are now sent with `Cache-Control: no-cache`, the service worker takes them from the server first (the cache only offline) and an open or installed app reloads itself once when a new version is there. Before, a phone (especially the installed app on Android) could keep an old version for days, for example with the input field under the bottom bar.
- The installed app looks for a new version every time it comes back to the front.
- Browser tests: the phone is now a Galaxy S25 Ultra (412 × 891).

## 1.9.0 – 2026-11-25

- **New logo: the crescent.** A moon that opens into a C, glowing from candle light to ember and dusk rose, with a spark inside: someone keeps you company at night. It is in the sidebar, the top bar, on the login, two-factor and age pages (with a spark as the dot of the *i*), as the browser tab icon and as the app icon for *Add to Home Screen* (also as a maskable icon for Android).
- The logo is the same in every colour theme; the app's window colour is now the night tone of the logo.
- Files: `app/compain/static/icons/` (`mark.svg`, `mark-tile.svg`, `icon.svg`, `app-icon.svg` and the PNG sizes).

## 1.8.1 – 2026-11-25

- `examples/demo-characters.json`: the placeholder pictures are now anime illustrations (via nekos.best) instead of cartoon avatars. Artist and source of every picture are in `picture_credit`; replace them with your own pictures for real use.

## 1.8.0 – 2026-11-25

- **Delete a whole chat.** The bin in the chat header deletes the chat with all messages, versions, bookmarks, the story summary and the relationship, after asking once. The character stays. Everyone can delete only their own chats; a reply that is still being written is stopped first.
- **Replies in the language of your account.** *Replies in → Same as the interface* (before: *Automatic*) now follows the language set under *Interface*, instead of the language you happen to type in. The rule is also stronger: the character keeps that language even when its card, greeting or the story so far is written in another one.
- **Changelog, Impressum and Datenschutz show full Markdown**:
  - **bold**, *italic*, ~~struck~~, `code` and links
  - numbered and nested lists, quotes, tables, code blocks and rules

  Before, the signs (`**`, `` ` ``) were shown as they are.
- **Import card** takes Compain character lists such as `examples/demo-characters.json` directly on the server (before: *The card has no name* when the browser still had the old app cached).
- A link to a chat (`#chats/<number>`, for example after reloading) opens that chat again instead of the first one.

## 1.7.0 – 2026-11-25

- **Import many characters with pictures.** A Compain character list (`"format": "compain-characters-v1"`) can now carry a picture per character: `picture` as a data address (`data:image/png;base64,…`) for everyone, or `picture_url` as a web address for admins. The server checks every picture like an upload (PNG, JPG or WebP, size limit) and never fetches addresses inside its own network. A picture that fails does not stop the import; the message says which one.
- `"visibility": "public"` in the list puts characters straight into the Community when an admin imports them (others: waiting for review).
- **Import card** on the Characters page also accepts Compain character lists.
- New `examples/demo-characters.json`: 50 test characters in anime style (40 women, 10 men, all adults) with placeholder pictures, to bring a fresh server to life.

## 1.6.2 – 2026-11-25

- **Server: the built-in HTTPS proxy (Caddy) stays off by default.** `docker compose up -d` starts only the app, the database and the model, so your own reverse proxy can sit in front. Caddy starts only with `COMPOSE_PROFILES=https` in `.env`; `scripts/update.sh` no longer turns it on just because `COMPAIN_DOMAIN` is set.
- New `COMPAIN_PORT` in `.env` (default 8080). With a proxy on the same server, `127.0.0.1:8080` keeps the app reachable only through the proxy.
- README: what your own proxy needs (WebSockets on `/ws`, `X-Forwarded-Proto`, no buffering).

## 1.6.1 – 2026-11-25

- **Phones: the input field of a chat is visible again.** An open chat now ends right above the bottom bar in every design; the top buttons (Changelog, Impressum, Datenschutz) step aside while a chat is open.
- Phones: the chat header shows the name again, with the tools in a second row; the chat facts (messages, important, model) are one row that scrolls sideways.
- Settings on phones: the background choices of the glass designs wrap instead of running off the screen.
- Home: the *You* card shows your profile picture; long chat titles under *Recent chats* end with … inside the card.

## 1.6.0 – 2026-11-25

- **Email address on every account.** You log in with your username or your email address, whichever you like. Creating an account with an invite code asks for an email address.
- **Settings, Username and email** (next to the password): change your username and email address; your current password confirms it.
- **Server Management, Users:** a role field per user (*Admin* or *User*) changes the role at once; your own role stays, so you cannot lock yourself out. *Edit* changes username and email; new users get an email address and a role right away. Role changes go into the audit log.
- Usernames are unique regardless of case and must not contain @.

## 1.5.0 – 2026-11-25

- **Relationship:** every chat keeps track of how the character feels about you: trust and affection (0 to 100), a mood and one sentence on how they see you. The model judges it again every 10 messages (Server Management, Models) and the character acts on it. The heart in the chat header shows it; there you can judge it now, adjust it, reset it or turn it off for the chat. Chat exports take it along.
- **Character assistant:** describe your idea in two or three sentences at the top of the character editor and press *Write a draft*. The model fills in name, tagline, description, personality, scenario, greeting and tags; you change what you like and save.

## 1.4.0 – 2026-11-24

- **Install and update with two commands.** `git pull` and `docker compose up -d` are enough: the app is rebuilt, the database is updated, and the model server always starts with it. On the first start it downloads the model by itself (Gemma 4, about 17 GB); no profile and no download script needed any more.
- The model is chosen with `LLM_MODEL` in `.env` (`gemma`, `mistral` or `none`). HTTPS is turned on with `COMPOSE_PROFILES=https` in `.env`.
- The graphics card is now an add-on file (`docker-compose.gpu.yml`); `./scripts/llm.sh gpu` turns it on, `./scripts/llm.sh cpu` off.

## 1.3.5 – 2026-11-24

- **The model can run on the graphics card.** `./scripts/llm.sh gpu` starts the model with an NVIDIA graphics card, `./scripts/llm.sh cpu` back on the processor only, for servers without a card. Replies come much faster on the graphics card. The choice is kept in `.env`; `./scripts/update.sh` keeps it too.
- Server Management, Overview shows whether the model runs on the graphics card or the processor.

## 1.3.4 – 2026-11-24

- **Replies go on without you.** A reply is now written on the server on its own. Leaving the chat, switching to another tab or app, or losing the connection no longer stops it: the reply is finished and saved, and the chat list shows it as unread. Coming back while it is still being written shows the text so far and follows it.
- Only **Stop** ends a reply early; the part written so far is kept, as before.
- While a reply is being written, a second message in the same chat waits: *The character is still writing*.

## 1.3.3 – 2026-11-24

- **Publishing:** characters an admin publishes go straight into the Community. Characters of other users still wait for an admin's review; meanwhile their owner sees them in the Community marked *Waiting for review*.
- **Large pictures:** character cards on the Characters and Community pages show the picture large. A click on a picture (also the one in the chat header) shows it in full size. The character editor shows the current or newly chosen picture.
- *Add to my characters* in the Community now copies the picture too.

## 1.3.2 – 2026-11-24

- **The app uses the whole screen.** The page is no longer limited to 1200 pixels; on wide screens the chat, the chat list and the messages grow with the window. The chat panel ends above the bottom edge, so the input field is fully visible.

## 1.3.1 – 2026-11-24

- **The character of a chat is fixed.** The character switcher in the chat header is gone, and the server refuses a change. For another character, start a new chat. Chats imported from older versions keep showing who wrote each reply.

## 1.3.0 – 2026-11-24

- **Search over all chats:** the search above the chat list also looks inside every message of all your chats (*In messages*, newest first). A click opens the chat at that message.
- **Bookmarks:** mark a scene for yourself under any message. The bookmark button in the chat header lists the bookmarks of the chat; the filter *Bookmarks* in the chat list shows all of them. Unlike *important*, bookmarks never reach the model.
- **Chat export and import:** the export button in the chat header offers **Markdown** (to read or print) and **JSON**. JSON files (one chat, all chats, or everything) can be imported again under *Import chats* on the Chats page or Profile → Your data, also on another Compain server. A missing character is created from the copy in the file.
- **Character cards:** V3 cards (SillyTavern, Chub and others), several cards in one JSON list, several files at once and dropping files on the Characters page. Example dialogue is kept at the end of the personality. **Card** on a character downloads it as a V2 card, inside its PNG picture or as JSON.
- **Waiting line and status:** replies of the self-hosted model wait in a line when all slots are busy. Under the typing dots you see *Waiting in line, place N*, *The model is loading…* or *Reading the story…* with the seconds. The chat shows when the model is busy or not reachable; the admin overview shows the model queue. New setting *Replies at the same time* (Models, default 2 = LLM_SLOTS).
- Live updates no longer move the open chat: the scroll position, an open bookmark list or export menu and the typed text stay. Two renders at the same moment (an own action and a live update) no longer show the chat twice.
- The speed test waits for a free slot of the model, so replies of other users do not distort it.

## 1.2.0 – 2026-11-24

- Admins may bypass the password policy (minimum length): for their own password, for new users and when they set a password for a user. Normal users still need the minimum length.
- The placeholder for a new user's password in Server admin no longer mentions the minimum length.

## 1.1.0 – 2026-11-24

- Mark your own messages as important, for example when you give the story important context. The character keeps them in mind like important replies; they count toward the 10 per chat.
- **Help** page (sidebar, and the Profile page on phones):
  - **FAQ** with search.
  - **Guide** to every feature.
  - **Markdown** reference with a live preview.
  - **Support tickets**: open a ticket with a subject, category and message, answer, close and reopen it. Admins see all tickets, answer, write internal notes only admins see, set status, priority and category, assign tickets to an admin and delete them. New answers show live with a badge on Help (on phones on Profile).
- Server Management: the overview shows tickets waiting for an answer; admins can set a new password for a user.
- Browser tests read the admin login from `.env`.
- The message field keeps the cursor after sending and after the reply, so you can write on without clicking it. Text you type while the character writes is kept.

## 1.0.0 – 2026-11-24

- First stable release. It contains everything from 0.1.0 to 0.4.0.
- Tested: 53 API tests and 57 browser checks against the Docker build with the real Gemma model, on a fresh database.

## 0.4.0 – 2026-11-24

- Messages show Markdown: *actions* in italics, **bold**, `code`, lists and quotes. No more visible asterisks.
- Chat tools: Stop while the character writes (the part so far is kept), Regenerate with versions to flip through, Continue (the character writes on), edit and delete messages, "Save and resend" from an earlier line, search in a chat.
- Switch the character in a running chat; every reply keeps its author and the new character knows who spoke before.
- Persona: your role name and description, known to every character.
- Profile picture for your account; your own background picture for the glass designs (only you see it).
- Community: likes and usage counts; the most liked characters come first.
- Sound when a reply is complete (Settings).
- Account security: change the password, two-factor login with an authenticator app and recovery codes, list of logged-in devices with "Log out", delete the own account with all data.
- Wrong passwords no longer lock your account for everyone: the lock applies to the address that tried, plus a limit per address.
- Datenschutzerklärung as popup and page, from the file `.datenschutz` (template `.datenschutz-example`).
- Installable as an app (PWA) on phones and computers.
- Server: database migrations with Alembic, backups can be copied to a second place, `scripts/update.sh` for updates.

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
