#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# notarize-macos.sh — build, Developer-ID-sign, notarize and staple the macOS
# universal .app + .dmg for DIRECT DOWNLOAD (not the Mac App Store). Also
# produces a signed updater artifact (see step 3b) when
# TAURI_SIGNING_PRIVATE_KEY[_PATH] is set — otherwise that step is skipped and
# the build stays direct-download-only. Does NOT publish; publishing to R2 is a
# separate, approval-gated step.
#
#   scripts/notarize-macos.sh [version]
#
# Signing:
#   bundle.macOS.signingIdentity in tauri.conf.json must be the Developer ID
#   Application identity (Tauri then signs with Hardened Runtime + secure
#   timestamp using Entitlements.plist). Verify with:
#       security find-identity -v -p codesigning
#
# Notarization credentials:
#   Uses a notarytool keychain profile (default "pdfluent-notary"), created once:
#       xcrun notarytool store-credentials pdfluent-notary \
#         --key <AuthKey_XXXX.p8> --key-id <KEYID> --issuer <ISSUER-UUID>
#   Override the profile name with NOTARY_PROFILE=<name>.
#
# Updater artifact (optional, step 3b):
#   Set TAURI_SIGNING_PRIVATE_KEY_PATH (or TAURI_SIGNING_PRIVATE_KEY with the
#   raw key value) + TAURI_SIGNING_PRIVATE_KEY_PASSWORD if the key needs one.
#   The production key lives in the pdfluent-editor GitLab project's CI/CD
#   variables (see docs/RELEASE_RUNBOOK_GA.md §1) — never print, log or commit
#   it; fetch it to a 600-permission temp file, use it, delete it. The
#   resulting artifacts/macos/*.app.tar.gz(.sig) is staged for
#   scripts/ci-generate-latest-json.mjs; uploading it and flipping latest.json
#   are separate, approval-gated steps — run a real update smoke-test first.
#
# Two notarization passes (belt-and-suspenders so the app passes Gatekeeper even
# offline, and the DMG mounts without warning):
#   1. Notarize + staple the .app  → app carries its own ticket.
#   2. Package the DMG from the stapled app, notarize + staple the DMG.
set -euo pipefail

NOTARY_PROFILE="${NOTARY_PROFILE:-pdfluent-notary}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

CONF="src-tauri/tauri.conf.json"
VERSION="${1:-$(node -p "require('./${CONF}').version")}"
PRODUCT="$(node -p "require('./${CONF}').productName")"
ARCH="universal"
DMG_NAME="${PRODUCT}_${VERSION}_${ARCH}.dmg"
OUT="${REPO_ROOT}/dist-release/${DMG_NAME}"

echo "== PDFluent macOS notarize =="
echo "   version : ${VERSION}"
echo "   product : ${PRODUCT}"
echo "   dmg     : ${DMG_NAME}"
echo "   profile : ${NOTARY_PROFILE}"
echo

# Fail fast if the Developer ID identity is missing.
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "✘ No 'Developer ID Application' identity in the keychain. Aborting."; exit 1
fi

rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true

IDENTITY="Developer ID Application: Innovation Trigger B.V. (58Z6SVW7CN)"
ENTITLEMENTS="${REPO_ROOT}/src-tauri/Entitlements.plist"

# ── 1. build + Developer-ID-sign the universal .app ──────────────────────────
# Direct-download only: no updater artifacts (no production minisign key here).
# SKIP_BUILD=1 reuses an existing build (re-sign + re-notarize without rebuild).
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "== 1/6  tauri build (universal .app, Developer ID + Hardened Runtime) =="
  npm run tauri build -- --target universal-apple-darwin --bundles app \
    --config '{"bundle":{"createUpdaterArtifacts":false}}'
else
  echo "== 1/6  SKIP_BUILD=1 — reusing existing build =="
fi

APP="$(/usr/bin/find src-tauri/target/universal-apple-darwin/release/bundle/macos -maxdepth 1 -name '*.app' | head -1)"
[ -d "${APP}" ] || { echo "✘ No .app produced"; exit 1; }
echo "   app: ${APP}"

# ── 1b. sign nested Mach-O binaries, then re-seal the outer app ───────────────
# Tauri signs the app's main executable but NOT extra binaries bundled under
# Resources (e.g. resources/bin/pdfluent_translate_helper). Apple's notary
# rejects ANY nested executable that lacks Hardened Runtime + a secure timestamp.
# Sign every nested Mach-O inside-out with Developer ID, then re-seal the bundle
# so its seal covers the freshly-signed nested code (no --deep; Apple-discouraged).
echo "== 1b/6  sign nested binaries + re-seal app =="
MAIN_EXE="${APP}/Contents/MacOS/$(defaults read "${APP}/Contents/Info" CFBundleExecutable 2>/dev/null || echo pdfluent-desktop)"
while IFS= read -r bin; do
  [ "${bin}" = "${MAIN_EXE}" ] && continue
  file -b "${bin}" | grep -q "Mach-O" || continue   # skip scripts, data, fonts
  echo "   sign nested: ${bin#${APP}/}"
  codesign --force --options runtime --timestamp -s "${IDENTITY}" "${bin}"
