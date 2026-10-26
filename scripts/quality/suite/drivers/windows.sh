# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# The Windows lane: the orchestrator runs on the Mac, ships windows.ps1 to the
# build host, runs it there against the .msi, and fetches the probe files back.
# Judgement then happens here, in the same judge.mjs every other platform uses.
#
# Connection details live in the gitignored .env, never in this file.
#
# --mode ci is the other lane: the suite runs ON the Windows CI runner
# (quality.yml, windows-app), so there is no ssh and no copy -- windows.ps1 runs
# here, against the MSI the job just built, and writes its probes straight into
# the work directory. The judgement is the same judge.mjs either way.

if [ -f "${REPO_ROOT}/.env" ]; then
  : "${WIN_BUILD_HOST:=$(grep -E '^WIN_BUILD_HOST=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
  : "${WIN_EDITOR_PATH:=$(grep -E '^WIN_EDITOR_PATH=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
fi
WIN_SSH=(-o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=2000)
REMOTE_WORK="C:/Users/Public/pdfluent-release-suite"

_win_local() { [ "${SUITE_MODE:-release}" = "ci" ]; }
_winpath() { cygpath -w "$1" 2>/dev/null || printf '%s' "$1"; }
_ps() { powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$1"; }

driver_check_tools() {
  if _win_local; then
    command -v powershell.exe >/dev/null 2>&1 || { echo "powershell.exe is not on PATH" > "${WORK}/preflight-tools.err"; return 1; }
    command -v cygpath >/dev/null 2>&1 || { echo "cygpath is not on PATH (the CI lane runs under Git Bash)" > "${WORK}/preflight-tools.err"; return 1; }
    local l; l="$(driver_load1 2>/dev/null)"; case "${l}" in ''|*[!0-9]*) l=null ;; esac
    printf '{"driver":"windows","lane":"ci-local","powershell":"present","host_load_percent":%s}' "${l}"
    return 0
  fi
  if [ -z "${WIN_BUILD_HOST:-}" ] || [ -z "${WIN_EDITOR_PATH:-}" ]; then
    echo "WIN_BUILD_HOST and WIN_EDITOR_PATH must be set (env or the gitignored .env)" > "${WORK}/preflight-tools.err"
    return 1
  fi
  if ! ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"exit 0\"" >/dev/null 2>&1; then
    echo "the build host did not answer over ssh" > "${WORK}/preflight-tools.err"
    return 1
  fi

  # The build host is shared with the CI runner and the corpus (#427). Every
  # number this lane produces is a wall-clock measurement of a cold application
  # start, so a run taken while that machine is compiling does not measure the
  # artefact -- and the 60 s open timeout turns a loaded box into FAIL rows
  # about documents that are fine. A busy host is a reason not to run, said
  # before the run rather than discovered in the report.
  local load
  load="$(driver_load1)"
  if [ "${PDFLUENT_SUITE_IGNORE_HOST_LOAD:-0}" != "1" ] && [ -n "${load}" ] \
     && [ "${load}" -ge "${PDFLUENT_SUITE_MAX_HOST_LOAD:-70}" ] 2>/dev/null; then
    echo "the build host is ${load}% busy; other work is running there, and a timing taken beside it measures that work (set PDFLUENT_SUITE_IGNORE_HOST_LOAD=1 to run anyway)" \
      > "${WORK}/preflight-tools.err"
    return 1
  fi

  printf '{"driver":"windows","powershell":"present","host_load_percent":%s}' "${load:-null}"
}

driver_kill_leftovers() {
  if _win_local; then
    # Only copies unpacked under this run's work directory -- never by name.
    _ps "Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Where-Object { \$_.Path -and \$_.Path.StartsWith('$(_winpath "${WORK}")', 'OrdinalIgnoreCase') } | Stop-Process -Force" >/dev/null 2>&1 || true
    return 0
  fi
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Stop-Process -Force\"" >/dev/null 2>&1 || true
}
driver_os_string() {
  if _win_local; then _ps "(Get-CimInstance Win32_OperatingSystem).Caption" 2>/dev/null | tr -d '\r'; return 0; fi
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"(Get-CimInstance Win32_OperatingSystem).Caption\"" 2>/dev/null | tr -d '\r'
}
# Three samples over three seconds, averaged.
#
# A single LoadPercentage reading is instantaneous and this machine swings
# between 40 and 100 while a build is running, so one sample lets a busy host
# through and stops an idle one at random. What the gate wants to know is
# whether work is running, and that is a short average rather than a moment.
driver_load1() {
  if _win_local; then
    _ps "[math]::Round(((Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 3).CounterSamples | Measure-Object -Property CookedValue -Average).Average)" 2>/dev/null | tr -d '\r'
    return 0
  fi
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" \
    "powershell -NoProfile -Command \"[math]::Round(((Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 3).CounterSamples | Measure-Object -Property CookedValue -Average).Average)\"" \
    2>/dev/null | tr -d '\r'
}

