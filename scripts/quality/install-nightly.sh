#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Install the nightly release-suite launch agent for the current user.
#
# The nightly gets its own checkout, under ~/Library/Application Support, and
# never runs out of a worktree somebody is working in. Two reasons, both of
# which have already cost time here:
#
#   * ~/Documents is gated by the privacy system. A launch agent whose script
#     lives there is refused at 03:15 and the prompt that would fix it appears
#     to nobody. An agent on this machine stopped running for weeks that way.
#   * A per-ticket worktree is deleted when the ticket closes, and an agent
#     pointing into it fails silently from then on.
#
#   scripts/quality/install-nightly.sh [--artefacts <dir>] [--dry-run] [--uninstall]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL=com.pdfluent.quality-nightly
SUPPORT="${HOME}/Library/Application Support/PDFluent"
CHECKOUT="${SUPPORT}/checkout"
ARTEFACTS="${SUPPORT}/artefacts"
AGENTS="${HOME}/Library/LaunchAgents"
TARGET="${AGENTS}/${LABEL}.plist"
TRUNK=release/ga-readiness
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --artefacts) ARTEFACTS="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --uninstall)
      launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
      rm -f "${TARGET}"; echo "removed ${LABEL}"; exit 0 ;;
    -h|--help) sed -n '9,22p' "$0"; exit 0 ;;
    *) echo "install-nightly: unknown argument $1" >&2; exit 2 ;;
  esac
done

case "${CHECKOUT}" in
  "${HOME}/Documents"/*|"${HOME}/Desktop"/*|"${HOME}/Downloads"/*)
    echo "✘ ${CHECKOUT} is inside a folder the privacy system gates; a launch agent cannot read it unattended" >&2
    exit 2 ;;
esac

mkdir -p "${SUPPORT}/logs" "${ARTEFACTS}" "${AGENTS}"
if [ "${DRY}" -eq 0 ] && [ ! -d "${CHECKOUT}/.git" ]; then
  # A local clone: the same objects, its own working tree, and no chance of a
  # nightly resetting a branch somebody has work on.
  git clone --local --no-hardlinks --branch "${TRUNK}" "${REPO_ROOT}" "${CHECKOUT}"
  git -C "${CHECKOUT}" remote set-url origin "$(git -C "${REPO_ROOT}" remote get-url origin)"
  git -C "${REPO_ROOT}" remote get-url gitlab >/dev/null 2>&1 \
    && git -C "${CHECKOUT}" remote add gitlab "$(git -C "${REPO_ROOT}" remote get-url gitlab)" 2>/dev/null || true
fi

sed -e "s#__CHECKOUT__#${CHECKOUT}#g" -e "s#__LOGDIR__#${SUPPORT}/logs#g" -e "s#__ARTEFACTS__#${ARTEFACTS}#g" \
  "${REPO_ROOT}/packaging/launchd/${LABEL}.plist" > "${TARGET}.new"
plutil -lint "${TARGET}.new" >/dev/null

if [ "${DRY}" -eq 1 ]; then
  cat "${TARGET}.new"; rm -f "${TARGET}.new"; exit 0
fi

mv "${TARGET}.new" "${TARGET}"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${TARGET}"
echo "installed ${LABEL}"
echo "  checkout:  ${CHECKOUT}  (refreshed to ${TRUNK} before every run)"
echo "  artefacts: ${ARTEFACTS}  (put the release build's .dmg/.msi here, or symlink them)"
echo "  summary:   ${CHECKOUT}/quality/reports/NIGHTLY.md"