done < <(find "${APP}/Contents" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))
# Re-seal the outer bundle with the app's entitlements + Hardened Runtime.
codesign --force --options runtime --timestamp --entitlements "${ENTITLEMENTS}" -s "${IDENTITY}" "${APP}"
codesign --verify --deep --strict --verbose=2 "${APP}"
echo "   ✓ nested binaries signed + app re-sealed"

# ── 2. embed gate + signature sanity ─────────────────────────────────────────
echo "== 2/6  embed gate + signature sanity =="
node "${REPO_ROOT}/scripts/verify-frontend-embed.mjs" "${APP}"

# Assert Hardened Runtime (flags=0x10000 runtime) + a Developer ID authority.
codesign -dv --verbose=4 "${APP}" 2>&1 | tee /tmp/pdfluent-codesign.txt
grep -q "flags=.*runtime" /tmp/pdfluent-codesign.txt \
  || { echo "✘ app is NOT signed with Hardened Runtime"; exit 1; }
grep -q "Authority=Developer ID Application: Innovation Trigger" /tmp/pdfluent-codesign.txt \
  || { echo "✘ app is NOT signed with the Developer ID Application identity"; exit 1; }
echo "   ✓ Hardened Runtime + Developer ID authority present"

# ── 3. notarize the .app (pass 1) ────────────────────────────────────────────
echo "== 3/6  notarize .app =="
APPZIP="$(mktemp -d)/PDFluent-app.zip"
/usr/bin/ditto -c -k --keepParent "${APP}" "${APPZIP}"
SUB1="$(xcrun notarytool submit "${APPZIP}" --keychain-profile "${NOTARY_PROFILE}" --wait 2>&1)"
echo "${SUB1}"
echo "${SUB1}" | grep -q "status: Accepted" || {
  ID1="$(echo "${SUB1}" | awk '/id:/{print $2; exit}')"
  echo "✘ app notarization not Accepted. Log for ${ID1}:"
  [ -n "${ID1}" ] && xcrun notarytool log "${ID1}" --keychain-profile "${NOTARY_PROFILE}" || true
  exit 1
}
xcrun stapler staple "${APP}"
xcrun stapler validate "${APP}"
echo "   ✓ .app notarized + stapled"

# ── 3b. build + sign the updater artifact (only if a production key is set) ──
# MUST be built from the FINAL notarized+stapled ${APP}, never from the raw
# post-build app: at that earlier point the nested binaries (e.g. the OCR
# helper) aren't individually signed yet and there's no notarization ticket, so
# an artifact packaged then would ship broken to anyone whose auto-updater
# applies it — it would fail Gatekeeper/codesign the moment a nested helper
# actually runs. Round-trip verified below before it's ever signed.
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  echo "== 3b/6  build + sign updater artifact (from the final notarized app) =="
  mkdir -p "${REPO_ROOT}/artifacts/macos"
  UPDATER_TARBALL="${REPO_ROOT}/artifacts/macos/${PRODUCT}_${VERSION}_aarch64.app.tar.gz"
  rm -f "${UPDATER_TARBALL}" "${UPDATER_TARBALL}.sig"
  COPYFILE_DISABLE=1 tar czf "${UPDATER_TARBALL}" -C "$(dirname "${APP}")" "$(basename "${APP}")"

  # Round-trip verification: extract into a clean dir and re-run the same checks
  # the shipped .app must pass, proving the archive step didn't strip the
  # nested-binary signatures or the notarization ticket before trusting it.
  VERIFY_DIR="$(mktemp -d)"
  tar xzf "${UPDATER_TARBALL}" -C "${VERIFY_DIR}"
  EXTRACTED_APP="${VERIFY_DIR}/$(basename "${APP}")"
  codesign --verify --deep --strict --verbose=2 "${EXTRACTED_APP}" \
    || { echo "✘ updater artifact FAILED codesign verify after round-trip — not signing/publishing"; exit 1; }
  SPCTL_OUT="$(spctl -a -vvv "${EXTRACTED_APP}" 2>&1)"; echo "${SPCTL_OUT}"
  echo "${SPCTL_OUT}" | grep -q "accepted" \
    || { echo "✘ updater artifact FAILED Gatekeeper assessment after round-trip — not signing/publishing"; exit 1; }
  xcrun stapler validate "${EXTRACTED_APP}" \
    || { echo "✘ updater artifact FAILED stapler validate after round-trip — notarization ticket lost — not signing/publishing"; exit 1; }
  rm -rf "${VERIFY_DIR}"
  echo "   ✓ round-trip verified: codesign + Gatekeeper + notarization ticket all intact"

  npx tauri signer sign "${UPDATER_TARBALL}"
  [ -f "${UPDATER_TARBALL}.sig" ] || { echo "✘ signer did not produce a .sig"; exit 1; }

  # Verify the signature is from the TRUSTED pubkey (defends against a wrong/stale key).
  KEYID="$(node -e '
    const fs=require("fs");
    const t=Buffer.from(fs.readFileSync(process.argv[1],"utf8").trim(),"base64").toString();
    const l2=t.split("\n").filter(x=>x&&!/^untrusted|^trusted/.test(x))[0];
    console.log(Buffer.from(Buffer.from(l2,"base64").subarray(2,10)).reverse().toString("hex").toUpperCase());
  ' "${UPDATER_TARBALL}.sig")"
  if [ "${KEYID}" != "9E2BAD9AABF995DD" ]; then
    echo "✘ updater .sig key ID ${KEYID} != trusted 9E2BAD9AABF995DD — REFUSING to keep"
    rm -f "${UPDATER_TARBALL}" "${UPDATER_TARBALL}.sig"
    exit 1
  fi
  echo "   ✓ updater artifact signed + verified: ${UPDATER_TARBALL} (key ${KEYID})"
