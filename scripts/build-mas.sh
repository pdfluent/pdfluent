#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# build-mas.sh — build, sign and package the Mac App Store (MAS) build, then
# upload it to App Store Connect. DISTINCT from the direct-download flow
# (scripts/notarize-macos.sh): the MAS build is free (no in-app licensing), has
# the self-updater compiled out, is App-Sandboxed, signed with Apple
# Distribution + an embedded provisioning profile, and delivered as a signed
# .pkg via altool.
#
# Build numbers. App Store Connect rejects an upload whose CFBundleVersion is
# not strictly greater than every build already uploaded for the same marketing
# version, and it never forgets a number — not even from a build that was
# rejected. So the counter cannot live in a shell default: store/mas/build-number
# is committed, holds the last number this script handed out, and the script
# refuses any number that does not exceed it. The number is written back BEFORE
# the build, not after: burning a number on a failed build costs nothing, while
# reusing one costs a round trip through App Store Connect.
#
#   MAS_DRY_RUN=1 bash scripts/build-mas.sh   resolve + validate the number, print
#                                             it, change nothing, build nothing
#   MAS_BUILD_NUMBER=<n>                      use n instead of "last + 1"
#   MAS_BUILD_NUMBER_FILE=<path>              point the counter elsewhere (tests)
#
# Reuses the notary API key (keychain profile is Developer-ID-only; altool needs
# the raw key), so pass the key id + issuer + .p8 path via env:
#   APPLE_API_KEY_ID=MX7438T6RJ APPLE_API_ISSUER=<issuer-uuid> \
#   APPLE_API_KEY_PATH=~/…/AuthKey_MX7438T6RJ.p8 bash scripts/build-mas.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

APP_IDENTITY="Apple Distribution: Innovation Trigger B.V. (58Z6SVW7CN)"
PKG_IDENTITY="3rd Party Mac Developer Installer: Innovation Trigger B.V. (58Z6SVW7CN)"
PROFILE="src-tauri/PDFluent_MAS.provisionprofile"
INHERIT_ENT="${REPO_ROOT}/src-tauri/Entitlements.appstore.inherit.plist"

CONF="src-tauri/tauri.conf.json"
MAS_CONF="src-tauri/tauri.mas.conf.json"
# The overlay carries the marketing version that is actually shipped to the
# store (CFBundleShortVersionString); tauri.conf.json still names the direct-
# download line. Naming the pkg after the overlay keeps the file on disk and the
# version in App Store Connect the same string.
VERSION="$(node -p "require('./${MAS_CONF}').version || require('./${CONF}').version")"
PRODUCT="$(node -p "require('./${CONF}').productName")"

# ── 0. build number ──────────────────────────────────────────────────────────
BUILD_NUMBER_FILE="${MAS_BUILD_NUMBER_FILE:-${REPO_ROOT}/store/mas/build-number}"
[ -f "${BUILD_NUMBER_FILE}" ] \
  || { echo "✘ No build-number counter at ${BUILD_NUMBER_FILE}"; exit 1; }
RECORDED="$(tr -d '[:space:]' < "${BUILD_NUMBER_FILE}")"
case "${RECORDED}" in
  ''|*[!0-9]*) echo "✘ Counter ${BUILD_NUMBER_FILE} is not a whole number: '${RECORDED}'"; exit 1 ;;
esac
# An empty MAS_BUILD_NUMBER is a mistake, not a request for the default: a
# caller that set the variable and produced nothing should hear about it.
if [ -n "${MAS_BUILD_NUMBER+set}" ]; then
  BUILD_NUMBER="${MAS_BUILD_NUMBER}"
else
  BUILD_NUMBER="$((RECORDED + 1))"
fi
case "${BUILD_NUMBER}" in
  ''|*[!0-9]*) echo "✘ MAS_BUILD_NUMBER is not a whole number: '${BUILD_NUMBER}'"; exit 1 ;;
esac
if [ "${BUILD_NUMBER}" -le "${RECORDED}" ]; then
  echo "✘ Build number ${BUILD_NUMBER} does not exceed the last one handed out (${RECORDED})."
  echo "  App Store Connect refuses a CFBundleVersion it has already seen for version ${VERSION}."
  exit 1
fi
if [ -n "${MAS_DRY_RUN:-}" ]; then
  echo "CFBundleVersion=${BUILD_NUMBER}"
  echo "   dry run — counter unchanged, nothing built"
  exit 0
fi
printf '%s\n' "${BUILD_NUMBER}" > "${BUILD_NUMBER_FILE}"
echo "== 0/4  build number ${RECORDED} -> ${BUILD_NUMBER} (recorded in ${BUILD_NUMBER_FILE}) =="

# ── preflight ────────────────────────────────────────────────────────────────
security find-identity -v | grep -q "Apple Distribution: Innovation Trigger" \
  || { echo "✘ Missing 'Apple Distribution' cert (task M2)"; exit 1; }
