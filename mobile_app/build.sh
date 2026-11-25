#!/usr/bin/env bash
# Build the Compain Android app (APK) inside Docker. Nothing is installed on the host.
# Usage: ./build.sh            → dist/compain-<version>.apk
# The first run downloads the Android SDK (about 1.5 GB, once) and makes the signing key in keystore/.
set -euo pipefail
cd "$(dirname "$0")"
IMAGE=compain-android-build:1

docker build -q -t "$IMAGE" docker >/dev/null

# Signing key: made once. Keep keystore/ safe: without it, updates of the installed app are not possible
# (Android only installs an update signed with the same key).
if [ ! -f keystore/compain-release.jks ]; then
  mkdir -p keystore
  PASS=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  docker run --rm -v "$PWD/keystore:/ks" "$IMAGE" keytool -genkeypair -keystore /ks/compain-release.jks \
    -alias compain -keyalg RSA -keysize 3072 -validity 10000 -storepass "$PASS" -keypass "$PASS" -dname "CN=Compain" >/dev/null 2>&1
  printf 'storePassword=%s\nkeyAlias=compain\nkeyPassword=%s\n' "$PASS" "$PASS" > keystore/keystore.properties
  chmod 600 keystore/*
  echo "New signing key in keystore/ — make a backup of this folder."
fi

docker run --rm -v "$PWD:/project" -v compain-gradle-cache:/home/gradle/.gradle -w /project "$IMAGE" \
  gradle --no-daemon -q assembleRelease

VERSION=$(sed -n "s/.*versionName '\(.*\)'.*/\1/p" app/build.gradle)
mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk "dist/compain-$VERSION.apk"
echo "dist/compain-$VERSION.apk"
