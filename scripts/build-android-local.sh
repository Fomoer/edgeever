#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$PROJECT_ROOT/apps/mobile"
ANDROID_DIR="$MOBILE_DIR/android"
MODE="${1:-fast}"

if [[ "$MODE" != "fast" && "$MODE" != "play" ]]; then
  echo "用法: $0 [fast|play]" >&2
  exit 2
fi

if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "未找到 Java 17。请先执行: brew install openjdk@17" >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -d /opt/homebrew/share/android-commandlinetools ]]; then
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
export NODE_ENV="${NODE_ENV:-production}"

if [[ -z "$ANDROID_SDK_ROOT" ]]; then
  echo "未找到 Android SDK，请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。" >&2
  exit 1
fi

cd "$PROJECT_ROOT"
bun install --frozen-lockfile

PREBUILD_FINGERPRINT="$({ shasum apps/mobile/app.json bun.lock; } | shasum | awk '{print $1}')"
PREBUILD_STAMP="$ANDROID_DIR/.edgeever-prebuild-fingerprint"
PREVIOUS_FINGERPRINT="$(test -f "$PREBUILD_STAMP" && cat "$PREBUILD_STAMP" || true)"

if [[ ! -x "$ANDROID_DIR/gradlew" || "$PREBUILD_FINGERPRINT" != "$PREVIOUS_FINGERPRINT" ]]; then
  echo "更新 Android 原生工程（保留已有编译缓存）..."
  cd "$MOBILE_DIR"
  bunx expo prebuild --platform android
  printf '%s' "$PREBUILD_FINGERPRINT" > "$PREBUILD_STAMP"
fi

cd "$ANDROID_DIR"
COMMON_ARGS=(
  --build-cache
  --parallel
  --daemon
  -Dorg.gradle.jvmargs=-Xmx6g\ -XX:MaxMetaspaceSize=1g\ -Dfile.encoding=UTF-8
)

if [[ "$MODE" == "fast" ]]; then
  echo "构建 arm64 真机测试 Release APK..."
  ./gradlew assembleRelease \
    "${COMMON_ARGS[@]}" \
    -PreactNativeArchitectures=arm64-v8a \
    -Pandroid.injected.signing.store.file="$ANDROID_DIR/app/debug.keystore" \
    -Pandroid.injected.signing.store.password=android \
    -Pandroid.injected.signing.key.alias=androiddebugkey \
    -Pandroid.injected.signing.key.password=android
  echo "完成: $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
  exit 0
fi

: "${ANDROID_KEYSTORE_FILE:?请设置 ANDROID_KEYSTORE_FILE（本地上传密钥路径）}"
: "${ANDROID_KEYSTORE_PASSWORD:?请设置 ANDROID_KEYSTORE_PASSWORD}"
: "${ANDROID_KEY_ALIAS:?请设置 ANDROID_KEY_ALIAS}"
: "${ANDROID_KEY_PASSWORD:?请设置 ANDROID_KEY_PASSWORD}"

PLAY_ARCHS="${EDGE_EVER_ANDROID_ARCHS:-armeabi-v7a,arm64-v8a,x86,x86_64}"
KEYSTORE_FILE="$(cd "$(dirname "$ANDROID_KEYSTORE_FILE")" && pwd)/$(basename "$ANDROID_KEYSTORE_FILE")"

echo "构建 Play 签名 AAB（${PLAY_ARCHS}）..."
./gradlew bundleRelease \
  "${COMMON_ARGS[@]}" \
  -PreactNativeArchitectures="$PLAY_ARCHS" \
  -Pandroid.injected.signing.store.file="$KEYSTORE_FILE" \
  -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD" \
  -Pandroid.injected.signing.store.type=PKCS12

jarsigner -verify app/build/outputs/bundle/release/app-release.aab >/dev/null
test -s app/build/outputs/mapping/release/mapping.txt
echo "完成: $ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
echo "反混淆文件: $ANDROID_DIR/app/build/outputs/mapping/release/mapping.txt"
