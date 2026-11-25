# Build environment for the Compain Android app: JDK 17, Gradle and the Android SDK.
# Nothing is installed on the host; build.sh runs the build inside this image.
FROM gradle:8.10.2-jdk17
ENV ANDROID_HOME=/opt/android-sdk
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl && rm -rf /var/lib/apt/lists/* \
 && mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && unzip -q /tmp/tools.zip -d "$ANDROID_HOME/cmdline-tools" \
 && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" && rm /tmp/tools.zip
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
RUN yes | sdkmanager --licenses >/dev/null \
 && sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools" >/dev/null
