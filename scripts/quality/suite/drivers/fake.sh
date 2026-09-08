# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# The fake driver answers every probe from files in a fixture directory beside
# the artefact. It exists so the judgement half of the suite — the part that
# decides what a tool's output means — runs on every push on a Linux runner
# with no Mac, no signed artefact and no build host, instead of only on a
# release evening when being wrong is expensive.
#
# FAKE_MISSING_PROBE=<name> withholds one probe: the check stays in the list and
# becomes SKIPPED, which is how the suite proves a skip is not a pass.

FIXTURE="$(cd "$(dirname "${ARTEFACT}")" && pwd)/probes"

driver_check_tools() { printf '{"driver":"fake"}'; }
driver_kill_leftovers() { :; }
driver_os_string() { printf 'fake'; }
driver_load1() { printf '0'; }

_fake_have() { [ -e "${FIXTURE}/$1.out" ] || [ -e "${FIXTURE}/$1.rc" ]; }

_fake_stage() {
  local probe="$1"
  [ "${probe}" = "${FAKE_MISSING_PROBE:-}" ] && return 0
  [ -e "${FIXTURE}/${probe}.out" ] && cp "${FIXTURE}/${probe}.out" "${WORK}/probes/${probe}.out"
  [ -e "${FIXTURE}/${probe}.rc" ] && cp "${FIXTURE}/${probe}.rc" "${WORK}/probes/${probe}.rc"
  return 0
}

# probe name → check id, for the checks a fixture can drive.
_fake_pairs='mount:mount bundle_version:version bundle_id:bundle_id codesign_verify:codesign spctl_app:spctl stapler_app:stapler embed_gate:embed entitlements:entitlements authenticode:authenticode msi_install:msi_install'

driver_s1_checks() {
  local out="" pair probe check
  for pair in ${_fake_pairs}; do
    probe="${pair%%:*}"; check="${pair##*:}"
    if _fake_have "${probe}"; then
      _fake_stage "${probe}"
      [ "${probe}" = "codesign_verify" ] && _fake_stage codesign_info
      out="${out}${out:+,}${check}"
    fi
  done
  printf '%s' "${out}"
}

driver_documents() {
  local f base
  for f in "${FIXTURE}"/wait_log_*.out "${FIXTURE}"/wait_log_*.rc; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"; base="${base#wait_log_}"; base="${base%.out}"; base="${base%.rc}"
    printf '%s\n' "${base}"
  done | sort -u
}

driver_open_document() {
  _fake_stage "wait_log_$1"
  [ -e "${WORK}/probes/wait_log_$1.rc" ] || echo 0 > "${WORK}/probes/wait_log_$1.rc"
}

driver_s2_checks() {
  local out=""
  for probe in applog_missing alive session_delta crash_scan watchdog; do
    if _fake_have "${probe}"; then
      _fake_stage "${probe}"
      case "${probe}" in
        applog_missing) out="${out}${out:+,}applog" ;;
        alive) out="${out}${out:+,}alive" ;;
        session_delta) out="${out}${out:+,}clean_quit" ;;
        crash_scan) out="${out}${out:+,}no_crash" ;;
        watchdog) out="${out}${out:+,}watchdog" ;;
      esac
    fi
  done
  printf '%s' "${out}"
}

driver_s3_checks() {
  local out=""
  for pair in net_denied_run:offline:denied net_observe:offline:observe offline_allowlist:offline:allowlist; do
    probe="${pair%%:*}"; check="${pair#*:}"
    if _fake_have "${probe}"; then _fake_stage "${probe}"; out="${out}${out:+,}${check}"; fi
  done
  printf '%s' "${out}"
}

driver_s4_probes() {
  _fake_stage updater_sigs
  _fake_stage updater_payload
}

# The walk is one JSON file whatever produced it, so the fake driver answers it
# the same way it answers every other probe: from a fixture. That is what lets
# the coverage rule -- a registered control the walk never touched is a row, not
# an absence -- be tested on a runner with no artefact and no window server.
driver_ui_walk() { _fake_stage ui_walk; }
