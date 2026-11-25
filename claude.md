# Claude Code: Compain

Instructions for Claude Code when working in this repository.

## Project context

Compain is a private, self-hosted, multi-user AI roleplay chat app that replaces a paid commercial service. Read [README.md](README.md), [concept.md](concept.md), and [technical.md](technical.md) first.

## Working rules

- Build everything listed under "Screens", "Chat features", "Character features", "Settings", and "Server Management" in [concept.md](concept.md). That is version 1. Only the Android app is "later".
- The approved look is [design/mockup.html](design/mockup.html). Reuse its CSS tokens (colors, radii, shadows, fonts) and its layout. Do not invent a new visual style. Change the mockup first if the design needs to change, and ask the owner.
- Record any stack or architecture change in [technical.md](technical.md) with the date.
- Keep everything local by default. Do not add telemetry, analytics, or third-party calls beyond the chosen model provider.
- Never commit API keys, passwords, or secrets. Read them from environment variables or a local `.env` file that is git-ignored.
- Enforce the content rules in [concept.md](concept.md): adults only, no real people. This applies to character creation, editing, and publishing in code, not only to the docs.
- The mockup uses canned data. Real behaviour (login, lockout, limits, sync, backups, community review) must be implemented and tested, not copied from the mockup.
- Keep changes small. Verify by running the app before reporting success.
- Use `graphify-out/` for codebase questions once code exists.
- **Android app (`mobile_app/`):** whenever the app changes, raise `versionCode` and `versionName` in `mobile_app/app/build.gradle`, run `mobile_app/build.sh` and commit `app/compain/static/android/` (the newest APK and `version.json`) with the release. The server offers that APK: Settings → App → Update in the app, and a download card for Android phones in the browser. Never commit `mobile_app/keystore/`.

## Conventions

- Language for code and comments: English.
- Documentation: English, unless the owner asks otherwise for a document.
