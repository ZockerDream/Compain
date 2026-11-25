# Compain for Android

The Android app (APK) for Compain. It opens your own Compain server in full screen, so every feature of the
web app is there, and a new Compain version on the server reaches the app without a new APK.

## Build

```
cd mobile_app
./build.sh
```

Needs only Docker. The first build downloads the Android SDK into a Docker image (about 1.5 GB, once) and
takes a few minutes; later builds take about a minute. The APK ends up in `dist/compain-<version>.apk`.

**Signing key:** the first build creates `keystore/` (key and passwords). It is not in git. Back it up:
Android installs an update of the app only when it is signed with the same key. Without it you must
uninstall the app (and log in again) before installing a new build.

## Install on the phone

1. Copy the APK to the phone (USB, cloud, or e-mail) and open it.
2. Allow "Install unknown apps" for the app you open it with (Android asks once).
3. Start Compain and enter your server address, for example `https://compain.example.org`, or in the home
   network `http://192.168.1.20:8080`.

## What the app does

- **Full screen:** status and navigation bar are hidden; swipe from the edge to show them for a moment.
  The keyboard and the camera cut-out never cover the page.
- **Everything from the browser:** login that stays, live updates, pictures and imports (file picker),
  exports, character cards and backups (saved in *Downloads*), sound.
- **Back gesture** goes back inside Compain (chat → chat list → …).
- **Settings → App** (only in the app): *Full-screen chats* hides the bottom bar in an open chat; *Change
  server*; the app version.
- Links to other sites open in the normal browser.
- No server reachable: a page with *Try again* and *Change server*.

## Updates

- Compain itself (server): `git pull` and `docker compose up -d` on the server, as always. The app picks it up.
- The app (this folder): raise `versionCode` and `versionName` in `app/build.gradle`, run `./build.sh`, and
  install the new APK over the old one.

## Files

| File | What |
| --- | --- |
| `app/src/main/java/app/compain/android/MainActivity.java` | The whole app: WebView, full screen, file picker, downloads, back gesture, `window.CompainApp` |
| `app/src/main/assets/setup.html`, `offline.html` | First start (server address) and "server not reachable" |
| `app/src/main/res/` | Icon (the crescent), colours, start screen |
| `docker/Dockerfile` | Build environment: JDK 17, Gradle, Android SDK 35 |
