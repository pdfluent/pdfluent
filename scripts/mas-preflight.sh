#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# mas-preflight.sh — everything the Mac App Store build needs that can be known
# without building: the three signing identities, the provisioning profile, the
# OCR component folder and the upload credentials. Builds, uploads and changes
# nothing; prints no secret (key ids and file names only).
#
#   bash scripts/mas-preflight.sh                  full check, incl. signing probes
#   MAS_PREFLIGHT_SKIP_SIGN=1 bash scripts/mas-preflight.sh   no signing probes
#
# Why signing probes. `security find-identity` lists a key whose use still needs
# a click: the keychain asks "codesign wants to sign using key ..." and waits for
# a person. In a night run that is a hang, not an error. So each identity signs a
# throwaway file under a watchdog; if the watchdog fires, the key needs "Always
# Allow" (owner action, once per key) and this script says which key.
#
# Env:
#   PDFLUENT_OCR_COMPONENT_BUILD  OCR --out folder (required, as in build-mas.sh)
#   APPLE_API_KEY_ID / APPLE_API_ISSUER / APPLE_API_KEY_PATH   altool upload
#   MAS_PROFILE                   profile to check (default src-tauri/PDFluent_MAS.provisionprofile)
#   MAS_PROBE_TIMEOUT             seconds before a probe counts as a prompt (default 45)
set -uo pipefail

# shellcheck source=mas-arch-guard.sh
. "$(dirname "${BASH_SOURCE[0]}")/mas-arch-guard.sh"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

APP_IDENTITY="Apple Distribution: Innovation Trigger B.V. (58Z6SVW7CN)"
PKG_IDENTITY="3rd Party Mac Developer Installer: Innovation Trigger B.V. (58Z6SVW7CN)"
PROFILE="${MAS_PROFILE:-src-tauri/PDFluent_MAS.provisionprofile}"
APP_ID="58Z6SVW7CN.com.pdfluent.app"
PROBE_TIMEOUT="${MAS_PROBE_TIMEOUT:-45}"
MIN_PROFILE_DAYS=30

FAILED=0
ok()   { echo "  ok    $*"; }
bad()  { echo "  FAIL  $*"; FAILED=1; }
info() { echo "  info  $*"; }

echo "== MAS preflight =="

# ── identities ───────────────────────────────────────────────────────────────
echo "-- signing identities"
IDENTITIES="$(security find-identity -v 2>/dev/null)"
for id in "${APP_IDENTITY}" "${PKG_IDENTITY}"; do
  if printf '%s\n' "${IDENTITIES}" | grep -qF "\"${id}\""; then ok "in keychain: ${id}"; else bad "not in keychain (or not valid): ${id}"; fi
done

# ── provisioning profile ─────────────────────────────────────────────────────
echo "-- provisioning profile (${PROFILE})"
if [ ! -f "${PROFILE}" ]; then
  bad "missing. It is git-ignored (*.provisionprofile), so a fresh worktree never has it. Copy the file from the machine that holds it; the one dated 2026-07-08 is in ~/Documents/PDFluent/pdfluent-v3/src-tauri/."
