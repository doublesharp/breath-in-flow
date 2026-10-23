#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_SCRIPT_SOURCE="${BUILD_SCRIPT_UNDER_TEST:-$SOURCE_ROOT/scripts/build.sh}"
TEST_TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/breath in flow-build-test.XXXXXX")"

cleanup() {
  rm -rf "$TEST_TMP_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

create_fixture() {
  local fixture_name="$1"
  local root_version="$2"
  local web_version="$3"
  local fixture_root="$TEST_TMP_ROOT/$fixture_name"

  mkdir -p \
    "$fixture_root/scripts" \
    "$fixture_root/packages/web/android/app/src/main/assets/public" \
    "$fixture_root/packages/web/android/app/build/outputs/apk/debug" \
    "$fixture_root/test-bin" \
    "$fixture_root/android-sdk"
  cp "$BUILD_SCRIPT_SOURCE" "$fixture_root/scripts/build.sh"
  chmod +x "$fixture_root/scripts/build.sh"

  printf '{"name":"fixture-root","version":"%s"}\n' "$root_version" > "$fixture_root/package.json"
  printf '{"name":"@fixture/web","version":"%s"}\n' "$web_version" > "$fixture_root/packages/web/package.json"

  cat > "$fixture_root/test-bin/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

fixture_root="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s|%s\n' "$PWD" "$*" >> "$fixture_root/command.log"

if [[ "${1:-}" == "build" ]]; then
  mkdir -p "$fixture_root/packages/web/dist/assets"
  printf '<script type="module" src="/assets/current.js"></script>\n' \
    > "$fixture_root/packages/web/dist/index.html"
  printf 'current web bundle\n' > "$fixture_root/packages/web/dist/assets/current.js"
fi

if [[ "${1:-}" == "exec" && "${2:-}" == "cap" && "${3:-}" == "sync" && "${4:-}" == "android" ]]; then
  if [[ "${BUILD_TEST_STALE_NATIVE:-0}" != "1" ]]; then
    mkdir -p "$PWD/android/app/src/main/assets/public"
    cp -R "$PWD/dist/." "$PWD/android/app/src/main/assets/public/"
    printf 'generated bridge shim\n' > "$PWD/android/app/src/main/assets/public/cordova.js"
    printf 'generated plugin registry\n' > "$PWD/android/app/src/main/assets/public/cordova_plugins.js"
  fi
fi

if [[ "${1:-}" == "--filter" && "${2:-}" == "@breath-in-flow/shared" && "${3:-}" == "build" ]]; then
  touch "$fixture_root/shared-built"
fi

if [[ "${1:-}" == build:mac || "${1:-}" == build:win || "${1:-}" == build:linux ]]; then
  if [[ "${BUILD_TEST_REQUIRE_SHARED:-0}" == "1" && ! -f "$fixture_root/shared-built" ]]; then
    exit 1
  fi
fi

if [[ "${BUILD_TEST_ARTIFACTS:-absent}" == "present" && "${1:-}" == build:* ]]; then
  release_dir="$PWD/release/${BUILD_TEST_WEB_VERSION:?}"
  mkdir -p "$release_dir"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}-arm64.dmg"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}-arm64-mac.zip"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}.exe"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}.AppImage"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}.deb"
fi
STUB
  chmod +x "$fixture_root/test-bin/pnpm"

  cat > "$fixture_root/packages/web/android/gradlew" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

fixture_root="$(cd "$(dirname "$0")/../../.." && pwd)"
printf '%s|%s\n' "$PWD" "$*" >> "$fixture_root/command.log"
mkdir -p "$PWD/app/build/outputs/apk/debug"
printf 'apk\n' > "$PWD/app/build/outputs/apk/debug/app-debug.apk"
STUB
  chmod +x "$fixture_root/packages/web/android/gradlew"

  printf '%s\n' "$fixture_root"
}

run_mac_build() {
  local fixture_root="$1"
  local artifact_mode="$2"
  local web_version="$3"

  PATH="$fixture_root/test-bin:$PATH" \
    BUILD_TEST_ARTIFACTS="$artifact_mode" \
    BUILD_TEST_WEB_VERSION="$web_version" \
    "$fixture_root/scripts/build.sh" mac
}

run_android_build() {
  local fixture_root="$1"
  local stale_native="${2:-0}"
  local web_version="$3"

  PATH="$fixture_root/test-bin:$PATH" \
    ANDROID_HOME="$fixture_root/android-sdk" \
    BUILD_TEST_STALE_NATIVE="$stale_native" \
    "$fixture_root/scripts/build.sh" android
}

test_uses_web_package_version() {
  local fixture_root
  fixture_root="$(create_fixture version-source 9.9.9 1.2.3)"

  if ! run_mac_build "$fixture_root" present 1.2.3 >/dev/null 2>&1; then
    fail 'mac build should use packages/web/package.json when locating release artifacts'
  fi

  [[ -f "$fixture_root/dist/mac/Breath in Flow-1.2.3-arm64.dmg" ]] ||
    fail 'web package version was not used for the versioned macOS artifact'
}

