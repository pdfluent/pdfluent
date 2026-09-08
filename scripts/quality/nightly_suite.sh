#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# nightly_suite.sh — judge last night's artefacts and leave the answer where a
# person will see it in the morning.
#
# It runs the same release suite a release evening runs, against the newest
# artefact of each platform, and writes quality/reports/NIGHTLY.md. The morning
# summary reads that file. Nothing here decides what a probe means: the suite
# does that, and this only chooses what to point it at and says what came back.
#
# On this machine, not on a hosted runner: the private repositories pay per
# minute for GitHub-hosted CI and a nightly that installs and drives a desktop
# application needs a desktop anyway.
#
#   scripts/quality/nightly_suite.sh [--artefacts <dir>] [--reports <dir>]
#
# Exit 0 only when every platform passed. A nightly whose exit code says nothing
# would be a nightly nobody reads twice.
#
# It writes the reports and does not commit them. An unattended `git commit` in
# a checkout several sessions share is how somebody else's file lands in your
# commit under your name, which has happened here; and a report that says
# INCOMPLETE every night would be a nightly diff nobody reads. The morning
# summary names the files, and a person commits the one that is news.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

ARTEFACTS="${PDFLUENT_NIGHTLY_ARTEFACTS:-dist-release}"
REPORTS="quality/reports"
MACHINE="${PDFLUENT_MACHINE_CLASS:-dev-macbook-m1pro}"
REFRESH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --artefacts) ARTEFACTS="${2:-}"; shift 2 ;;
    --reports) REPORTS="${2:-}"; shift 2 ;;
    --machine) MACHINE="${2:-}"; shift 2 ;;
    --refresh) REFRESH=1; shift ;;
    -h|--help) sed -n '9,26p' "$0"; exit 0 ;;
    *) echo "nightly_suite: unknown argument $1" >&2; exit 2 ;;
  esac
done

# Bring the nightly's own checkout up to the trunk. Guarded twice: the agent
# sets the variable and the flag has to be passed, so a run started by hand in
# somebody's working tree cannot reset it.
if [ "${REFRESH}" = "1" ] && [ "${PDFLUENT_NIGHTLY_OWNED_CHECKOUT:-0}" = "1" ]; then
  git fetch origin release/ga-readiness >/dev/null 2>&1 \
    && git reset --hard origin/release/ga-readiness >/dev/null 2>&1 \
    || echo "could not refresh the checkout; judging what is here" >&2
fi

VERSION="$(node -p 'require("./package.json").version')"
mkdir -p "${REPORTS}"
LOG="${REPORTS}/NIGHTLY.log"
: > "${LOG}"

# The newest artefact of a shape, or nothing. An absent artefact is not an
# error here: the summary reports the platform as MISSING, which is the honest
# reading of "nothing was built to judge".
newest() { ls -t "${ARTEFACTS}"/$1 2>/dev/null | head -1; }

run_platform() { # run_platform <platform> <artefact>
  local platform="$1" artefact="$2"
  [ -n "${artefact}" ] || { echo "no artefact for ${platform} in ${ARTEFACTS}" >> "${LOG}"; return 0; }
  echo "=== ${platform}: ${artefact}" >> "${LOG}"
  scripts/quality/release_suite.sh --platform "${platform}" --artefact "${artefact}" \
    --machine "${MACHINE}" --report-dir "${REPORTS}" >> "${LOG}" 2>&1
  echo "--- ${platform} exit $?" >> "${LOG}"
}

run_platform macos   "$(newest "PDFluent_${VERSION}_universal.dmg")"
run_platform windows "$(newest "PDFluent_${VERSION}_x64_en-US.msi")"

# The summary is written whatever happened, including when neither platform ran:
# a morning with no file is indistinguishable from a morning nobody looked at.
node scripts/quality/nightly_summary.mjs "${REPORTS}" --platforms macos,windows > "${REPORTS}/NIGHTLY.md"
rc=$?
cat "${REPORTS}/NIGHTLY.md"
exit ${rc}
