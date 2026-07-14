#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Deterministic, verified Tauri build.
#
# Guarantees the shipped artifact embeds the CURRENT frontend — never a stale
# bundle from a prior incremental build. Use this instead of relying on a
# developer remembering to `cargo clean` before a release.
#
# Steps: clean frontend → build frontend → Tauri build → verify embedded bundle.
#
# Usage:
#   scripts/build-verified.sh            # debug profile
#   scripts/build-verified.sh --release  # release profile
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE_FLAG="${1:---debug}"
case "$PROFILE_FLAG" in
  --release) TARGET_DIR="src-tauri/target/release" ;;
  --debug)   TARGET_DIR="src-tauri/target/debug" ;;
  *) echo "usage: $0 [--debug|--release]" >&2; exit 2 ;;
esac

echo "[1/4] Clean frontend dist + Vite cache (avoids stale bundles)"
rm -rf dist node_modules/.vite

echo "[2/4] Build frontend (tsc && vite build)"
npm run build

REF=$(grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
echo "      fresh bundle: ${REF}"

echo "[3/4] Tauri build (${PROFILE_FLAG})"
npm run tauri build -- "${PROFILE_FLAG}"

echo "[4/4] Verify embedded frontend matches current dist"
node scripts/verify-frontend-embed.mjs "${TARGET_DIR}/pdfluent-desktop"

echo "✅ build-verified: ${PROFILE_FLAG} artifact embeds the current frontend (${REF})"