else
  PLIST="$(mktemp "${TMPDIR:-/tmp}/mas-profile.XXXXXX")"
  if security cms -D -i "${PROFILE}" > "${PLIST}" 2>/dev/null; then
    pv() { plutil -extract "$1" raw -o - "${PLIST}" 2>/dev/null; }
    EXPIRES="$(pv ExpirationDate)"
    EXP_EPOCH="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "${EXPIRES}" +%s 2>/dev/null || echo 0)"
    DAYS=$(( (EXP_EPOCH - $(date +%s)) / 86400 ))
    if [ "${EXP_EPOCH}" -eq 0 ]; then bad "cannot read the expiry date"
    elif [ "${DAYS}" -lt "${MIN_PROFILE_DAYS}" ]; then bad "expires ${EXPIRES} (${DAYS} days); regenerate it in the developer portal"
    else ok "valid until ${EXPIRES} (${DAYS} days)"; fi
    [ "$(pv Platform.0)" = "OSX" ] && ok "platform OSX" || bad "platform is not OSX"
    [ "$(pv Entitlements.com\\.apple\\.application-identifier)" = "${APP_ID}" ] \
      && ok "application-identifier ${APP_ID}" || bad "application-identifier is not ${APP_ID}"
    [ "$(pv Entitlements.com\\.apple\\.developer\\.team-identifier)" = "58Z6SVW7CN" ] \
      && ok "team-identifier 58Z6SVW7CN" || bad "team-identifier is not 58Z6SVW7CN"
    # The profile only works if it lists the certificate the app is signed with.
    WANT="$(security find-certificate -c "${APP_IDENTITY}" -Z 2>/dev/null | awk '/SHA-1 hash:/ {print $3}')"
    FOUND=0; i=0
    while CERT="$(pv DeveloperCertificates.${i})" && [ -n "${CERT}" ]; do
      HASH="$(printf '%s' "${CERT}" | base64 -D 2>/dev/null | shasum -a 1 | awk '{print toupper($1)}')"
      [ -n "${WANT}" ] && [ "${HASH}" = "${WANT}" ] && FOUND=1
      i=$((i + 1))
    done
    [ "${FOUND}" -eq 1 ] && ok "lists the Apple Distribution certificate in the keychain" \
      || bad "does not list the Apple Distribution certificate in the keychain (profile made for another cert?)"
    # The entitlements we sign with must be a subset of what the profile grants
    # for the keys it constrains (application-identifier, team-identifier).
    for k in com.apple.application-identifier com.apple.developer.team-identifier; do
      a="$(plutil -extract "${k//./\\.}" raw -o - src-tauri/Entitlements.appstore.plist 2>/dev/null)"
      b="$(pv "Entitlements.${k//./\\.}")"
      [ -n "${a}" ] && [ "${a}" = "${b}" ] || bad "Entitlements.appstore.plist ${k}='${a}' differs from the profile ('${b}')"
    done
  else
    bad "not a decodable provisioning profile"
  fi
  rm -f "${PLIST}"
fi

# ── OCR component ────────────────────────────────────────────────────────────
echo "-- OCR component"
if [ -z "${PDFLUENT_OCR_COMPONENT_BUILD:-}" ]; then
  bad "PDFLUENT_OCR_COMPONENT_BUILD is not set (every build bundles OCR)"
else
  for d in macos-aarch64/bin/tesseract macos-x86_64/bin/tesseract tessdata; do
    [ -e "${PDFLUENT_OCR_COMPONENT_BUILD}/${d}" ] && ok "${d}" || bad "${PDFLUENT_OCR_COMPONENT_BUILD}/${d} missing"
  done
fi

# ── upload route ─────────────────────────────────────────────────────────────
echo "-- upload route"
if [ -n "${APPLE_API_KEY_ID:-}" ]; then
  [ -n "${APPLE_API_ISSUER:-}" ] && ok "APPLE_API_ISSUER set" || bad "APPLE_API_KEY_ID set but APPLE_API_ISSUER is not"
  KEYFILE=""
  if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
    KEYFILE="${APPLE_API_KEY_PATH/#\~/$HOME}"
    [ "$(basename "${KEYFILE}")" = "AuthKey_${APPLE_API_KEY_ID}.p8" ] \
      || bad "altool finds the key by file name: ${KEYFILE} must be named AuthKey_${APPLE_API_KEY_ID}.p8"
  else
    for d in "${API_PRIVATE_KEYS_DIR:-}" ./private_keys "${HOME}/private_keys" "${HOME}/.private_keys" "${HOME}/.appstoreconnect/private_keys"; do
      [ -n "${d}" ] && [ -f "${d}/AuthKey_${APPLE_API_KEY_ID}.p8" ] && KEYFILE="${d}/AuthKey_${APPLE_API_KEY_ID}.p8" && break
    done
  fi
  if [ -n "${KEYFILE}" ] && [ -f "${KEYFILE}" ]; then ok "App Store Connect API key ${APPLE_API_KEY_ID} found (altool upload)"
  else bad "API key AuthKey_${APPLE_API_KEY_ID}.p8 not found"; fi
else
  info "no APPLE_API_KEY_ID: the build stops at the signed .pkg; upload with Transporter (Route A, needs the owner's Apple ID session)"
fi
[ -d /Applications/Transporter.app ] && info "Transporter.app installed" || info "Transporter.app not installed"

# ── signing probes (non-interactive) ─────────────────────────────────────────
if [ -z "${MAS_PREFLIGHT_SKIP_SIGN:-}" ]; then
  echo "-- signing probes (a key that needs a click shows up as a timeout, ${PROBE_TIMEOUT}s)"
  PROBE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mas-probe.XXXXXX")"
  cp /bin/echo "${PROBE_DIR}/probe-app"
  mkdir "${PROBE_DIR}/root"; cp /bin/echo "${PROBE_DIR}/root/probe-payload"

  # probe <label> <command...>: run under a watchdog; 0 = signed, 124 = waiting on a person.
  probe() {
    local label="$1"; shift
    "$@" >"${PROBE_DIR}/out" 2>&1 &
    local pid=$!
    ( sleep "${PROBE_TIMEOUT}"; kill "${pid}" 2>/dev/null ) &
    local dog=$!
    wait "${pid}" 2>/dev/null; local rc=$?
    kill "${dog}" 2>/dev/null; wait "${dog}" 2>/dev/null
    if [ "${rc}" -eq 0 ]; then ok "${label} signs without a prompt"
    elif [ "${rc}" -ge 128 ]; then bad "${label}: no answer in ${PROBE_TIMEOUT}s. The keychain is waiting for a click. OWNER: run this script at the Mac, press 'Always Allow' on the dialog for this key, run it again."
    else bad "${label}: $(grep -E 'errSec|error|rror:' "${PROBE_DIR}/out" | head -1)"; fi
  }
  probe "Apple Distribution (app + helpers)" codesign --force --sign "${APP_IDENTITY}" "${PROBE_DIR}/probe-app"
  # build-mas.sh signs the .pkg with productsign (productbuild/pkgbuild --sign prompt).
  xcrun pkgbuild --root "${PROBE_DIR}/root" --identifier com.pdfluent.preflight --version 1 --install-location /tmp/pdfluent-preflight "${PROBE_DIR}/unsigned.pkg" >/dev/null 2>&1
  probe "3rd Party Mac Developer Installer (productsign)" productsign --sign "${PKG_IDENTITY}" "${PROBE_DIR}/unsigned.pkg" "${PROBE_DIR}/probe.pkg"
  rm -f "${PROBE_DIR}/probe-app" "${PROBE_DIR}/root/probe-payload" "${PROBE_DIR}/probe.pkg" "${PROBE_DIR}/unsigned.pkg" "${PROBE_DIR}/out"
  rmdir "${PROBE_DIR}/root" "${PROBE_DIR}" 2>/dev/null
fi

echo
if [ "${FAILED}" -eq 0 ]; then echo "== MAS preflight: all clear =="; else echo "== MAS preflight: FAILED (see FAIL lines) =="; fi
exit "${FAILED}"
