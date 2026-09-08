#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# stage-latest-json.sh — produce the Tauri updater latest.json LOCALLY from
# already-built, signed artifacts, for the self-hosted GA flow. It does NOT
# upload to R2 and does NOT deploy the website — it only stages + verifies so a
# human can inspect before the approval-gated upload.
#
# Inputs: signed updater artifacts staged under
#   artifacts/macos/   (*.app.tar.gz + .sig   → darwin-aarch64)
#   artifacts/windows/ (*.msi + .msi.sig      → windows-x86_64)
#   artifacts/linux/   (*.AppImage(.tar.gz) + .sig → linux-x86_64, from the VPS)
# (produced by scripts/release-macos.sh / release-windows-remote.sh with the
#  production updater key present, and the VPS Linux build.)
#
# NOTE: scripts/ci-generate-latest-json.mjs currently REQUIRES a linux .sig. For
# a macOS+Windows-only release, include the VPS Linux artifact or relax that
# requirement first (see docs/GA_UPDATE_READINESS.md).
#
#   scripts/stage-latest-json.sh <version>      # e.g. 1.0.0
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"
VERSION="${1:?usage: stage-latest-json.sh <version>   (e.g. 1.0.0)}"

echo "== 1/3  verify updater signatures (trusted key only) =="
bash scripts/verify-updater-sigs.sh

echo "== 2/3  every staged updater payload must carry a PASS quality report =="
# The signature says the payload came from us. It does not say the payload
# works: that is what the release quality suite ran against the artefact, and
# an update feed pointing at an unjudged payload is worse than no feed at all.
node scripts/quality/require-report.mjs --version "${VERSION}" --artifacts artifacts --updater

echo "== 3/3  generate latest.json (LOCAL staging — no upload) =="
# CF_R2_PUBLIC_URL only sets the URLs written INTO latest.json; the generator
# performs no network upload. Uploading is a separate, approval-gated wrangler
# step that this script intentionally does not perform.
CI_COMMIT_TAG="v${VERSION}" \
CF_R2_PUBLIC_URL="${CF_R2_PUBLIC_URL:-https://pdfluent.com/releases}" \
CF_R2_BUCKET_NAME="${CF_R2_BUCKET_NAME:-pdfluent-releases}" \
  node scripts/ci-generate-latest-json.mjs

echo
echo "== staged latest.json (NOT uploaded) =="
cat latest.json
echo
echo "Inspect platforms/URLs/signatures/version/pub_date above."
echo "NEXT (approval-gated, NOT done here): upload artifacts + latest.json to R2,"
echo "canary-verify a real update, then flip the public latest.json."
