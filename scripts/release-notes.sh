#!/usr/bin/env bash
# Prints GitHub Release notes for a tag: the commit subjects since the previous version tag, then the APK checksum.
# The text is also shown in the app's update popup (cleaned, ~700 characters), so it is kept short.
#
# usage: scripts/release-notes.sh <tag> [checksum-file]
set -euo pipefail

TAG="${1:?usage: release-notes.sh <tag> [checksum-file]}"
CHECKSUM_FILE="${2:-}"
MAX_LINES=8

# The previous version tag reachable from this one (empty for the first release).
PREVIOUS="$(git describe --tags --abbrev=0 --match 'v*' "${TAG}^" 2>/dev/null || true)"
RANGE="${PREVIOUS:+${PREVIOUS}..}${TAG}"

echo "What's new"
git log --no-merges --pretty=format:'- %s' "${RANGE}" | head -n "${MAX_LINES}"
echo

if [ -n "${CHECKSUM_FILE}" ] && [ -f "${CHECKSUM_FILE}" ]; then
  echo
  echo "SHA-256: $(cut -d' ' -f1 "${CHECKSUM_FILE}")"
fi
