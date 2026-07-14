#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# release-macos.sh — build, package and publish the macOS desktop editor.
#
# One command, no manual file copying. Run this on an Apple Silicon Mac to
# produce the PDFluent .dmg and publish it to the public R2 bucket that the
# website download page and the Tauri updater read from.
#
#   scripts/release-macos.sh [version]
#
#   version   Defaults to the "version" field in src-tauri/tauri.conf.json.
#
# What it does:
#   1. `tauri build` the macOS .app (updater artifacts disabled — see NOTE).
#   2. Repackage PDFluent.app into a clean drag-to-Applications .dmg with
#      hdiutil. (Tauri's own bundle_dmg.sh styles the DMG window with
#      AppleScript and fails on headless / CI machines; hdiutil does not.)
#   3. Upload the .dmg to R2 at  <version>/PDFluent_<version>_<arch>.dmg
#   4. Verify the public download URL returns HTTP 200.
#
# Requirements:
#   - macOS + Xcode Command Line Tools, Rust, Node, npm.
#   - The XFA Rust SDK checked out at ../../XFA  (path deps in
#     src-tauri/Cargo.toml resolve to ../../../XFA/crates/*).
#   - wrangler authenticated with access to the `pdfluent-releases` R2 bucket:
#       npx wrangler whoami        # OAuth, or set CLOUDFLARE_API_TOKEN
#
# NOTE on auto-update (GA):
#   By default this ships DIRECT DOWNLOAD only. To ALSO produce the macOS
#   auto-update artifact, export the production updater key as
#   TAURI_SIGNING_PRIVATE_KEY (+ TAURI_SIGNING_PRIVATE_KEY_PASSWORD) before
#   running: the build then emits PDFluent_<ver>_aarch64.app.tar.gz + .sig
#   (trusted pubkey 9E2BAD9AABF995DD) into artifacts/macos/. Generating
#   latest.json and the R2 upload are SEPARATE, approval-gated steps; verify the
#   .sig against the trusted key first. GA Gatekeeper signing + notarization are
#   read by Tauri from the environment (Developer ID Application identity +
#   notarization credentials). Full procedure + key handling:
#   docs/RELEASE_RUNBOOK_GA.md.
set -euo pipefail

# ── locate repo + read version ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

CONF="src-tauri/tauri.conf.json"
VERSION="${1:-$(node -p "require('./${CONF}').version")}"
PRODUCT="$(node -p "require('./${CONF}').productName")"

# Build a UNIVERSAL binary so a single .dmg runs on both Apple Silicon and Intel.
ARCH="universal"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true

BUCKET="${CF_R2_BUCKET_NAME:-pdfluent-releases}"
PUBLIC_BASE="https://pdfluent.com/releases"
DMG_NAME="${PRODUCT}_${VERSION}_${ARCH}.dmg"
KEY="${VERSION}/${DMG_NAME}"

# wrangler: prefer a repo-local install, fall back to npx.
WRANGLER="npx --yes wrangler"
command -v wrangler >/dev/null 2>&1 && WRANGLER="wrangler"

echo "== PDFluent macOS release =="
echo "   version : ${VERSION}"
echo "   arch    : ${ARCH}"
echo "   dmg     : ${DMG_NAME}"
echo "   bucket  : ${BUCKET}"
echo "   url     : ${PUBLIC_BASE}/${KEY}"
echo

# ── 1. build the universal .app ──────────────────────────────────────────────
# Updater artifacts (.app.tar.gz + .sig) require the production updater key.
# Produce them ONLY when TAURI_SIGNING_PRIVATE_KEY is present (GA auto-update);
# otherwise build direct-download-only so no key is needed. GA code-signing +
# notarization are read natively by Tauri from the environment when set
# (APPLE_SIGNING_IDENTITY + APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID or
# APPLE_API_KEY/APPLE_API_ISSUER/APPLE_API_KEY_PATH) — docs/RELEASE_RUNBOOK_GA.md.
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then UPDATER=true; else UPDATER=false; fi
echo "== 1/4  tauri build (universal .app; updater artifacts: ${UPDATER}) =="
npm run tauri build -- --target universal-apple-darwin --bundles app \
  --config "{\"bundle\":{\"createUpdaterArtifacts\":${UPDATER}}}"

APP="$(/usr/bin/find src-tauri/target/universal-apple-darwin/release/bundle/macos -maxdepth 1 -name '*.app' | head -1)"
[ -d "${APP}" ] || { echo "✘ No .app under src-tauri/target/universal-apple-darwin/release/bundle/macos"; exit 1; }
echo "   app: ${APP}"