test_missing_electron_artifact_fails() {
  local fixture_root
  fixture_root="$(create_fixture missing-artifact 1.2.3 1.2.3)"

  if run_mac_build "$fixture_root" absent 1.2.3 >/dev/null 2>&1; then
    fail 'mac build succeeded even though electron-builder produced no artifacts'
  fi
}

test_present_artifacts_are_copied() {
  local fixture_root
  fixture_root="$(create_fixture present-artifacts 1.2.3 1.2.3)"

  run_mac_build "$fixture_root" present 1.2.3 >/dev/null

  [[ -f "$fixture_root/dist/mac/Breath in Flow-1.2.3-arm64.dmg" ]] ||
    fail 'versioned DMG was not copied to dist/mac'
  [[ -f "$fixture_root/dist/mac/Breath in Flow-1.2.3-arm64-mac.zip" ]] ||
    fail 'versioned ZIP was not copied to dist/mac'
}

test_android_build_orders_and_versions_release_inputs() {
  local fixture_root
  fixture_root="$(create_fixture android-order 9.9.9 0.0.3)"
  local canonical_fixture_root
  canonical_fixture_root="$(cd "$fixture_root" && pwd)"

  run_android_build "$fixture_root" 0 0.0.3 >/dev/null

  [[ -f "$fixture_root/dist/android/breath-in-flow-0.0.3.apk" ]] ||
    fail 'versioned Android APK was not copied to dist/android'

  local first_command second_command third_command
  first_command="$(sed -n '1p' "$fixture_root/command.log")"
  second_command="$(sed -n '2p' "$fixture_root/command.log")"
  third_command="$(sed -n '3p' "$fixture_root/command.log")"
  [[ "$first_command" == "$canonical_fixture_root|build" ]] ||
    fail 'Android build did not invoke the deterministic root build first'
  [[ "$second_command" == "$canonical_fixture_root/packages/web|exec cap sync android" ]] ||
    fail 'Capacitor sync did not immediately follow the root build'
  [[ "$third_command" == *"assembleDebug -PappVersionName=0.0.3 -PappVersionCode=3" ]] ||
    fail 'Gradle did not receive package-derived Android version metadata'
}

test_android_build_rejects_stale_native_assets() {
  local fixture_root
  fixture_root="$(create_fixture android-stale-assets 9.9.9 0.0.3)"
  printf 'stale\n' > "$fixture_root/packages/web/android/app/src/main/assets/public/index.html"

  if run_android_build "$fixture_root" 1 0.0.3 >/dev/null 2>&1; then
    fail 'Android build succeeded with stale native web assets'
  fi

  if rg -q 'assembleDebug' "$fixture_root/command.log"; then
    fail 'Gradle ran before stale native assets were rejected'
  fi
}

test_workspace_build_orders_shared_before_web() {
  node - "$SOURCE_ROOT/package.json" <<'NODE'
const fs = require('node:fs');
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const build = packageJson.scripts?.build;
const shared = build?.indexOf('@breath-in-flow/shared');
const web = build?.indexOf('@breath-in-flow/web');
if (!Number.isInteger(shared) || shared < 0 || !Number.isInteger(web) || web < 0 || shared >= web) {
  throw new Error('root build must build shared before web');
}
NODE
}

test_desktop_builds_prepare_shared() {
  local platform fixture_root
  for platform in mac win linux; do
    fixture_root="$(create_fixture "desktop-$platform" 1.2.3 1.2.3)"
    if ! PATH="$fixture_root/test-bin:$PATH" \
      BUILD_TEST_REQUIRE_SHARED=1 BUILD_TEST_ARTIFACTS=present BUILD_TEST_WEB_VERSION=1.2.3 \
      "$fixture_root/scripts/build.sh" "$platform" >"$fixture_root/build.log" 2>&1; then
      fail "$platform build did not build shared before compiling the desktop app"
    fi
  done
}

case "${1:-all}" in
  version)
    test_uses_web_package_version
    ;;
  missing-artifact)
    test_missing_electron_artifact_fails
    ;;
  present-artifacts)
    test_present_artifacts_are_copied
    ;;
  android)
    test_android_build_orders_and_versions_release_inputs
    test_android_build_rejects_stale_native_assets
    ;;
  workspace-order)
    test_workspace_build_orders_shared_before_web
    test_desktop_builds_prepare_shared
    ;;
  all)
    test_uses_web_package_version
    test_missing_electron_artifact_fails
    test_present_artifacts_are_copied
    test_android_build_orders_and_versions_release_inputs
    test_android_build_rejects_stale_native_assets
    test_workspace_build_orders_shared_before_web
    test_desktop_builds_prepare_shared
    ;;
  *)
    fail "unknown test selection: $1"
    ;;
esac

printf 'PASS: build script release artifact checks\n'