_win_documents() {
  local f out=""
  for f in "${REPO_ROOT}"/src-tauri/tests/golden/*.pdf; do
    [ -e "$f" ] || continue
    out="${out}${out:+,}$(basename "$f" .pdf)"
  done
  printf '%s' "${out}"
}

# One remote run does the whole artefact: identity, every document, the offline
# allow-list, and the uninstall that leaves the box as it was found. Probes come
# back in one fetch, so a dropped connection loses a run rather than half of one.
_win_hold_ms() {
  python3 -c 'import json,sys;print(int(json.load(open(sys.argv[1]))["s2_hold_ms"]))' "${WORK}/meta.json" 2>/dev/null \
    || node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).s2_hold_ms|0)' "${WORK}/meta.json" 2>/dev/null \
    || echo 0
}

_win_ran=0
_win_run_once() {
  [ "${_win_ran}" -eq 1 ] && return 0
  _win_ran=1
  if _win_local; then
    local no_launch_l=()
    [ "${PDFLUENT_SUITE_NO_LAUNCH:-0}" = "1" ] && no_launch_l=(-NoLaunch)
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(_winpath "${SUITE_DIR}/drivers/windows.ps1")" \
      -Msi "$(_winpath "${ARTEFACT}")" -Work "$(_winpath "${WORK}")" \
      -Golden "$(_winpath "${REPO_ROOT}/src-tauri/tests/golden")" \
      -Allowlist "$(_winpath "${REPO_ROOT}/scripts/ci/offline-allowlist.mjs")" \
      -Documents "$(_win_documents)" -Mode ci -HoldMs "$(_win_hold_ms)" "${no_launch_l[@]}" \
      > "${WORK}/windows-run.log" 2>&1 || true
    return 0
  fi
  local remote_msi="${REMOTE_WORK}/$(basename "${ARTEFACT}")"
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${REMOTE_WORK}','${REMOTE_WORK}/scripts/ci','${REMOTE_WORK}/scripts/lib' | Out-Null; Remove-Item -Recurse -Force '${REMOTE_WORK}/probes' -ErrorAction SilentlyContinue\"" >/dev/null 2>&1
  scp "${WIN_SSH[@]}" "${ARTEFACT}" "${WIN_BUILD_HOST}:${remote_msi}" >/dev/null 2>&1 || return 0
  scp "${WIN_SSH[@]}" "${SUITE_DIR}/drivers/windows.ps1" "${WIN_BUILD_HOST}:${REMOTE_WORK}/windows.ps1" >/dev/null 2>&1 || return 0

  # The run carries what it needs instead of reading it off the build host.
  #
  # The golden documents and the allow-list used to be taken from the checkout
  # on that machine, and that checkout is whatever somebody last built from: on
  # 2026-09-08 it stood on a July commit with no golden directory at all, so the
  # lane would have opened nothing, written no document probe, and reported one
  # tidy "the application was not started" skip. Measuring less because another
  # machine is behind is the failure this suite exists to catch, not one to
  # inherit.
  scp -r "${WIN_SSH[@]}" "${REPO_ROOT}/src-tauri/tests/golden" "${WIN_BUILD_HOST}:${REMOTE_WORK}/golden" >/dev/null 2>&1 || true
  # Under the names it has in the checkout: the allow-list asks
  # scripts/lib/main-module.mjs whether it is the command, and a copy that
  # cannot reach it does not start. A guard that does not start on this host
  # reads as "the allow-list found nothing", which is the whole failure mode
  # this lane exists to refuse.
  scp "${WIN_SSH[@]}" "${REPO_ROOT}/scripts/ci/offline-allowlist.mjs" "${WIN_BUILD_HOST}:${REMOTE_WORK}/scripts/ci/offline-allowlist.mjs" >/dev/null 2>&1 || true
  scp "${WIN_SSH[@]}" "${REPO_ROOT}/scripts/lib/main-module.mjs" "${WIN_BUILD_HOST}:${REMOTE_WORK}/scripts/lib/main-module.mjs" >/dev/null 2>&1 || true

  local no_launch=""
  [ "${PDFLUENT_SUITE_NO_LAUNCH:-0}" = "1" ] && no_launch="-NoLaunch"
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" \
    "powershell -NoProfile -ExecutionPolicy Bypass -File '${REMOTE_WORK}/windows.ps1' -Msi '${remote_msi}' -Work '${REMOTE_WORK}' -Golden '${REMOTE_WORK}/golden' -Allowlist '${REMOTE_WORK}/scripts/ci/offline-allowlist.mjs' -Documents '$(_win_documents)' -HoldMs $(_win_hold_ms) ${no_launch}" \
    > "${WORK}/windows-run.log" 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/probes/." "${WORK}/probes/" >/dev/null 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/ms/." "${WORK}/ms/" >/dev/null 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/numbers/." "${WORK}/numbers/" >/dev/null 2>&1 || true
}

driver_s1_probes() { _win_run_once; }
driver_s1_checks() {
  local out="authenticode,version"
  if _win_local; then
    na_row S1 authenticode signature "a CI build is unsigned by design; the Authenticode chain is judged on the release run of the shipped installer"
    out="version"
  fi
  [ -e "${WORK}/probes/msi_install.rc" ] && out="${out},msi_install"
  printf '%s' "${out}"
}

driver_documents() {
  local f
  [ "${PDFLUENT_SUITE_NO_LAUNCH:-0}" = "1" ] && return 0
  for f in "${WORK}"/probes/wait_log_*.rc; do
    [ -e "$f" ] || continue
    f="$(basename "$f")"; f="${f#wait_log_}"; printf '%s\n' "${f%.rc}"
  done
}
driver_open_document() { :; }   # the remote run already opened every document
driver_s2_checks() {
  local out=""
  # First, because every open row below depends on it: no desktop session is
  # one named failure rather than seventeen timeouts.
  [ -e "${WORK}/probes/desktop_session.rc" ] && out="desktop"
  [ -e "${WORK}/probes/applog_missing.rc" ] && out="applog"
  [ -e "${WORK}/probes/alive.rc" ] && out="${out}${out:+,}alive"
  [ -e "${WORK}/probes/session_delta.out" ] && out="${out}${out:+,}clean_quit"
  [ -e "${WORK}/probes/crash_scan.out" ] && out="${out}${out:+,}no_crash"
  printf '%s' "${out}"
}

driver_s3_probes() { :; }
driver_s3_checks() {
  # Both halves, as on macOS: the sockets of every launch, sampled on the host
  # while S2 has the app open (windows.ps1, Get-NetTCPConnection over the app's
  # process tree), and the allow-list scan. Until 17-10 the sampler did not
  # exist here and the observe row was a named gap that made every Windows
  # report INCOMPLETE.
  local out=""
  [ -e "${WORK}/probes/net_observe.rc" ] && out="offline:observe"
  [ -e "${WORK}/probes/offline_allowlist.rc" ] && out="${out}${out:+,}offline:allowlist"
  printf '%s' "${out}"
}

driver_s4_probes() {
  local art="${REPO_ROOT}/artifacts"
  ls "${art}"/windows/*.sig >/dev/null 2>&1 || return 0
  bash "${REPO_ROOT}/scripts/verify-updater-sigs.sh" "${art}" > "${WORK}/probes/updater_sigs.out" 2>&1
  echo $? > "${WORK}/probes/updater_sigs.rc"
  node "${SUITE_DIR}/updater_payload.mjs" "${art}/windows" "${WORK}" > "${WORK}/probes/updater_payload.out" 2>&1
  echo $? > "${WORK}/probes/updater_payload.rc"
}

# The UI walk (S5) drives a ui-walk build of the same commit, never the installer
# that ships (#471). The build's in-page walker needs no debug port; this ships the
# walk .msi (UI_WALK_MSI), the list of controls and one golden document to the
# host, runs windows_ui_walk.ps1 there, fetches the one result file back and lets
# ui_walk_run.mjs --accept turn it into the probe the judge reads. Every row says
# "measured on the ui-walk build of <sha>, not on the shipped bytes".
#
# No UI_WALK_MSI, or no result, leaves the probe absent: every registered control
# gets a SKIPPED row with the reason and the report is INCOMPLETE.
driver_ui_walk() {
  local msi="${UI_WALK_MSI:-}"
  if [ -z "${msi}" ] || [ ! -f "${msi}" ]; then
    UI_WALK_GAP="no ui-walk build was given to this run (UI_WALK_MSI), so no control was driven; the installer has no inspectable web view"
    return 0
  fi
  local fixture="${REPO_ROOT}/src-tauri/tests/fixtures/ui-walk-doc.pdf"
  local list="${WORK}/ui_walk_targets_list.json" result="${WORK}/ui_walk_result_fetched.json"
  mkdir -p "${WORK}/probes"
  node "${SUITE_DIR}/ui_walk.mjs" --targets "${REPO_ROOT}" > "${list}" 2>"${WORK}/probes/ui_walk.err" || {
    UI_WALK_GAP="the list of controls could not be read from the register"; return 0; }
  rm -f "${result}"
  if _win_local; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(_winpath "${SUITE_DIR}/drivers/windows_ui_walk.ps1")" \
      -Msi "$(_winpath "${msi}")" -Work "$(_winpath "${WORK}")" -Fixture "$(_winpath "${fixture}")" \
      -Targets "$(_winpath "${list}")" -Signer "$(_winpath "${REPO_ROOT}/src-tauri/tests/fixtures")" > "${WORK}/ui-walk-run.log" 2>&1 || true
    [ -f "${WORK}/walk/ui_walk_result.json" ] && cp "${WORK}/walk/ui_walk_result.json" "${result}"
  else
    local remote="${REMOTE_WORK}/ui-walk"
    ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${remote}' | Out-Null\"" >/dev/null 2>&1 || true
    scp "${WIN_SSH[@]}" "${msi}" "${WIN_BUILD_HOST}:${remote}/walk.msi" >/dev/null 2>&1 \
      && scp "${WIN_SSH[@]}" "${SUITE_DIR}/drivers/windows_ui_walk.ps1" "${WIN_BUILD_HOST}:${remote}/windows_ui_walk.ps1" >/dev/null 2>&1 \
      && scp "${WIN_SSH[@]}" "${fixture}" "${WIN_BUILD_HOST}:${remote}/fixture.pdf" >/dev/null 2>&1 \
      && scp "${WIN_SSH[@]}" "${list}" "${WIN_BUILD_HOST}:${remote}/targets.json" >/dev/null 2>&1 \
      && scp "${WIN_SSH[@]}" "${REPO_ROOT}/src-tauri/tests/fixtures/signer-test.p12" "${REPO_ROOT}/src-tauri/tests/fixtures/signer-test.json" "${WIN_BUILD_HOST}:${remote}/" >/dev/null 2>&1 \
      || { UI_WALK_GAP="the walk build could not be copied to the build host"; return 0; }
    ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" \
      "powershell -NoProfile -ExecutionPolicy Bypass -File '${remote}/windows_ui_walk.ps1' -Msi '${remote}/walk.msi' -Work '${remote}' -Fixture '${remote}/fixture.pdf' -Targets '${remote}/targets.json' -Signer '${remote}'" \
      > "${WORK}/ui-walk-run.log" 2>&1 || true
    scp "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${remote}/walk/ui_walk_result.json" "${result}" >/dev/null 2>&1 || true
  fi
  if [ ! -f "${result}" ]; then
    UI_WALK_GAP="the walk build wrote no result on the Windows host ($(tail -n 1 "${WORK}/ui-walk-run.log" 2>/dev/null | tr -d '\r' | cut -c1-160))"
    return 0
  fi
  if ! node "${SUITE_DIR}/ui_walk_run.mjs" --accept "${result}" --work "${WORK}" --built-from "${UI_WALK_BUILT_FROM:-}" \
        2> "${WORK}/probes/ui_walk.err"; then
    UI_WALK_GAP="$(tail -n 1 "${WORK}/probes/ui_walk.err" | tr -d '\r' | sed 's/^SKIPPED (not a pass): //')"
    rm -f "${WORK}/probes/ui_walk.out" "${WORK}/probes/ui_walk.rc"
  fi
}

driver_gaps() {
  [ -e "${WORK}/probes/net_observe.rc" ] || \
    printf 'S3|offline:observe|offline|no launch was sampled on the Windows host, so no window of this run was observed\n'
}
