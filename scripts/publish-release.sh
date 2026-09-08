#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# publish-release.sh — the only way a desktop artefact reaches users.
#
# It checks the release quality suite's report for exactly these bytes, uploads
# them, and then reads the public URL back. The build scripts deliberately do
# not do this: a build that publishes itself is a build nobody looked at.
#
#   scripts/publish-release.sh <version> <macos|windows> <file>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

VERSION="${1:?usage: publish-release.sh <version> <macos|windows> <file>}"
PLATFORM="${2:?usage: publish-release.sh <version> <macos|windows> <file>}"
FILE="${3:?usage: publish-release.sh <version> <macos|windows> <file>}"
[ -f "${FILE}" ] || { echo "✘ no such file: ${FILE}"; exit 1; }

case "${PLATFORM}" in
  macos)   SLOT="darwin-aarch64" ;;
  windows) SLOT="windows-x86_64" ;;
  *) echo "✘ platform must be macos or windows (got '${PLATFORM}')"; exit 1 ;;
esac

echo "== 1/3  the release quality suite must have passed on these bytes =="
node scripts/quality/require-report.mjs --version "${VERSION}" --file "${FILE}" --platform "${SLOT}"

echo "== 2/3  upload + register =="
# publish-artifact.mjs runs the same check again. Belt and braces: it is also
# reachable from CI, and the guard belongs to the thing that uploads.
node scripts/publish-artifact.mjs --version "${VERSION}" --file "${FILE}" --platform "${SLOT}"

echo "== 3/3  read the public URL back =="
BASE="${CF_RELEASES_BASE:-https://pdfluent.com/releases}"
URL="${BASE}/${VERSION}/$(basename "${FILE}")"
sleep 3
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -I "${URL}" || echo 000)"
if [ "${CODE}" = "200" ]; then
  echo "✓ Live: ${URL} (HTTP 200)"
else
  echo "✘ ${URL} returned HTTP ${CODE} (R2 may still be propagating; re-check)"
  exit 1
fi
