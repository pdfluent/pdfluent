#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# build-ui-walk.sh -- the second build of a release run (#471).
#
#   scripts/build-ui-walk.sh [--out <dir>]        default: artifacts/ui-walk
#
# Builds the commit that is checked out, a second time, with the in-page walker
# compiled in (cargo feature `ui-walk`, frontend flag VITE_UI_WALK=1). It builds
# in a detached worktree of the same commit, so the release build's dist/ and
# target/ are untouched and the two cannot be mixed up. It writes
#   <out>/PDFluent-ui-walk-<sha12>.app      the walk build (macOS)
#   <out>/PDFluent-ui-walk-<sha12>.msi      the walk build (Windows, under Git Bash)
#   <out>/BUILT_FROM                         the full commit it was built from
# The file name carries "ui-walk" because scripts/publish-artifact.mjs refuses any
# file named like one: this build is measured and discarded, never published.
#
# A release-mode Tauri build is about fourteen minutes of compile. Run it through
# the landing lane (scripts/cos/with_gate_lock.sh --lane landing), like the other
# release builds; this script does not take the lock itself.
set -euo pipefail

OUT="artifacts/ui-walk"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "usage: $0 [--out <dir>]" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"
case "${OUT}" in /*) ;; *) OUT="${REPO_ROOT}/${OUT}" ;; esac

if ! git diff --quiet HEAD -- . ':!artifacts'; then
  echo "✘ the working tree differs from HEAD; the walk build must be of a commit, like the artefact it stands next to" >&2
  exit 2
fi
SHA="$(git rev-parse HEAD)"
WT="$(mktemp -d "${TMPDIR:-/tmp}/ui-walk-src.XXXXXX")"
git worktree add --detach "${WT}" "${SHA}" >/dev/null
trap 'git -C "${REPO_ROOT}" worktree remove --force "${WT}" >/dev/null 2>&1 || true' EXIT

cd "${WT}"
npm ci --no-audit --no-fund
# Both halves of the build see the flag: Vite embeds the walker, cargo compiles
# the plugin it reports through. Neither is ever set by release.yml, and
# tests/ui-walk-build.test.ts fails if one is.
export VITE_UI_WALK=1
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) KIND=msi ;;
  *) KIND=app ;;
esac
npx tauri build --bundles "${KIND}" --features ui-walk --config src-tauri/tauri.ui-walk.conf.json

# A walk build whose bundle has no walker would "walk" nothing and say so late.
node scripts/ci/ui-walk-fenced.mjs --bundle dist --expect-walk

TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
if [ "${KIND}" = "msi" ]; then
  FOUND="$(ls "$(cygpath -u "${TARGET}")"/release/bundle/msi/*.msi 2>/dev/null | head -1)"
else
  FOUND="$(ls -d "${TARGET}"/release/bundle/macos/*.app src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1)"
fi
[ -n "${FOUND}" ] || { echo "✘ the build produced no .${KIND}" >&2; exit 1; }

mkdir -p "${OUT}"
DEST="${OUT}/PDFluent-ui-walk-${SHA:0:12}.${KIND}"
cp -R "${FOUND}" "${DEST}"
printf '%s\n' "${SHA}" > "${OUT}/BUILT_FROM"
echo "ui-walk build of ${SHA} -> ${DEST}"
