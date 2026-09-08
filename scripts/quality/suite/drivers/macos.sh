# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# macOS probes. This half touches tools and the application; nothing here
# decides what an output means — judge.mjs does that, and it does it the same
# way on every platform, which is why the meaning can be tested without a Mac.
#
# The app is driven from OUTSIDE: an argument on the command line, its own log
# files, and an ordinary quit. There is no headless mode and no automation
# surface in the product, and this suite does not add one.

_p() { printf '%s' "$2" > "${WORK}/probes/$1.out"; echo "$3" > "${WORK}/probes/$1.rc"; }
_run() {  # _run <probe> <command...>
  local probe="$1"; shift
  "$@" > "${WORK}/probes/${probe}.out" 2>&1
  echo $? > "${WORK}/probes/${probe}.rc"
}

APP=""          # the copy under test, filled in by driver_s1_probes
LOG_DIR=""
NO_LAUNCH="${PDFLUENT_SUITE_NO_LAUNCH:-0}"

driver_check_tools() {
  local missing="" t
  for t in hdiutil ditto codesign spctl xcrun /usr/libexec/PlistBuddy shasum sandbox-exec lsof osascript python3 node; do
    command -v "$t" >/dev/null 2>&1 || [ -x "$t" ] || missing="${missing} $t"
  done
  if [ -n "${missing}" ]; then
    echo "macOS tools missing:${missing}" > "${WORK}/preflight-tools.err"
    return 1
  fi
  node -e '
    const { execFileSync } = require("node:child_process");
    const v = (c, a) => { try { return execFileSync(c, a, {encoding:"utf8"}).trim().split("\n")[0]; } catch { return null; } };
    process.stdout.write(JSON.stringify({
      node: process.version,
      // Version strings where a tool offers one quietly. codesign and spctl
      // have no --version; the OS build in `os` is what dates them.
      macos_build: v("sw_vers", ["-buildVersion"]),
      xcode_clt: v("pkgutil", ["--pkg-info=com.apple.pkg.CLTools_Executables"]),
      minisign: v("minisign", ["-v"]),
    }));
  '
}

driver_kill_leftovers() { pkill -x pdfluent-desktop >/dev/null 2>&1 || true; }
driver_os_string() { printf 'macOS %s' "$(sw_vers -productVersion 2>/dev/null || echo unknown)"; }
driver_load1() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}'; }

driver_s1_probes() {
  local mnt="${WORK}/mnt"
  mkdir -p "${mnt}" "${WORK}/Applications"
  _run mount hdiutil attach -nobrowse -readonly -mountpoint "${mnt}" "${ARTEFACT}"
  local src
  src="$(/usr/bin/find "${mnt}" -maxdepth 1 -name '*.app' | head -1)"
  if [ -n "${src}" ]; then
    APP="${WORK}/Applications/$(basename "${src}")"
    # A copy, the way a person drags it to Applications. beta.5 was validated
    # from the mounted volume, which is not what anybody runs.
    ditto "${src}" "${APP}" >/dev/null 2>&1
    printf '%s\n' "$(basename "${src}")" > "${WORK}/probes/mount.out"
  fi
  hdiutil detach "${mnt}" >/dev/null 2>&1 || true
  [ -n "${APP}" ] || return 0

  _run bundle_version /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP}/Contents/Info.plist"
  _run bundle_id /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP}/Contents/Info.plist"
  _run codesign_verify codesign --verify --deep --strict --verbose=2 "${APP}"
  _run codesign_info codesign -dv --verbose=4 "${APP}"
  _run spctl_app spctl -a -t exec -vv "${APP}"
  _run spctl_dmg spctl -a -t open --context context:primary-signature -vv "${ARTEFACT}"
  _run stapler_app xcrun stapler validate "${APP}"
  _run stapler_dmg xcrun stapler validate "${ARTEFACT}"
  _run entitlements codesign -d --entitlements :- "${APP}"

  # The embed gate needs a dist/ built from the commit this artefact claims. On
  # a release run there is one; on a run against a downloaded artefact there is
  # not, and the row says that rather than passing.
  if [ -d "${REPO_ROOT}/dist" ]; then
    _run embed_gate node "${REPO_ROOT}/scripts/verify-frontend-embed.mjs" "${APP}"
  fi

  # Sandboxed builds write their logs inside the container.
  if grep -q 'app-sandbox' "${WORK}/probes/entitlements.out" 2>/dev/null; then
    LOG_DIR="${HOME}/Library/Containers/com.pdfluent.app/Data/Library/Logs/com.pdfluent.app"
  else
    LOG_DIR="${HOME}/Library/Logs/com.pdfluent.app"
  fi
  # Where the log files stood before this run. Never truncate them: the
  # container refused truncation from a script, and reading from an offset
  # works everywhere.
  SESSIONS_BASE="$(_log_size "${LOG_DIR}/sessions.log")"
  CRASH_BASE="$(_log_size "${LOG_DIR}/pending-crashes.ndjson")"
}

