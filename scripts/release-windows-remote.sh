#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# release-windows-remote.sh — cut a Windows release in one command from the Mac.
#
# Windows .msi can't be cross-compiled, so this builds on the LAN Windows box
# over SSH, fetches the .msi, and publishes it to Cloudflare R2 from here (the
# Mac's wrangler is already authed for R2). Simple + robust: direct SSH, no
# OpenClaw, no Telegram, no GitHub.
#
#   bash scripts/release-windows-remote.sh [version]      # version from tauri.conf.json
#   npm run release:windows -- [version]
#
# Env:
#   WIN_BUILD_HOST   REQUIRED: ssh target of your Windows build host (user@host
#                    or an ssh-config alias). Keep it in your gitignored .env.
#   WIN_EDITOR_PATH  editor checkout path on that host
#                    (default: C:/Users/<user>/Documents/PDFluent/pdfluent-v3)
#   WRANGLER         wrangler binary for the publish step (else publish-artifact.mjs default)
#
# One-time host prep: scripts/setup-windows-buildhost.ps1 (clone editor+XFA from
# GitLab, toolchain, WASM). See RELEASE.md.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load host config from the gitignored .env if present, so the connection
# target lives in your local config — never hardcoded in this (public) repo.
# Reads only the two keys we need; does NOT execute .env.
if [ -f "${REPO_ROOT}/.env" ]; then
  : "${WIN_BUILD_HOST:=$(grep -E '^WIN_BUILD_HOST=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
  : "${WIN_EDITOR_PATH:=$(grep -E '^WIN_EDITOR_PATH=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
fi
HOST="${WIN_BUILD_HOST:?set WIN_BUILD_HOST (user@host or ssh alias) as an env var or in your gitignored .env}"
EDITOR_WIN="${WIN_EDITOR_PATH:-C:/Users/Gebruiker/Documents/PDFluent/pdfluent-v3}"
VERSION="${1:-$(node -p "require('${REPO_ROOT}/src-tauri/tauri.conf.json').version")}"
SSHO=(-o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=2000)

echo "== Windows remote release v${VERSION} on ${HOST} =="

# 1. Refresh the editor checkout on the box. The box remotes are token-free
# (clean URLs); auth comes from the box git credential store (credential.helper
# = store, ~/.git-credentials). Do NOT pass `-c credential.helper=` — that would
# disable the store and the clean-URL pull would fail.
ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Set-Location '${EDITOR_WIN}'; git pull --ff-only\"" \
  || echo "(pull skipped — building the current checkout)"

# 2. Build the .msi on the box (build-only; prints MSI_PATH=...). Slow: MSVC + WiX.
echo "== building on ${HOST} (MSVC + WiX — this takes a while) =="
ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File '${EDITOR_WIN}/scripts/release-windows.ps1' '${VERSION}'" | tee /tmp/pdfluent-winremote.log

MSI_WIN="$(grep -oE 'MSI_PATH=[^[:space:]]+\.msi' /tmp/pdfluent-winremote.log | head -1 | cut -d= -f2- | tr -d '\r')"
[ -n "${MSI_WIN}" ] || { echo "✘ No .msi produced on the box (see log above)."; exit 1; }
echo "   msi on box: ${MSI_WIN}"

# 3. Fetch the .msi to the Mac. scp cannot parse the Windows backslash path, so
#    convert to forward slashes, clear any stale copy first, and FAIL LOUDLY if
#    the fetch produced nothing - otherwise a leftover /tmp file gets published.
MSI_FWD="${MSI_WIN//\\//}"
LOCAL_MSI="/tmp/$(basename "${MSI_FWD}")"
rm -f "${LOCAL_MSI}"
scp "${SSHO[@]}" "${HOST}:${MSI_FWD}" "${LOCAL_MSI}"
[ -s "${LOCAL_MSI}" ] || { echo "✘ scp did not fetch the .msi from the box (${MSI_FWD})."; exit 1; }
echo "   fetched: ${LOCAL_MSI} ($(du -h "${LOCAL_MSI}" | cut -f1))"

# 3b. If the box produced updater artifacts (production key present there), fetch
#     them into artifacts/windows/ so latest.json can be generated locally.
#     Tauri v2 signs the installer directly → the updater artifact is the bare MSI
#     + its <installer>.msi.sig (no .msi.zip). The MSI itself is already fetched
#     above (LOCAL_MSI); here we fetch the matching .msi.sig.
#     Guarded: absent for direct-download builds (no TAURI_SIGNING_PRIVATE_KEY).
#     Staging latest.json + the R2 upload remain SEPARATE, approval-gated steps.
UP_SIG_WIN="$(grep -oE 'UPDATER_SIG=[^[:space:]]+' /tmp/pdfluent-winremote.log | head -1 | cut -d= -f2- | tr -d '\r')"
if [ -n "${UP_SIG_WIN}" ]; then
  mkdir -p "${REPO_ROOT}/artifacts/windows"
  scp "${SSHO[@]}" "${HOST}:${UP_SIG_WIN//\\//}" "${REPO_ROOT}/artifacts/windows/" || echo "(updater .msi.sig fetch failed)"
  echo "   updater .msi.sig → artifacts/windows/ (stage latest.json + upload separately; approval-gated)"
fi

# 4. Publish to R2 + update the release manifest (Mac wrangler has R2 access).
#    Resolve a usable wrangler first: env override, then PATH, then the
#    npx-cached binary. Without this the publish dies with "spawnSync wrangler
#    ENOENT" AFTER build+scp already succeeded — a silent, expensive failure.
if [ -z "${WRANGLER:-}" ]; then
  if command -v wrangler >/dev/null 2>&1; then
    WRANGLER="wrangler"
  else
    WRANGLER="$(ls -t "${HOME}"/.npm/_npx/*/node_modules/.bin/wrangler 2>/dev/null | head -1 || true)"
  fi
fi
[ -n "${WRANGLER:-}" ] || { echo "✘ No wrangler binary found. Set WRANGLER=/path/to/wrangler and re-run; the .msi is already on the box + in /tmp."; exit 1; }
echo "   using wrangler: ${WRANGLER}"
WRANGLER="${WRANGLER}" node "${REPO_ROOT}/scripts/publish-artifact.mjs" --version "${VERSION}" --file "${LOCAL_MSI}" \
  || { echo "✘ publish-artifact.mjs failed — Windows MSI was NOT published (see error above)."; exit 1; }
echo "✓ Windows release v${VERSION} published — pdfluent.com/download shows it automatically."
