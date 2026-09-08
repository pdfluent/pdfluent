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

if [ -f "${REPO_ROOT}/.env" ]; then
  : "${WIN_BUILD_HOST:=$(grep -E '^WIN_BUILD_HOST=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
  : "${WIN_EDITOR_PATH:=$(grep -E '^WIN_EDITOR_PATH=' "${REPO_ROOT}/.env" | tail -1 | cut -d= -f2- | tr -d '"'\''')}"
fi
WIN_SSH=(-o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=2000)
REMOTE_WORK="C:/Users/Public/pdfluent-release-suite"

driver_check_tools() {
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
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Stop-Process -Force\"" >/dev/null 2>&1 || true
}
driver_os_string() { ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"(Get-CimInstance Win32_OperatingSystem).Caption\"" 2>/dev/null | tr -d '\r'; }
# Three samples over three seconds, averaged.
#
# A single LoadPercentage reading is instantaneous and this machine swings
# between 40 and 100 while a build is running, so one sample lets a busy host
# through and stops an idle one at random. What the gate wants to know is
# whether work is running, and that is a short average rather than a moment.
driver_load1() {
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
_win_ran=0
_win_run_once() {
  [ "${_win_ran}" -eq 1 ] && return 0
  _win_ran=1
  local remote_msi="${REMOTE_WORK}/$(basename "${ARTEFACT}")"
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${REMOTE_WORK}' | Out-Null; Remove-Item -Recurse -Force '${REMOTE_WORK}/probes' -ErrorAction SilentlyContinue\"" >/dev/null 2>&1
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
  scp "${WIN_SSH[@]}" "${REPO_ROOT}/scripts/ci/offline-allowlist.mjs" "${WIN_BUILD_HOST}:${REMOTE_WORK}/offline-allowlist.mjs" >/dev/null 2>&1 || true

  local no_launch=""
  [ "${PDFLUENT_SUITE_NO_LAUNCH:-0}" = "1" ] && no_launch="-NoLaunch"
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" \
    "powershell -NoProfile -ExecutionPolicy Bypass -File '${REMOTE_WORK}/windows.ps1' -Msi '${remote_msi}' -Work '${REMOTE_WORK}' -Golden '${REMOTE_WORK}/golden' -Allowlist '${REMOTE_WORK}/offline-allowlist.mjs' -Documents '$(_win_documents)' ${no_launch}" \
    > "${WORK}/windows-run.log" 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/probes/." "${WORK}/probes/" >/dev/null 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/ms/." "${WORK}/ms/" >/dev/null 2>&1 || true
  scp -r "${WIN_SSH[@]}" "${WIN_BUILD_HOST}:${REMOTE_WORK}/numbers/." "${WORK}/numbers/" >/dev/null 2>&1 || true
}

driver_s1_probes() { _win_run_once; }
driver_s1_checks() {
  local out="authenticode,version"
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
  [ -e "${WORK}/probes/applog_missing.rc" ] && out="applog"
  [ -e "${WORK}/probes/alive.rc" ] && out="${out}${out:+,}alive"
  [ -e "${WORK}/probes/session_delta.out" ] && out="${out}${out:+,}clean_quit"
  [ -e "${WORK}/probes/crash_scan.out" ] && out="${out}${out:+,}no_crash"
  printf '%s' "${out}"
}

driver_s3_probes() { :; }
driver_s3_checks() {
  # No sandbox-exec here, and blocking one program needs an administrator rule
  # that changes a machine other work runs on. The static allow-list is what
  # this platform can honestly report; the denied-network run is not done, and
  # that is why a Windows report is INCOMPLETE on this row.
  [ -e "${WORK}/probes/offline_allowlist.rc" ] && printf 'offline:allowlist'
}

driver_s4_probes() {
  local art="${REPO_ROOT}/artifacts"
  ls "${art}"/windows/*.sig >/dev/null 2>&1 || return 0
  bash "${REPO_ROOT}/scripts/verify-updater-sigs.sh" "${art}" > "${WORK}/probes/updater_sigs.out" 2>&1
  echo $? > "${WORK}/probes/updater_sigs.rc"
  node "${SUITE_DIR}/updater_payload.mjs" "${art}/windows" "${WORK}" > "${WORK}/probes/updater_payload.out" 2>&1
  echo $? > "${WORK}/probes/updater_payload.rc"
}

# The UI walk on the build host is not wired yet. WebView2 can be started with a
# debugging port, so this platform does have a way in -- it has not been run
# there, and a driver that has never run is exactly what this step exists to
# stop being reported as coverage.
driver_ui_walk() {
  UI_WALK_GAP="the walk has not been run on the build-host lane yet, so no control was driven on this platform"
}

driver_gaps() {
  printf 'S3|offline:denied|offline|no network-denying sandbox on Windows: blocking one program needs an administrator firewall rule on a machine other work runs on\n'
}