security find-identity -v | grep -q "3rd Party Mac Developer Installer: Innovation Trigger" \
  || { echo "✘ Missing 'Mac Installer Distribution' cert (task M2)"; exit 1; }
[ -f "${PROFILE}" ] || { echo "✘ Missing provisioning profile at ${PROFILE} (task M2)"; exit 1; }

rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true

# ── 1. build the MAS .app ────────────────────────────────────────────────────
# MAS_BUILD=1 hides the updater + license UI (vite define); --no-default-features
# drops the updater/process plugins; the config overlay applies MAS entitlements,
# Apple Distribution signing and the embedded provisioning profile.
echo "== 1/4  build MAS .app =="
# Cargo flags (--no-default-features / --features) must follow a trailing `--`;
# tauri build forwards everything after it to `cargo build`.
MAS_BUILD=1 npm run tauri build -- \
  --target universal-apple-darwin --bundles app \
  --config src-tauri/tauri.mas.conf.json \
  -- --no-default-features --features custom-protocol

APP="$(/usr/bin/find src-tauri/target/universal-apple-darwin/release/bundle/macos -maxdepth 1 -name '*.app' | head -1)"
[ -d "${APP}" ] || { echo "✘ No .app produced"; exit 1; }

# ── 2. sign nested helpers (app-sandbox + inherit), then re-seal the app ──────
# Same lesson as notarize-macos.sh: Tauri does not sign extra bundled binaries.
echo "== 2/4  sign nested helpers + re-seal =="
# The bundle's main executable is the single file in Contents/MacOS; find it
# directly (a relative path trips `defaults read`, which wants an absolute one).
MAIN_EXE="$(/usr/bin/find "${APP}/Contents/MacOS" -maxdepth 1 -type f -perm -u+x | head -1)"
while IFS= read -r bin; do
  [ "${bin}" = "${MAIN_EXE}" ] && continue
  file -b "${bin}" | grep -q "Mach-O" || continue
  codesign --force --sign "${APP_IDENTITY}" --entitlements "${INHERIT_ENT}" "${bin}"
done < <(find "${APP}/Contents" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))
# App Store requires purely-numeric CFBundle versions (no "-beta.NN"). The
# marketing version (CFBundleShortVersionString) is 1.0.0 from tauri.mas.conf.json;
# CFBundleVersion is the strictly increasing build number resolved in step 0 from
# store/mas/build-number. Set BEFORE the re-seal so the signature covers the
# edited Info.plist.
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${BUILD_NUMBER}" "${APP}/Contents/Info.plist"
echo "   CFBundleShortVersionString=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist"), CFBundleVersion=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${APP}/Contents/Info.plist")"
# Re-seal the outer app with the MAS entitlements (Tauri already signed it once
# during the build; re-seal so the outer signature covers the re-signed helpers).
codesign --force --sign "${APP_IDENTITY}" \
  --entitlements "${REPO_ROOT}/src-tauri/Entitlements.appstore.plist" "${APP}"
codesign --verify --deep --strict --verbose=2 "${APP}"

# ── 3. package the signed installer .pkg ─────────────────────────────────────
echo "== 3/4  productbuild .pkg =="
OUT="${REPO_ROOT}/dist-release/${PRODUCT}_${VERSION}_mas.pkg"
mkdir -p "$(dirname "${OUT}")"; rm -f "${OUT}"
xcrun productbuild --sign "${PKG_IDENTITY}" \
  --component "${APP}" /Applications "${OUT}"
echo "   pkg: ${OUT}"

# ── 3.5 read the signature back ──────────────────────────────────────────────
# Signing three times with three plists gives three chances to sign with the
# wrong one, and every wrong result still installs and launches. Read what is in
# the signature and compare it with what we meant to sign.
echo "== 3.5  verify entitlements =="
node "${REPO_ROOT}/scripts/mas-entitlements.mjs" --pkg "${OUT}"

# ── 4. upload to App Store Connect (optional) ────────────────────────────────
# Upload only when the App Store Connect API key is provided; otherwise stop at
# the signed .pkg so it can be uploaded with the Transporter app (drag-and-drop,
# uses the user's session — no .p8 needed).
echo "== 4/4  upload =="
if [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; then
  xcrun altool --upload-app --type macos --file "${OUT}" \
    --apiKey "${APPLE_API_KEY_ID}" --apiIssuer "${APPLE_API_ISSUER}"
  echo "✓ Uploaded ${OUT} to App Store Connect."
else
  echo "   APPLE_API_KEY_ID not set — skipping upload."
  echo "   Signed package ready: ${OUT}"
  echo "   Upload it with the Transporter app (drag the .pkg in), or re-run with"
  echo "   APPLE_API_KEY_ID/APPLE_API_ISSUER set to altool-upload."
fi
