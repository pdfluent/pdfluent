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
# Windows .msi can't be cross-compiled, so this builds on the Windows build host
# over SSH and fetches the .msi to the Mac. It stops there: judging and
# publishing the artefact are separate, guarded steps (release_suite.sh, then
# publish-release.sh).
#
#   bash scripts/release-windows-remote.sh [version]      # version from tauri.conf.json
#   npm run release:windows -- [version]
#
# Env:
#   WIN_BUILD_HOST   REQUIRED: ssh target of your Windows build host (user@host
#                    or an ssh-config alias). Keep it in your gitignored .env.
#   WIN_EDITOR_PATH  REQUIRED: editor checkout path on that host. Keep it in
#                    your gitignored .env; it is a fact about one machine.
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
# The box's checkout directory is a local fact, so it lives in the gitignored
# .env as WIN_EDITOR_PATH. The default below is the layout the build host has
# actually used; a box that differs sets the variable rather than editing this.
EDITOR_WIN="${WIN_EDITOR_PATH:?set WIN_EDITOR_PATH (the editor checkout on the build host) as an env var or in your gitignored .env}"
VERSION="${1:-$(node -p "require('${REPO_ROOT}/src-tauri/tauri.conf.json').version")}"
SSHO=(-o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=2000)

echo "== Windows remote release v${VERSION} on ${HOST} =="

# 1. Refresh the editor checkout on the box. The box remotes are token-free
# (clean URLs); auth comes from the box git credential store (credential.helper
# = store, ~/.git-credentials). Do NOT pass `-c credential.helper=` — that would
# disable the store and the clean-URL pull would fail.
ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Set-Location '${EDITOR_WIN}'; git pull --ff-only\"" \
  || echo "(pull skipped — building the current checkout)"

# 1b. Disk preflight. The target directory alone is bigger than the free space
#     this box has had, and a build that dies half way through linking wastes an
#     hour and leaves a worse mess than a refusal does.
FREE_GB="$(ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -Command \"[math]::Floor((Get-PSDrive C).Free/1GB)\"" | tr -d '\r')"
if [ -n "${FREE_GB}" ] && [ "${FREE_GB}" -lt 12 ] 2>/dev/null; then
  echo "✘ Only ${FREE_GB} GB free on the build host's system drive; this build needs about 12."
  echo "  Reclaim first: the Rust target directory in the editor checkout, old bundles under"
  echo "  src-tauri/target/release/bundle, and the runner work directories."
  exit 1
fi
echo "   free on the build host: ${FREE_GB:-unknown} GB"

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

# 4. Stop. Publishing is a separate, guarded step.
#
# This script used to upload to R2 the moment the build came back, which meant
# the bytes were live before anything had looked at them. The release quality
# suite runs against the artefact first, and scripts/publish-release.sh refuses
# to upload without its PASS report.
echo
echo "✓ Windows v${VERSION} built and fetched. NOT published."
echo "NEXT:"
echo "  scripts/quality/release_suite.sh --platform windows --artefact ${LOCAL_MSI} --commit \$(git rev-parse HEAD) --machine build-desktop-windows"
echo "  scripts/publish-release.sh ${VERSION} windows ${LOCAL_MSI}"
