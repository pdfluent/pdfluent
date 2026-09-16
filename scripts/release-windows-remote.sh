#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# release-windows-remote.sh — build one named commit into a Windows .msi.
#
# Windows .msi can't be cross-compiled, so this builds on the Windows build host
# over SSH and fetches the .msi to the Mac. It stops there: judging and
# publishing the artefact are separate, guarded steps (release_suite.sh, then
# publish-release.sh).
#
#   bash scripts/release-windows-remote.sh --sha <40-hex> [--version <v>]
#   bash scripts/release-windows-remote.sh <40-hex> [version]
#   npm run release:windows -- --sha <40-hex>
#
# THE COMMIT IS AN ARGUMENT, NOT A GUESS
# This script used to run `git pull --ff-only` on the box and build whatever the
# trunk there happened to be. During the 2026-09-10 release rehearsal that built
# beta.21 while 1.0.0 was the version under test, and the log only said so in
# passing — the macOS half took its source from where it ran, the Windows half
# from the box's own checkout, and one release had two answers to "which code is
# this". So the commit is named, the box fetches from `origin` and checks that
# exact commit out detached, and a commit `origin` does not have is a refusal
# before anything is built. This script pushes nothing: a sha the box cannot see
# is a sha that was never pushed, and quietly pushing it here would make this
# script a publisher.
#
# Env:
#   WIN_BUILD_HOST   REQUIRED: ssh target of your Windows build host (user@host
#                    or an ssh-config alias). Keep it in your gitignored .env.
#   WIN_EDITOR_PATH  REQUIRED: editor checkout path on that host. Keep it in
#                    your gitignored .env; it is a fact about one machine.
#   PDFLUENT_ENV     Optional: the .env to read those from. See below.
#   WINREMOTE_LOG    Optional: where the box's build output is tee'd.
#
# One-time host prep: scripts/setup-windows-buildhost.ps1 (clone editor+XFA from
# the mirror, toolchain, WASM). See RELEASE.md.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSHO=(-o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=2000)
BUILD_LOG="${WINREMOTE_LOG:-/tmp/pdfluent-winremote.log}"

usage() {
  echo "usage: bash scripts/release-windows-remote.sh --sha <40-hex commit> [--version <v>]"
  echo "       the commit must already be on origin; this script pushes nothing."
}

# ── 0. Which commit ──────────────────────────────────────────────────────────
SHA=""
VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sha)     SHA="${2:-}"; shift 2 || shift ;;
    --version) VERSION="${2:-}"; shift 2 || shift ;;
    -h|--help) usage; exit 0 ;;
    -*)        echo "✘ unknown option: $1"; usage; exit 2 ;;
    *)         if [ -z "${SHA}" ]; then SHA="$1"; else VERSION="$1"; fi; shift ;;
  esac
done
if [ -z "${SHA}" ]; then
  echo "✘ no commit given. The build host builds the commit you name, not whatever its checkout happens to be."
  usage
  exit 2
fi
if ! printf '%s' "${SHA}" | grep -qE '^[0-9a-fA-F]{40}$'; then
  echo "✘ not a full commit sha: ${SHA}"
  echo "  Give all 40 hex characters — an abbreviation is ambiguous on a machine with a different set of objects."
  usage
  exit 2
fi
SHA="$(printf '%s' "${SHA}" | tr '[:upper:]' '[:lower:]')"

