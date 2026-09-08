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
  printf '{"driver":"windows","powershell":"present"}'
}

driver_kill_leftovers() {
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Stop-Process -Force\"" >/dev/null 2>&1 || true
}
driver_os_string() { ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"(Get-CimInstance Win32_OperatingSystem).Caption\"" 2>/dev/null | tr -d '\r'; }
driver_load1() { ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" "powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average\"" 2>/dev/null | tr -d '\r'; }

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
  local no_launch=""
  [ "${PDFLUENT_SUITE_NO_LAUNCH:-0}" = "1" ] && no_launch="-NoLaunch"
  ssh "${WIN_SSH[@]}" "${WIN_BUILD_HOST}" \
    "powershell -NoProfile -ExecutionPolicy Bypass -File '${REMOTE_WORK}/windows.ps1' -Msi '${remote_msi}' -Work '${REMOTE_WORK}' -Checkout '${WIN_EDITOR_PATH}' -Documents '$(_win_documents)' ${no_launch}" \
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
  [ -e "${WORK}/probes/alive.rc" ] && out="alive"
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

driver_gaps() {
  printf 'S3|offline:denied|offline|no network-denying sandbox on Windows: blocking one program needs an administrator firewall rule on a machine other work runs on\n'
}