# ── Frontend-embed gate (mandatory) ──────────────────────────────────────────
# Fail BEFORE packaging/publishing if the built .app embeds a stale frontend
# bundle instead of the current dist/index.html one (the defect that shipped
# beta.17 behind an old index-*.js). Same check as the post-build CI gate.
echo "== embed gate (no stale frontend) =="
node "${REPO_ROOT}/scripts/verify-frontend-embed.mjs" "${APP}"

# Stage the signed updater artifacts for local latest.json generation
# (scripts/ci-generate-latest-json.mjs reads artifacts/macos/*.app.tar.gz.sig).
# Upload + latest.json publishing remain separate, approval-gated steps.
if [ "${UPDATER}" = "true" ]; then
  mkdir -p "${REPO_ROOT}/artifacts/macos"
  /usr/bin/find src-tauri/target/universal-apple-darwin/release/bundle -name '*.app.tar.gz'     -exec cp {} "${REPO_ROOT}/artifacts/macos/" \;
  /usr/bin/find src-tauri/target/universal-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -exec cp {} "${REPO_ROOT}/artifacts/macos/" \;
  US="$(/usr/bin/find "${REPO_ROOT}/artifacts/macos" -name '*.app.tar.gz.sig' | head -1)"
  [ -n "${US}" ] || { echo "✘ updater enabled but no .app.tar.gz.sig produced (key missing/invalid)"; exit 1; }
  echo "   updater: staged $(basename "${US%.sig}") (+ .sig) → artifacts/macos/"
fi

# ── 2. package a premium, branded DMG (background + arrow + positioned icons) ─
echo "== 2/4  package DMG =="
OUT="${REPO_ROOT}/dist-release/${DMG_NAME}"
BG="${REPO_ROOT}/scripts/dmg/bg.png"   # bg@2x.png alongside → Retina
mkdir -p "$(dirname "${OUT}")"; rm -f "${OUT}"
STAGE="$(mktemp -d)"; ditto "${APP}" "${STAGE}/${PRODUCT}.app"
hdiutil detach "/Volumes/${PRODUCT}" >/dev/null 2>&1 || true

# Preferred: styled DMG via create-dmg (needs a GUI session for osascript — fine
# when run locally on a Mac). Icon positions match scripts/dmg/bg.svg.
if command -v create-dmg >/dev/null 2>&1 && [ -f "${BG}" ]; then
  create-dmg \
    --volname "${PRODUCT}" --background "${BG}" \
    --window-pos 200 120 --window-size 660 400 --icon-size 120 \
    --icon "${PRODUCT}.app" 165 188 --app-drop-link 495 188 \
    --hide-extension "${PRODUCT}.app" --no-internet-enable \
    "${OUT}" "${STAGE}" || true
fi
# Fallback: plain drag-to-Applications DMG (headless / no create-dmg).
if [ ! -f "${OUT}" ]; then
  echo "   (create-dmg unavailable/failed — plain DMG fallback)"
  ln -s /Applications "${STAGE}/Applications"
  hdiutil create -volname "${PRODUCT}" -srcfolder "${STAGE}" -ov -format UDZO "${OUT}" >/dev/null
fi
rm -rf "${STAGE}"
SIZE="$(du -h "${OUT}" | cut -f1 | tr -d ' ')"
echo "   dmg: ${OUT} (${SIZE})"

# ── 3. upload to R2 + update the public release manifest ─────────────────────
echo "== 3/4  upload to R2 + update manifest =="
# publish-artifact.mjs uploads <version>/<file> AND merges this platform into
# releases/manifest.json so the website auto-points at it. Platform is inferred
# from the filename (…_aarch64.dmg → darwin-aarch64).
WRANGLER="${WRANGLER}" CF_R2_BUCKET_NAME="${BUCKET}" \
  node "${REPO_ROOT}/scripts/publish-artifact.mjs" --version "${VERSION}" --file "${OUT}"

# ── 4. verify the public URL ─────────────────────────────────────────────────
echo "== 4/4  verify =="
sleep 3
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -I "${PUBLIC_BASE}/${KEY}" || echo 000)"
if [ "${CODE}" = "200" ]; then
  echo "✓ Live: ${PUBLIC_BASE}/${KEY} (HTTP 200, ${SIZE})"
else
  echo "✘ ${PUBLIC_BASE}/${KEY} returned HTTP ${CODE} (R2 may still be propagating; re-check)"
  exit 1
fi

echo
echo "Done. If this is a new version, make sure the website download page"
echo "(src/pages/DownloadPage.tsx → EDITOR_VERSION) matches ${VERSION}, then redeploy."
