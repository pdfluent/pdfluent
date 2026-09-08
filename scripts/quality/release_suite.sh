#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# release_suite.sh — run the release quality suite against a built artefact.
#
# Before any byte of a desktop release reaches R2, this mounts or installs the
# exact artefact, proves its identity and signature chain, starts it, opens a
# golden document, quits it cleanly, watches it do that with the network denied,
# and writes a report whose sha256 the publish path refuses to proceed without.
#
#   scripts/quality/release_suite.sh --artefact <dmg|msi> --platform macos|windows|fake \
#       [--commit <sha>] [--machine <class>] [--report-dir quality/reports] \
#       [--work <dir>] [--keep] [--expect-updater] [--no-watchdog]
#
# Exit codes:
#   0  every step PASS                          → publishing may proceed
#   1  at least one step FAIL                   → refused
#   2  could not run (preflight)                → refused
#   3  ran, but at least one step SKIPPED       → refused; it measured less than
#                                                 it claims, and a green that did
#                                                 not judge is not a pass
#
# No `set -e` here on purpose: every step runs even after a failure, so one
# report names everything that is wrong instead of only the first thing.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SUITE_DIR="${SCRIPT_DIR}/suite"
cd "${REPO_ROOT}"

ARTEFACT=""; PLATFORM=""; COMMIT=""; MACHINE="${PDFLUENT_MACHINE_CLASS:-}"
REPORT_DIR="quality/reports"; WORK=""; KEEP=0; EXPECT_UPDATER=0; WATCHDOG=1
while [ $# -gt 0 ]; do
  case "$1" in
    --artefact) ARTEFACT="${2:-}"; shift 2 ;;
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --commit) COMMIT="${2:-}"; shift 2 ;;
    --machine) MACHINE="${2:-}"; shift 2 ;;
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    --work) WORK="${2:-}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --no-launch) export PDFLUENT_SUITE_NO_LAUNCH=1; shift ;;
    --expect-updater) EXPECT_UPDATER=1; shift ;;
    --no-watchdog) WATCHDOG=0; shift ;;
    -h|--help) sed -n '9,30p' "$0"; exit 0 ;;
    *) echo "release_suite: unknown argument $1" >&2; exit 2 ;;
  esac
done

case "${PLATFORM}" in
  macos|windows|fake) ;;
  *) echo "✘ --platform must be macos, windows or fake (got '${PLATFORM}')" >&2; exit 2 ;;
esac
[ -n "${ARTEFACT}" ] || { echo "✘ --artefact is required" >&2; exit 2; }

WORK="${WORK:-$(mktemp -d "${TMPDIR:-/tmp}/pdfluent-release-suite.XXXXXX")}"
mkdir -p "${WORK}/probes" "${WORK}/numbers" "${WORK}/ms"
: > "${WORK}/steps.ndjson"
cleanup() { [ "${KEEP}" -eq 1 ] || rm -rf "${WORK}"; }
trap cleanup EXIT

export WORK REPO_ROOT ARTEFACT PLATFORM COMMIT MACHINE EXPECT_UPDATER WATCHDOG SUITE_DIR

# shellcheck source=suite/drivers/fake.sh
. "${SUITE_DIR}/drivers/${PLATFORM}.sh" 2>/dev/null || {
  echo "✘ no driver for platform ${PLATFORM} (${SUITE_DIR}/drivers/${PLATFORM}.sh)" >&2; exit 2; }

judge() { node "${SUITE_DIR}/judge.mjs" --work "${WORK}" --checks "$1"; }

# A step with nothing to run says so in the report, not only on stderr. A skip
# that leaves no row is indistinguishable from a step that passed, which is the
# failure mode this whole file is arranged against.
skip_row() { # skip_row <step> <id> <capability> <reason>
  node -e '
    const fs = require("node:fs");
    const [work, step, id, capability, reason] = process.argv.slice(1);
    fs.appendFileSync(work + "/steps.ndjson", JSON.stringify({
      step, id, capability, status: "SKIPPED", ms: 0, numbers: {}, reason, evidence: [],
    }) + "\n");
  ' "${WORK}" "$1" "$2" "$3" "$4"
  echo "SKIPPED (not a pass): $2 — $4" >&2
}
export -f judge skip_row 2>/dev/null || true

render() {
  node "${SUITE_DIR}/report.mjs" --work "${WORK}" --out "${REPORT_DIR}"
}

# S0 decides whether the run can happen at all; it writes meta.json, which every
# later step and the renderer read.
. "${SUITE_DIR}/steps/s0_preflight.sh"
if ! step_s0; then
  node -e '
    const fs=require("fs"), p=process.argv[1];
    const m=JSON.parse(fs.readFileSync(p,"utf8")); m.could_not_run=true;
    fs.writeFileSync(p, JSON.stringify(m,null,2));
  ' "${WORK}/meta.json" 2>/dev/null || true
  render >/dev/null 2>&1 || true
  echo "✘ COULD_NOT_RUN — see ${REPORT_DIR}" >&2
  exit 2
fi

# What this platform cannot measure, said out loud. A gap that is known and
# named is a row in the report; a gap that is merely absent is a green run that
# measured less than it claims.
emit_gaps() {
  command -v driver_gaps >/dev/null 2>&1 || return 0
  local line
  while IFS='|' read -r step id capability reason; do
    [ -n "${id}" ] || continue
    skip_row "${step}" "${id}" "${capability}" "${reason}"
  done <<< "$(driver_gaps)"
}

for s in s1_identity s2_launch s3_offline s4_updater; do
  # Each step in its own subshell: a step that dies takes its own rows with it,
  # not the run.
  ( . "${SUITE_DIR}/steps/${s}.sh"; "step_${s%%_*}" ) || true
done
emit_gaps

render
exit $?