driver_s1_checks() {
  printf '%s' "mount,version,bundle_id,codesign,spctl,stapler,entitlements$([ -e "${WORK}/probes/embed_gate.rc" ] && printf ',embed')"
}

driver_documents() {
  [ "${NO_LAUNCH}" = "1" ] && return 0
  [ -n "${APP}" ] || return 0
  local f
  for f in "${REPO_ROOT}"/src-tauri/tests/golden/*.pdf; do
    [ -e "$f" ] || continue
    basename "$f" .pdf
  done
}

_log_size() { [ -f "$1" ] && stat -f %z "$1" || echo 0; }
_log_delta() { local f="$1" off="$2"; [ -f "$f" ] && tail -c "+$((off + 1))" "$f" || true; }

# One process lifecycle: start with the document on the command line, wait for
# the parse mark the app writes itself, confirm it is still there, quit it the
# way a person does, and read back what it wrote about its own exit.
driver_open_document() {
  local doc="$1"
  local pdf="${REPO_ROOT}/src-tauri/tests/golden/${doc}.pdf"
  local applog="${LOG_DIR}/PDFluent.log" sessions="${LOG_DIR}/sessions.log"
  local off_app off_sess started waited
  off_app="$(_log_size "${applog}")"; off_sess="$(_log_size "${sessions}")"

  driver_kill_leftovers
  started="$(python3 -c 'import time;print(time.time())')"
  open -a "${APP}" "${pdf}" >/dev/null 2>&1

  waited=0
  while [ "${waited}" -lt 1200 ]; do   # 1200 × 50 ms = 60 s
    if _log_delta "${applog}" "${off_app}" | grep -q 'document parsed OK'; then break; fi
    /bin/sleep 0.05; waited=$((waited + 1))
  done
  local now ms
  now="$(python3 -c 'import time;print(time.time())')"
  ms="$(python3 -c "print(int((${now}-${started})*1000))")"

  _log_delta "${applog}" "${off_app}" > "${WORK}/probes/wait_log_${doc}.out"
  if [ "${waited}" -ge 1200 ]; then echo 124 > "${WORK}/probes/wait_log_${doc}.rc"
  else echo 0 > "${WORK}/probes/wait_log_${doc}.rc"; printf '%s' "${ms}" > "${WORK}/ms/open_${doc}"
       printf '{"open_to_parsed_ms":%s}' "${ms}" > "${WORK}/numbers/open_${doc}.json"
  fi

  _run alive pgrep -x pdfluent-desktop
  osascript -e 'tell application id "com.pdfluent.app" to quit' >/dev/null 2>&1 || true
  local left=150
  while [ "${left}" -gt 0 ] && pgrep -x pdfluent-desktop >/dev/null 2>&1; do /bin/sleep 0.1; left=$((left - 1)); done
  if pgrep -x pdfluent-desktop >/dev/null 2>&1; then
    pkill -9 -x pdfluent-desktop >/dev/null 2>&1 || true
    printf 'the app did not quit within 15 s and had to be killed\n' >> "${WORK}/probes/quit_forced.out"
    echo 1 > "${WORK}/probes/quit_forced.rc"
  fi

  # Session pairs accumulate across documents; the delta is read once, at the
  # end, in driver_s2_checks.
  [ -f "${sessions}" ] && _log_delta "${sessions}" "${SESSIONS_BASE:-0}" > "${WORK}/probes/session_delta.out" && echo 0 > "${WORK}/probes/session_delta.rc"
  local crashes="${LOG_DIR}/pending-crashes.ndjson"
  _log_delta "${crashes}" "${CRASH_BASE:-0}" > "${WORK}/probes/crash_scan.out" 2>/dev/null || : > "${WORK}/probes/crash_scan.out"
  echo 0 > "${WORK}/probes/crash_scan.rc"
}

driver_s2_checks() {
  local out="alive"
  [ -e "${WORK}/probes/session_delta.out" ] && out="${out},clean_quit"
  [ -e "${WORK}/probes/crash_scan.out" ] && out="${out},no_crash"
  printf '%s' "${out}"
}

driver_s3_probes() {
  [ -n "${APP}" ] || return 0
  local bin="${APP}/Contents/MacOS/pdfluent-desktop"
  local offline="${REPO_ROOT}/scripts/quality/offline-runtime-check.sh"
  local allowlist="${REPO_ROOT}/scripts/ci/offline-allowlist.mjs"
  if [ "${NO_LAUNCH}" != "1" ] && [ -x "${offline}" ]; then
    _run net_denied_run bash "${offline}" --binary "${bin}" --document "${REPO_ROOT}/src-tauri/tests/golden/fixture-sample-text-3p.pdf"
  fi
  if [ -f "${allowlist}" ]; then
    _run offline_allowlist node "${allowlist}" --binary "${bin}"
  fi
}

driver_s3_checks() {
  local out=""
  [ -e "${WORK}/probes/net_denied_run.rc" ] && out="offline:denied"
  [ -e "${WORK}/probes/net_observe.rc" ] && out="${out}${out:+,}offline:observe"
  [ -e "${WORK}/probes/offline_allowlist.rc" ] && out="${out}${out:+,}offline:allowlist"
  printf '%s' "${out}"
}

driver_s4_probes() {
  local art="${REPO_ROOT}/artifacts"
  ls "${art}"/macos/*.sig >/dev/null 2>&1 || return 0
  _run updater_sigs bash "${REPO_ROOT}/scripts/verify-updater-sigs.sh" "${art}"
  node "${SUITE_DIR}/updater_payload.mjs" "${art}/macos" "${WORK}" > "${WORK}/probes/updater_payload.out" 2>&1
  echo $? > "${WORK}/probes/updater_payload.rc"
}

# The UI walk has no way in on this platform.
#
# Driving the interface from outside needs a debuggable web view, and a release
# build does not ship one: the `devtools` feature is off, so WKWebView is not
# inspectable and there is no protocol to attach to. The product has no headless
# mode and no automation surface either, and adding one to reach this step would
# ship an automation surface to every user in order to test it.
#
# So the walk is not done here, and every registered control gets a SKIPPED row
# with this reason rather than no row at all. The report is INCOMPLETE and says
# why, which is the honest state until the platform gets a way in.
driver_ui_walk() {
  UI_WALK_GAP="a release build ships no inspectable web view, so there is no way in to drive the interface of the installed application from outside"
}

driver_gaps() {
  [ -x "${REPO_ROOT}/scripts/quality/offline-runtime-check.sh" ] || \
    printf 'S3|offline:denied|offline|scripts/quality/offline-runtime-check.sh is not in this checkout, so no run with the network denied was made\n'
  [ -e "${WORK}/probes/embed_gate.rc" ] || \
    printf 'S1|embed|artefact|no dist/ in this checkout to compare the embedded frontend against\n'
  [ -e "${WORK}/probes/net_observe.rc" ] || \
    printf 'S3|offline:observe|offline|connections were not sampled during this run\n'
}