# ── 1. Where the host configuration lives ────────────────────────────────────
# `.env` is deliberately not in git, so it exists in the main checkout and in no
# worktree. Resolving it as "next to this script" stopped a release cut from a
# worktree on its first line (rehearsal 2026-09-10). Candidates, in order: an
# explicit PDFLUENT_ENV, the main checkout that owns this worktree's .git
# (`git rev-parse --git-common-dir` points at the main repository's .git from
# inside any worktree), and this directory.
env_candidates() {
  if [ -n "${PDFLUENT_ENV:-}" ]; then printf '%s\n' "${PDFLUENT_ENV}"; fi
  local common
  common="$(git -C "${REPO_ROOT}" rev-parse --git-common-dir 2>/dev/null)"
  if [ -n "${common}" ]; then
    case "${common}" in /*) ;; *) common="${REPO_ROOT}/${common}" ;; esac
    if [ -d "${common}" ]; then
      printf '%s\n' "$(cd "${common}/.." && pwd)/.env"
    fi
  fi
  printf '%s\n' "${REPO_ROOT}/.env"
}

# Reads one key. Does NOT execute the file: a .env is configuration, and this
# script has no business running whatever is in it.
env_value() {
  grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | tr -d "\"'"
}

ENV_FILE=""
TRIED=""
while IFS= read -r cand; do
  [ -n "${cand}" ] || continue
  if printf '%s\n' "${TRIED}" | grep -Fxq -- "${cand}"; then continue; fi
  TRIED="${TRIED}${cand}
"
  if [ -f "${cand}" ]; then ENV_FILE="${cand}"; break; fi
done <<EOF
$(env_candidates)
EOF

if [ -n "${ENV_FILE}" ]; then
  : "${WIN_BUILD_HOST:=$(env_value WIN_BUILD_HOST "${ENV_FILE}")}"
  : "${WIN_EDITOR_PATH:=$(env_value WIN_EDITOR_PATH "${ENV_FILE}")}"
fi

if [ -z "${WIN_BUILD_HOST:-}" ] || [ -z "${WIN_EDITOR_PATH:-}" ]; then
  echo "✘ no build-host configuration: WIN_BUILD_HOST and WIN_EDITOR_PATH are not set, and no .env supplied them."
  echo "  tried, in order:"
  printf '%s' "${TRIED}" | sed 's/^/    /'
  echo "  Export both variables, or point PDFLUENT_ENV at the .env that holds them."
  exit 1
fi
HOST="${WIN_BUILD_HOST}"
EDITOR_WIN="${WIN_EDITOR_PATH}"

echo "== Windows remote release: commit ${SHA} =="
[ -n "${ENV_FILE}" ] && echo "   host configuration: ${ENV_FILE}"

# ── 2. Put the box on exactly that commit ────────────────────────────────────
# The box remotes are token-free (clean URLs); auth comes from the box git
# credential store (credential.helper = store, ~/.git-credentials). Do NOT pass
# `-c credential.helper=` — that would disable the store and the clean-URL fetch
# would fail.
CHECKOUT_LOG="$(mktemp "${TMPDIR:-/tmp}/pdfluent-winremote-checkout.XXXXXX")"
PS_CHECKOUT="Set-Location '${EDITOR_WIN}';"
PS_CHECKOUT="${PS_CHECKOUT} \$env:GIT_TERMINAL_PROMPT='0';"
PS_CHECKOUT="${PS_CHECKOUT} git fetch --prune --tags origin;"
PS_CHECKOUT="${PS_CHECKOUT} if (\$LASTEXITCODE -ne 0) { Write-Output 'FETCH_FAILED'; exit 11 };"
PS_CHECKOUT="${PS_CHECKOUT} git cat-file -e '${SHA}^{commit}';"
PS_CHECKOUT="${PS_CHECKOUT} if (\$LASTEXITCODE -ne 0) { Write-Output 'SHA_UNKNOWN'; exit 12 };"
PS_CHECKOUT="${PS_CHECKOUT} \$onOrigin = @(git branch -r --list 'origin/*' --contains ${SHA}) + @(git tag --contains ${SHA});"
PS_CHECKOUT="${PS_CHECKOUT} if (\$onOrigin.Count -eq 0) { Write-Output 'SHA_NOT_ON_ORIGIN'; exit 13 };"
PS_CHECKOUT="${PS_CHECKOUT} git checkout --detach ${SHA};"
PS_CHECKOUT="${PS_CHECKOUT} if (\$LASTEXITCODE -ne 0) { Write-Output 'CHECKOUT_FAILED'; exit 14 };"
PS_CHECKOUT="${PS_CHECKOUT} Write-Output ('BUILD_SHA=' + (git rev-parse HEAD));"
PS_CHECKOUT="${PS_CHECKOUT} Write-Output ('BUILD_VERSION=' + (Get-Content 'package.json' -Raw | ConvertFrom-Json).version)"

ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"${PS_CHECKOUT}\"" 2>&1 | tee "${CHECKOUT_LOG}"
CHECKOUT_RC="${PIPESTATUS[0]}"

# The box prints this twice per fetch while the fetch itself succeeds, so it is
# noise that looks like a failure. Cause: a Git Credential Manager helper is
# configured alongside the plain `store` helper, and the message comes from the
# credential *approve* step after a successful fetch, not from the fetch — GCM's
# default store on Windows is the DPAPI-backed Windows Credential Manager, which
# an ssh session cannot write to because it is a non-interactive logon with no
# credential vault attached. The credential that actually worked came from
# ~/.git-credentials. The fix is a git config on the box, which is the owner's to
# make, so this reports what is configured rather than changing it.
if grep -qi 'wincredman' "${CHECKOUT_LOG}"; then
  echo "   note: 'unable to persist credentials with the wincredman credential store' is the credential-approve"
  echo "         step of a fetch that succeeded (a Credential Manager helper cannot reach the Windows credential"
  echo "         vault over ssh). Harmless. What the box has configured:"
  ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"git config --show-origin --get-all credential.helper; git config --show-origin --get-all credential.credentialStore\"" 2>&1 | sed 's/^/         /'
fi

if [ "${CHECKOUT_RC}" -ne 0 ]; then
  if grep -q 'SHA_NOT_ON_ORIGIN\|SHA_UNKNOWN' "${CHECKOUT_LOG}"; then
    echo "✘ ${SHA} is not reachable from origin on the build host, so there is nothing to build."
    echo "  Push the commit to origin first. This script pushes nothing on your behalf."
  elif grep -q 'CHECKOUT_FAILED' "${CHECKOUT_LOG}"; then
    echo "✘ the build host could not check out ${SHA} (uncommitted changes in its checkout?)."
  elif grep -q 'FETCH_FAILED' "${CHECKOUT_LOG}"; then
    echo "✘ the build host could not fetch from origin (see the output above)."
  else
    echo "✘ preparing the build host failed (exit ${CHECKOUT_RC}; see the output above)."
  fi
  rm -f "${CHECKOUT_LOG}"
  exit 1
fi

BUILD_SHA="$(grep -oE 'BUILD_SHA=[0-9a-fA-F]{40}' "${CHECKOUT_LOG}" | head -1 | cut -d= -f2- | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
BUILD_VERSION="$(grep -oE 'BUILD_VERSION=[^[:space:]]+' "${CHECKOUT_LOG}" | head -1 | cut -d= -f2- | tr -d '\r')"
rm -f "${CHECKOUT_LOG}"
if [ "${BUILD_SHA}" != "${SHA}" ]; then
  echo "✘ the build host reports HEAD ${BUILD_SHA:-<nothing>}, not ${SHA}. Refusing to build a commit nobody asked for."
  exit 1
fi
[ -n "${VERSION}" ] || VERSION="${BUILD_VERSION}"
if [ -z "${VERSION}" ]; then
  echo "✘ the build host did not report a package.json version for ${SHA}."
  exit 1
fi
echo "   build host HEAD: ${BUILD_SHA} (detached)"
echo "   package.json:    ${BUILD_VERSION}"
echo "   building as:     v${VERSION}"

# ── 3. The engine pin has to be readable before the build, not after it ──────
# The engine is a pinned git dependency. When the box cannot read that
# repository, cargo says so twenty minutes into a build that was always going to
# fail — that is what the 2026-09-10 rehearsal spent its Windows half on. One
# ls-remote costs a second and turns that log into a line.
#
# It proves read access, which is the thing that was missing. It deliberately
# does not try to fetch the revision itself: fetching an arbitrary sha depends
# on the server allowing it, so a refusal there would say more about the server
# than about the pin, and a false refusal here blocks a release.
PS_ENGINE="Set-Location '${EDITOR_WIN}';"
PS_ENGINE="${PS_ENGINE} \$env:GIT_TERMINAL_PROMPT='0';"
PS_ENGINE="${PS_ENGINE} \$dq = [char]34;"
PS_ENGINE="${PS_ENGINE} \$rx = 'git\\s*=\\s*' + \$dq + '([^' + \$dq + ']+)' + \$dq + '[^\\r\\n]*rev\\s*=\\s*' + \$dq + '([0-9a-f]{40})' + \$dq;"
PS_ENGINE="${PS_ENGINE} \$m = [regex]::Match((Get-Content 'src-tauri/Cargo.toml' -Raw), \$rx);"
PS_ENGINE="${PS_ENGINE} if (-not \$m.Success) { Write-Output 'ENGINE_PIN_UNREADABLE'; exit 21 };"
PS_ENGINE="${PS_ENGINE} Write-Output ('ENGINE_URL=' + \$m.Groups[1].Value);"
PS_ENGINE="${PS_ENGINE} Write-Output ('ENGINE_REV=' + \$m.Groups[2].Value);"
PS_ENGINE="${PS_ENGINE} git ls-remote \$m.Groups[1].Value HEAD;"
PS_ENGINE="${PS_ENGINE} if (\$LASTEXITCODE -ne 0) { Write-Output 'ENGINE_UNREADABLE'; exit 22 }"

ENGINE_LOG="$(mktemp "${TMPDIR:-/tmp}/pdfluent-winremote-engine.XXXXXX")"
ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"${PS_ENGINE}\"" > "${ENGINE_LOG}" 2>&1
ENGINE_RC=$?
ENGINE_URL="$(grep -oE 'ENGINE_URL=[^[:space:]]+' "${ENGINE_LOG}" | head -1 | cut -d= -f2- | tr -d '\r')"
ENGINE_REV="$(grep -oE 'ENGINE_REV=[0-9a-f]{40}' "${ENGINE_LOG}" | head -1 | cut -d= -f2- | tr -d '\r')"
if [ "${ENGINE_RC}" -ne 0 ]; then
  if grep -q 'ENGINE_PIN_UNREADABLE' "${ENGINE_LOG}"; then
    echo "✘ could not read the engine pin from src-tauri/Cargo.toml at ${SHA}."
  else
    echo "✘ the build host cannot read the pinned engine repository ${ENGINE_URL:-<unknown>} (rev ${ENGINE_REV:-<unknown>})."
    echo "  Every Rust job needs it, so the build would fail after the whole frontend and most of the crate graph."
    echo "  This is a read credential on the build host, not something this script can arrange."
  fi
  sed 's/^/  | /' "${ENGINE_LOG}"
  rm -f "${ENGINE_LOG}"
  exit 1
fi
rm -f "${ENGINE_LOG}"
echo "   engine pin:      ${ENGINE_REV} (readable from the build host)"

# ── 4. Disk preflight ────────────────────────────────────────────────────────
# The target directory alone is bigger than the free space this box has had, and
# a build that dies half way through linking wastes an hour and leaves a worse
# mess than a refusal does.
FREE_GB="$(ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -Command \"[math]::Floor((Get-PSDrive C).Free/1GB)\"" | tr -d '\r')"
if [ -n "${FREE_GB}" ] && [ "${FREE_GB}" -lt 12 ] 2>/dev/null; then
  echo "✘ Only ${FREE_GB} GB free on the build host's system drive; this build needs about 12."
  echo "  Reclaim first: the Rust target directory in the editor checkout, old bundles under"
  echo "  src-tauri/target/release/bundle, and the runner work directories."
  exit 1
fi
echo "   free on the build host: ${FREE_GB:-unknown} GB"

# ── 5. Build the .msi on the box (build-only; prints MSI_PATH=…) ─────────────
echo "== building ${BUILD_SHA} as v${VERSION} on the build host (MSVC + WiX — this takes a while) =="
ssh "${SSHO[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File '${EDITOR_WIN}/scripts/release-windows.ps1' '${VERSION}'" | tee "${BUILD_LOG}"

MSI_WIN="$(grep -oE 'MSI_PATH=[^[:space:]]+\.msi' "${BUILD_LOG}" | head -1 | cut -d= -f2- | tr -d '\r')"
[ -n "${MSI_WIN}" ] || { echo "✘ No .msi produced on the box (see log above)."; exit 1; }
echo "   msi on box: ${MSI_WIN}"

# ── 6. Fetch the .msi to the Mac ─────────────────────────────────────────────
# scp cannot parse the Windows backslash path, so convert to forward slashes,
# clear any stale copy first, and FAIL LOUDLY if the fetch produced nothing —
# otherwise a leftover /tmp file gets published.
MSI_FWD="${MSI_WIN//\\//}"
LOCAL_MSI="/tmp/$(basename "${MSI_FWD}")"
rm -f "${LOCAL_MSI}"
scp "${SSHO[@]}" "${HOST}:${MSI_FWD}" "${LOCAL_MSI}"
[ -s "${LOCAL_MSI}" ] || { echo "✘ scp did not fetch the .msi from the box (${MSI_FWD})."; exit 1; }
echo "   fetched: ${LOCAL_MSI} ($(du -h "${LOCAL_MSI}" | cut -f1))"

# 6b. If the box produced updater artifacts (production key present there), fetch
#     them into artifacts/windows/ so latest.json can be generated locally.
#     Tauri v2 signs the installer directly → the updater artifact is the bare MSI
#     + its <installer>.msi.sig (no .msi.zip). The MSI itself is already fetched
#     above (LOCAL_MSI); here we fetch the matching .msi.sig.
#     Guarded: absent for direct-download builds (no TAURI_SIGNING_PRIVATE_KEY).
#     Staging latest.json + the R2 upload remain SEPARATE, approval-gated steps.
UP_SIG_WIN="$(grep -oE 'UPDATER_SIG=[^[:space:]]+' "${BUILD_LOG}" | head -1 | cut -d= -f2- | tr -d '\r')"
if [ -n "${UP_SIG_WIN}" ]; then
  mkdir -p "${REPO_ROOT}/artifacts/windows"
  scp "${SSHO[@]}" "${HOST}:${UP_SIG_WIN//\\//}" "${REPO_ROOT}/artifacts/windows/" || echo "(updater .msi.sig fetch failed)"
  echo "   updater .msi.sig → artifacts/windows/ (stage latest.json + upload separately; approval-gated)"
fi

# ── 7. Stop. Publishing is a separate, guarded step ──────────────────────────
#
# This script used to upload to R2 the moment the build came back, which meant
# the bytes were live before anything had looked at them. The release quality
# suite runs against the artefact first, and scripts/publish-release.sh refuses
# to upload without its PASS report.
echo
echo "✓ Windows v${VERSION} built from ${BUILD_SHA} and fetched. NOT published."
echo "NEXT:"
echo "  scripts/quality/release_suite.sh --platform windows --artefact ${LOCAL_MSI} --commit ${BUILD_SHA} --machine build-desktop-windows"
echo "  scripts/publish-release.sh ${VERSION} windows ${LOCAL_MSI}"
