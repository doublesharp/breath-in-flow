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

  mkdir -p "$fixture_root/scripts" "$fixture_root/packages/web" "$fixture_root/test-bin"
  cp "$BUILD_SCRIPT_SOURCE" "$fixture_root/scripts/build.sh"
  chmod +x "$fixture_root/scripts/build.sh"

  printf '{"name":"fixture-root","version":"%s"}\n' "$root_version" > "$fixture_root/package.json"
  printf '{"name":"@fixture/web","version":"%s"}\n' "$web_version" > "$fixture_root/packages/web/package.json"

  cat > "$fixture_root/test-bin/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "build:mac" && "${BUILD_TEST_ARTIFACTS:-absent}" == "present" ]]; then
  release_dir="$PWD/release/${BUILD_TEST_WEB_VERSION:?}"
  mkdir -p "$release_dir"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}-arm64.dmg"
  touch "$release_dir/Breath in Flow-${BUILD_TEST_WEB_VERSION}-arm64-mac.zip"
fi
STUB
  chmod +x "$fixture_root/test-bin/pnpm"

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
  all)
    test_uses_web_package_version
    test_missing_electron_artifact_fails
    test_present_artifacts_are_copied
    ;;
  *)
    fail "unknown test selection: $1"
    ;;
esac

printf 'PASS: build script release artifact checks\n'
