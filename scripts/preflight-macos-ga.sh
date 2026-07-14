#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# preflight-macos-ga.sh — READ-ONLY GA readiness check for macOS Developer ID
# signing + notarization. It does NOT build, sign, or notarize anything; it only
# reports whether the machine is configured for a notarized GA build. Key/secret
# values are never read or printed — only presence is checked.
#
#   scripts/preflight-macos-ga.sh
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ready=0
note() { printf '  %-4s %s\n' "$1" "$2"; }

echo "== macOS GA preflight (read-only) =="

# 1. Developer ID Application certificate (required for notarized direct download)
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  note "OK" "Developer ID Application certificate present"
else
  note "FAIL" "no 'Developer ID Application' certificate (Apple Development is not enough for GA)"; ready=1
fi

# 2. Notarization credentials (ASC API key OR Apple ID app-specific password)
if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  note "OK" "App Store Connect API key env present (APPLE_API_KEY/ISSUER/KEY_PATH)"
elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  note "OK" "Apple ID notarization env present (APPLE_ID/PASSWORD/TEAM_ID)"
else
  note "FAIL" "no notarization credentials in env (set ASC API key or Apple ID app-specific password)"; ready=1
fi

# 3. Signing identity Tauri will use
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  note "OK" "APPLE_SIGNING_IDENTITY set"
else
  note "WARN" "APPLE_SIGNING_IDENTITY not set (tauri.conf signingIdentity is ad-hoc '-')"
fi

# 4. Hardened-runtime entitlements (notarization-ready)
ENT="${REPO_ROOT}/src-tauri/Entitlements.plist"
if [ -f "$ENT" ] && grep -q "com.apple.security.cs.allow-jit" "$ENT"; then
  note "OK" "Entitlements.plist present with hardened-runtime JIT exception"
else
  note "FAIL" "Entitlements.plist missing or lacks hardened-runtime exceptions"; ready=1
fi

# 5. Updater key presence (presence only — value never read)
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  note "OK" "TAURI_SIGNING_PRIVATE_KEY present (updater artifacts will be produced)"
else
  note "WARN" "TAURI_SIGNING_PRIVATE_KEY not set (build is direct-download-only, no auto-update artifact)"
fi

echo
if [ "$ready" -eq 0 ]; then echo "macOS GA signing: READY"; else echo "macOS GA signing: NOT READY (see FAIL above)"; fi
exit "$ready"