else
  echo "== 3b/6  SKIPPED — no TAURI_SIGNING_PRIVATE_KEY set, direct-download only =="
fi

# ── 4. package the DMG from the stapled app ──────────────────────────────────
echo "== 4/6  package DMG =="
BG="${REPO_ROOT}/scripts/dmg/bg.png"
mkdir -p "$(dirname "${OUT}")"; rm -f "${OUT}"
STAGE="$(mktemp -d)"; /usr/bin/ditto "${APP}" "${STAGE}/${PRODUCT}.app"
hdiutil detach "/Volumes/${PRODUCT}" >/dev/null 2>&1 || true
if command -v create-dmg >/dev/null 2>&1 && [ -f "${BG}" ]; then
  create-dmg \
    --volname "${PRODUCT}" --background "${BG}" \
    --window-pos 200 120 --window-size 660 400 --icon-size 120 \
    --icon "${PRODUCT}.app" 165 188 --app-drop-link 495 188 \
    --hide-extension "${PRODUCT}.app" --no-internet-enable \
    "${OUT}" "${STAGE}" || true
fi
if [ ! -f "${OUT}" ]; then
  echo "   (create-dmg unavailable/failed — plain DMG fallback)"
  ln -s /Applications "${STAGE}/Applications"
  hdiutil create -volname "${PRODUCT}" -srcfolder "${STAGE}" -ov -format UDZO "${OUT}" >/dev/null
fi
rm -rf "${STAGE}"
echo "   dmg: ${OUT}"

# ── 5. sign + notarize the DMG (pass 2) ──────────────────────────────────────
# Code-sign the DMG itself with Developer ID so `spctl` has a usable signature to
# assess (a bare hdiutil/create-dmg image is unsigned; notarization alone leaves
# spctl reporting "no usable signature"). Sign → notarize → staple.
echo "== 5/6  sign + notarize DMG =="
codesign --force --timestamp -s "${IDENTITY}" "${OUT}"
SUB2="$(xcrun notarytool submit "${OUT}" --keychain-profile "${NOTARY_PROFILE}" --wait 2>&1)"
echo "${SUB2}"
echo "${SUB2}" | grep -q "status: Accepted" || {
  ID2="$(echo "${SUB2}" | awk '/id:/{print $2; exit}')"
  echo "✘ DMG notarization not Accepted. Log for ${ID2}:"
  [ -n "${ID2}" ] && xcrun notarytool log "${ID2}" --keychain-profile "${NOTARY_PROFILE}" || true
  exit 1
}
xcrun stapler staple "${OUT}"
xcrun stapler validate "${OUT}"
echo "   ✓ DMG notarized + stapled"

# ── 6. Gatekeeper verification ───────────────────────────────────────────────
echo "== 6/6  Gatekeeper verify =="
echo "-- app --"
spctl -a -vvv "${APP}" 2>&1 || true
codesign --verify --deep --strict --verbose=2 "${APP}" 2>&1 || true
echo "-- dmg --"
spctl -a -t open --context context:primary-signature -vvv "${OUT}" 2>&1 || true

SHA="$(shasum -a 256 "${OUT}" | awk '{print $1}')"
SIZE="$(du -h "${OUT}" | cut -f1 | tr -d ' ')"
echo
echo "== DONE (NOT published) =="
echo "   dmg    : ${OUT} (${SIZE})"
echo "   sha256 : ${SHA}"
echo "   Publish is a separate step: scripts/publish-artifact.mjs (approval-gated)."
