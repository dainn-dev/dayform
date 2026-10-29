#!/usr/bin/env bash
# Local fallback for the GitHub Actions release: builds a SIGNED APK on this machine and (after you confirm)
# publishes it as a GitHub Release. Needs: JDK 21, Android SDK (ANDROID_HOME), bun, gh (logged in).
# The signing key comes from ~/.dayform-signing/signing-info.txt (never from the repo).
#
# usage: scripts/release-local.sh [--yes]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="${ROOT}/packages/mobile"
SIGNING_DIR="${HOME}/.dayform-signing"
INFO="${SIGNING_DIR}/signing-info.txt"
ASSUME_YES="${1:-}"

[ -f "${INFO}" ] || { echo "Missing ${INFO} (the signing key info)."; exit 1; }
field() { grep -m1 "^$1:" "${INFO}" | sed -E "s/^$1:[[:space:]]*//" | tr -d '\r'; }

VERSION="$(node -p "require('${MOBILE}/app.json').expo.version")"
CODE="$(node -p "require('${MOBILE}/app.json').expo.android.versionCode")"
TAG="v${VERSION}"

cd "${ROOT}"
[ -z "$(git status --porcelain)" ] || { echo "Working tree is not clean; commit or stash first."; exit 1; }
git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null && { echo "Tag ${TAG} already exists locally."; exit 1; }
gh release view "${TAG}" >/dev/null 2>&1 && { echo "Release ${TAG} already exists on GitHub."; exit 1; }

echo "Running tests and typecheck..."
(cd "${MOBILE}" && bun test && bunx tsc --noEmit && bunx tsc --noEmit -p tsconfig.test.json)

export DAYFORM_KEYSTORE_PATH="$(field keystore)"
export DAYFORM_KEYSTORE_PASSWORD="$(field 'store password')"
export DAYFORM_KEY_ALIAS="$(field alias)"
export DAYFORM_KEY_PASSWORD="$(field 'key password')"
export DAYFORM_REQUIRE_RELEASE_SIGNING=1
export CI=1 NODE_ENV=production

echo "Generating the Android project and building ${TAG} (versionCode ${CODE})..."
(cd "${MOBILE}" && bunx expo prebuild --platform android --no-install --clean)
(cd "${MOBILE}/android" && ./gradlew assembleRelease "-PreactNativeArchitectures=${DAYFORM_ABIS:-arm64-v8a}" --no-daemon --console=plain)

APK_SRC="${MOBILE}/android/app/build/outputs/apk/release/app-release.apk"
OUT_DIR="$(mktemp -d)"
APK="${OUT_DIR}/dayform-${VERSION}.apk"
cp "${APK_SRC}" "${APK}"
(cd "${OUT_DIR}" && sha256sum "dayform-${VERSION}.apk" > "dayform-${VERSION}.apk.sha256")

BT="$(ls -d "${ANDROID_HOME}"/build-tools/* | sort -V | tail -1)"
echo "Signature:"
"${BT}/apksigner" verify --print-certs "${APK}" | grep -E "certificate SHA-256 digest|Verifies"

echo
echo "About to publish ${TAG} to GitHub with:"
ls -l "${OUT_DIR}"
if [ "${ASSUME_YES}" != "--yes" ]; then
  read -r -p "Create the tag and the public release? [y/N] " answer
  [ "${answer}" = "y" ] || { echo "Cancelled. Files are in ${OUT_DIR}"; exit 0; }
fi

git tag "${TAG}"
git push origin "${TAG}"
bash "${ROOT}/scripts/release-notes.sh" "${TAG}" "${OUT_DIR}/dayform-${VERSION}.apk.sha256" > "${OUT_DIR}/notes.md"
gh release create "${TAG}" "${APK}" "${OUT_DIR}/dayform-${VERSION}.apk.sha256" \
  --title "Dayform ${VERSION}" --notes-file "${OUT_DIR}/notes.md" --verify-tag
echo "Published ${TAG}."
