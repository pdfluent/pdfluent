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

APP=""          # the copy under test, found in S1 and used from S2 on

# --mode ci (release_suite.sh): an unsigned CI build with its own identifier,
# run on a machine where the owner's own PDFluent may be open. Everything that
# finds, quits or kills "the app" then goes by the path of the copy under test
# and by the CI identifier -- never by the process name or the shipped bundle
# id, which would reach the installed copy.
_ci() { [ "${SUITE_MODE:-release}" = "ci" ]; }
_bundle_id() {
  local v
  v="$(suite_state_get bundle_id)"
  if [ -z "${v}" ]; then
    v="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["expected_bundle_id"])' "${WORK}/meta.json" 2>/dev/null || echo com.pdfluent.app)"
    suite_state_set bundle_id "${v}"
  fi
  printf '%s' "${v}"
}
_app_pgrep() {
  if _ci; then pgrep -f "^${APP}/Contents/MacOS/pdfluent-desktop"; else pgrep -x pdfluent-desktop; fi
}
_app_kill9() {
  if _ci; then pkill -9 -f "^${APP}/Contents/MacOS/" >/dev/null 2>&1 || true
  else pkill -9 -x pdfluent-desktop >/dev/null 2>&1 || true; fi
}
LOG_DIR=""
NO_LAUNCH="${PDFLUENT_SUITE_NO_LAUNCH:-0}"

# S1 runs in its own subshell and so does every step after it, so these four
# facts are written down where the next step can read them rather than kept in
# a variable that dies with S1. Until #542 they were kept in the variable, and
# the two steps that need them skipped themselves on every macOS run there has
# ever been.
_load_state() {
  [ -n "${APP}" ] || APP="$(suite_state_get app)"
  [ -n "${LOG_DIR}" ] || LOG_DIR="$(suite_state_get log_dir)"
  SESSIONS_BASE="${SESSIONS_BASE:-$(suite_state_get sessions_base)}"
  CRASH_BASE="${CRASH_BASE:-$(suite_state_get crash_base)}"
}

driver_check_tools() {
  local missing="" t
  for t in hdiutil ditto codesign spctl xcrun /usr/libexec/PlistBuddy shasum lsof nettop script osascript python3 node; do
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

driver_kill_leftovers() {
  if _ci; then
    # Only copies this run unpacked. A CI run starts with none, and the
    # Applications/ directory of an earlier run is gone with its work dir.
    pkill -f "^${WORK}/Applications/" >/dev/null 2>&1 || true
  else
    pkill -x pdfluent-desktop >/dev/null 2>&1 || true
  fi
}
driver_os_string() { printf 'macOS %s' "$(sw_vers -productVersion 2>/dev/null || echo unknown)"; }
driver_load1() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}'; }

# _mount_artefact <mountpoint>: attach ARTEFACT there, at most three tries.
_mount_artefact() {
  local mnt="$1"
  # 23-10: an attach failed with "Resource temporarily unavailable" while no
  # image was attached at all -- diskarbitrationd was busy. Three bounded tries;
  # the last failure still fails the step, and mount.out keeps every attempt.
  local try
  for try in 1 2 3; do
    _run mount hdiutil attach -nobrowse -readonly -mountpoint "${mnt}" "${ARTEFACT}"
    cat "${WORK}/probes/mount.out" >> "${WORK}/probes/mount.attempts" 2>/dev/null
    [ "$(cat "${WORK}/probes/mount.rc" 2>/dev/null)" = "0" ] && break
    # A failed attach can leave the image attached and unmounted; the next run
    # then fails on "resource temporarily unavailable". Detach it by image path.
    hdiutil info 2>/dev/null | awk -v img="${ARTEFACT}" '
      /^image-path/ { on = (index($0, img) > 0) }
      on && /^\/dev\/disk[0-9]+[ \t]/ { print $1; on = 0 }' | while read -r dev; do
      hdiutil detach "${dev}" >/dev/null 2>&1 || true
    done
    [ "${try}" -lt 3 ] && sleep 10
  done
  return 0
}

driver_s1_probes() {
  # The mount point lives on the internal disk, always. hdiutil refuses to
  # mount onto a directory of a volume with ownership disabled ("insufficient
  # permissions"), which is what the CI runner's build volume is -- and a mount
  # point holds no data, so nothing is written there. /usr/bin/mktemp directly:
  # the runner's mktemp shim would put it back on the build volume.
  # PDFLUENT_SUITE_MOUNT_POINT is for the suite's own cases, which hand it a
  # directory that already holds a bundle instead of mounting anything.
  local mnt="${PDFLUENT_SUITE_MOUNT_POINT:-}" made_mnt=0
  if [ -z "${mnt}" ]; then
    mnt="$(/usr/bin/mktemp -d /private/tmp/pdfluent-suite-mnt.XXXXXX)" && made_mnt=1
  fi
  mkdir -p "${WORK}/Applications"
  _mount_artefact "${mnt}"
  local src
  src="$(/usr/bin/find "${mnt}" -maxdepth 1 -name '*.app' | head -1)"
  if [ -n "${src}" ]; then
    APP="${WORK}/Applications/$(basename "${src}")"
    # A copy, the way a person drags it to Applications. beta.5 was validated
    # from the mounted volume, which is not what anybody runs.
    ditto "${src}" "${APP}" >/dev/null 2>&1
    suite_state_set app "${APP}"
    printf '%s\n' "$(basename "${src}")" > "${WORK}/probes/mount.out"
  fi
  hdiutil detach "${mnt}" >/dev/null 2>&1 || true
  [ "${made_mnt}" = 1 ] && rmdir "${mnt}" 2>/dev/null
  true
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
    # The container is named after the bundle identifier; the directory inside
    # it is the one the app hard-codes (app_log_dir_path in src-tauri/src/lib.rs).
    LOG_DIR="${HOME}/Library/Containers/$(_bundle_id)/Data/Library/Logs/com.pdfluent.app"
  else
    LOG_DIR="${HOME}/Library/Logs/com.pdfluent.app"
  fi
  # Where the log files stood before this run. Never truncate them: the
  # container refused truncation from a script, and reading from an offset
  # works everywhere.
  SESSIONS_BASE="$(_log_size "${LOG_DIR}/sessions.log")"
  CRASH_BASE="$(_log_size "${LOG_DIR}/pending-crashes.ndjson")"
  suite_state_set log_dir "${LOG_DIR}"
  suite_state_set sessions_base "${SESSIONS_BASE}"
  suite_state_set crash_base "${CRASH_BASE}"
}

driver_s1_checks() {
  local embed=""
  [ -e "${WORK}/probes/embed_gate.rc" ] && embed=",embed"
  if _ci; then
    # The probes ran and their output is in the work dir; what they would be
    # judged against -- a Developer ID chain, a notarisation ticket -- is not
    # in an ad-hoc signed CI build, and pretending otherwise would be a FAIL
    # about the build type rather than about the code. The release run judges
    # them on the artefact that ships.
    local why="a CI build is ad-hoc signed by design; the Developer ID chain and notarisation are judged on the release run of the shipped artefact"
    na_row S1 codesign signature "${why}"
    na_row S1 spctl signature "${why}"
    na_row S1 stapler signature "${why}"
    printf '%s' "mount,version,bundle_id,entitlements${embed}"
    return 0
  fi
  printf '%s' "mount,version,bundle_id,codesign,spctl,stapler,entitlements${embed}"
}

driver_documents() {
  _load_state
  [ "${NO_LAUNCH}" = "1" ] && return 0
  [ -n "${APP}" ] || return 0
  local f
  for f in "${REPO_ROOT}"/src-tauri/tests/golden/*.pdf; do
    [ -e "$f" ] || continue
    basename "$f" .pdf
  done
}

_log_size() { [ -f "$1" ] && stat -f %z "$1" || echo 0; }

# ── S3, measured during S2 ───────────────────────────────────────────────────
#
# The offline promise is about the artefact a user installs, so it is measured
# on that artefact, in the run S2 already starts. Two reasons it is not measured
# by denying the network instead: a sandboxed bundle cannot be started under a
# second sandbox at all (it dies in its container before its own code runs), and
# an unsandboxed build made to be squeezable is not the build anybody ships.
#
# The limitation belongs on the record rather than in a footnote. Sampling is
# not watching: a connection opened and closed between two samples is invisible
# here, and a startup update check is exactly that shape. `lsof` costs tens of
# milliseconds per call, so half a second is nearer a floor than a ceiling. That
# is why `nettop` runs continuously alongside -- it is not a second opinion, it
# is cover for the gaps of the first, and a socket either of them sees counts.
#
# `nettop` runs under `script` for one reason: with its output redirected to a
# file it is fully buffered, and the buffer dies with the process when the run
# ends. Three seconds of continuous logging landed exactly zero bytes on disk,
# which is the silent-empty-evidence shape this suite exists to refuse. A pty
# makes it line-buffered, so what it saw is written as it sees it.
# Both samplers are started through suite/observers.sh, which writes their pids
# down and binds each of them to the launch AND to the suite process. They used
# to be two plain background jobs stopped on the happy path only, so an
# interrupted run left them: on 15-09 that was 17 and then 34 parentless
# `nettop` processes, 30-50 % CPU each, on a machine shared with everything
# else (#554).
_NET_T0=""; _NET_DOC_T0=""; _NET_DOC=""

_net_observe_start() {  # _net_observe_start <pid> [document]
  local pid="$1" out="${WORK}/probes/net_observe.out"
  [ -n "${pid}" ] || return 0
  [ -n "${_NET_T0}" ] || _NET_T0="$(python3 -c 'import time;print(time.time())')"
  # Per launch as well as cumulative. What the row has to answer is whether ONE
  # launch was watched for longer than the app waits before its update check,
  # and the span since the first launch cannot say (#551).
  _NET_DOC_T0="$(python3 -c 'import time;print(time.time())')"
  _NET_DOC="${2:-${_NET_DOC}}"
  observer_sampler_start "${pid}" "${out}"
  observer_nettop_start "${pid}" "${WORK}/probes/net_nettop.out"
}

_net_observe_stop() {
  local out="${WORK}/probes/net_observe.out"
  # Everything this launch started, children first, and the list emptied after.
  # The next launch records its own.
  observer_reap
  if [ -s "${WORK}/probes/net_nettop.out" ]; then
    printf -- '--- nettop ---\n' >> "${out}"
    cat "${WORK}/probes/net_nettop.out" >> "${out}"
    : > "${WORK}/probes/net_nettop.out"
  fi
  if grep -q '^--- sample ' "${out}" 2>/dev/null; then
    local ms doc_ms
    ms="$(python3 -c "import time;print(int((time.time()-${_NET_T0:-0})*1000))" 2>/dev/null || echo 0)"
    if [ -n "${_NET_DOC}" ] && [ -n "${_NET_DOC_T0}" ]; then
      doc_ms="$(python3 -c "import time;print(int((time.time()-${_NET_DOC_T0})*1000))" 2>/dev/null || echo 0)"
      printf -- '--- document %s window %s ms ---\n' "${_NET_DOC}" "${doc_ms}" >> "${out}"
    fi
    printf -- '--- window %s ms ---\n' "${ms}" >> "${out}"
    echo 0 > "${WORK}/probes/net_observe.rc"
  else
    printf 'SKIPPED (not a pass): the application never showed a process id, so no socket of it could be sampled\n' >> "${out}"
    echo 3 > "${WORK}/probes/net_observe.rc"
  fi
  _NET_DOC_T0=""; _NET_DOC=""
}

# ── The hold ─────────────────────────────────────────────────────────────────
#
# How long the app has to stay open before the observation has covered
# anything, read from meta.json -- which got it from src/lib/updater.ts, so the
# hold and the bar the judge weighs it against are one number with no copy of it
# anywhere in this file.
#
# A meta.json this cannot read leaves the hold at zero, and that is not a silent
# shortcut: a run with no hold produces per-document windows shorter than the
# delay, and the row then reports exactly that and skips. The failure is loud in
# the place a reader looks.
_hold_ms() {
  local v
  v="$(suite_state_get s2_hold_ms)"
  if [ -z "${v}" ]; then
    v="$(python3 -c 'import json,sys;print(int(json.load(open(sys.argv[1]))["s2_hold_ms"]))' "${WORK}/meta.json" 2>/dev/null || echo 0)"
    suite_state_set s2_hold_ms "${v}"
  fi
  printf '%s' "${v}"
}

# Hold the launch open until the startup update check has had its moment.
#
# The app reaches out once on its own: a silent update check on a timer that
# starts when the frontend loads. S2 used to quit as soon as the parse mark
# appeared -- about a second -- so on the 10-09 rehearsal all seventeen launches
# ended before that timer fired, and the offline row reported a quiet window
# that the app had not yet had the chance to break (#551).
#
# On the FIRST document only. One launch that outlives the check is the whole
# claim; seventeen of them buy the same fact seventeen times and add two minutes
# to every release evening. The file is the marker rather than a variable
# because a step's variables die with its subshell, which is what #542 was.
#
# The deadline is absolute -- `started` plus the hold, not the hold from here --
# because the app has been open since `started` and a document that took six
# seconds to parse has already outlived the check. Waiting the full hold on top
# of that would pay for a window the launch already had.
_hold_for_startup_check() {  # _hold_for_startup_check <started_epoch> [document]
  local started="$1" hold
  hold="$(_hold_ms)"
  case "${hold}" in ''|0|*[!0-9]*) return 0 ;; esac
  [ -e "${WORK}/s2_held" ] && return 0
  # Which launch paid it. The marker has to exist anyway; naming the document in
  # it costs nothing and puts "the hold was taken once, on this one" on the
  # report instead of leaving it to be inferred from a duration.
  printf '%s' "${2:-unnamed}" > "${WORK}/s2_held"
  python3 -c 'import sys,time
left = float(sys.argv[1]) + int(sys.argv[2]) / 1000.0 - time.time()
if left > 0:
    time.sleep(left)
' "${started}" "${hold}" 2>/dev/null || true
}

# The process id of the copy under test, once it exists. Polled rather than
# assumed: `open` returns before the binary is up.
_app_pid() {
  local left=100 pid=""
  while [ "${left}" -gt 0 ]; do
    pid="$(_app_pgrep 2>/dev/null | head -1)"
    [ -n "${pid}" ] && { printf '%s' "${pid}"; return 0; }
    /bin/sleep 0.1; left=$((left - 1))
  done
  return 1
}
_log_delta() { local f="$1" off="$2"; [ -f "$f" ] && tail -c "+$((off + 1))" "$f" || true; }

# One process lifecycle: start with the document on the command line, wait for
# the parse mark the app writes itself, confirm it is still there, quit it the
# way a person does, and read back what it wrote about its own exit.
driver_open_document() {
  _load_state
  local doc="$1"
  local pdf="${REPO_ROOT}/src-tauri/tests/golden/${doc}.pdf"
  local applog="${LOG_DIR}/PDFluent.log" sessions="${LOG_DIR}/sessions.log"
  local off_app off_sess started waited
  off_app="$(_log_size "${applog}")"; off_sess="$(_log_size "${sessions}")"

  driver_kill_leftovers
  started="$(python3 -c 'import time;print(time.time())')"
  [ -f "${WORK}/s2_t0" ] || printf '%s' "${started}" > "${WORK}/s2_t0"
  # -g on a CI run: the runner is a person's desktop, and seventeen launches
  # that each take the focus make it unusable for the length of the job. The
  # window still opens and the web view still runs; it just stays behind.
  if _ci; then open -g -a "${APP}" "${pdf}" >/dev/null 2>&1
  else open -a "${APP}" "${pdf}" >/dev/null 2>&1; fi

  # S3 rides on this launch. Starting the app a second time to watch it would
  # watch a different run than the one every other row is about.
  _net_observe_start "$(_app_pid || true)" "${doc}"

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

  # The document is parsed and the timing is taken; what is left of the hold is
  # time the app spends open with the sampler on it. Measured before the quit
  # rather than instead of it: the quit still has to be clean, and the row that
  # says so is the same one it always was.
  _hold_for_startup_check "${started}" "${doc}"

  _run alive _app_pgrep
  osascript -e "tell application id \"$(_bundle_id)\" to quit" >/dev/null 2>&1 || true
  local left=150
  while [ "${left}" -gt 0 ] && _app_pgrep >/dev/null 2>&1; do /bin/sleep 0.1; left=$((left - 1)); done
  if _app_pgrep >/dev/null 2>&1; then
    _app_kill9
    printf 'the app did not quit within 15 s and had to be killed\n' >> "${WORK}/probes/quit_forced.out"
    echo 1 > "${WORK}/probes/quit_forced.rc"
  fi
  _net_observe_stop

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
  # What the whole step cost, and how much of it was the hold, on the `alive`
  # row. The hold was added on purpose and it is the kind of cost that grows
  # quietly -- one launch held is seconds, seventeen is a different release
  # evening -- so the number is printed rather than left to be noticed.
  if [ -f "${WORK}/s2_t0" ]; then
    local total
    total="$(python3 -c "import time;print(int((time.time()-float(open('${WORK}/s2_t0').read()))*1000))" 2>/dev/null || echo 0)"
    # `held` names the one launch that paid the hold; empty when none did.
    # Golden document names are plain basenames, so none of them can end the
    # string early.
    printf '{"s2_total_ms":%s,"hold_ms":%s,"held":"%s"}' "${total}" "$(_hold_ms)" \
      "$(cat "${WORK}/s2_held" 2>/dev/null)" > "${WORK}/numbers/alive.json"
  fi
  printf '%s' "${out}"
}

driver_s3_probes() {
  _load_state
  [ -n "${APP}" ] || return 0
  local bin="${APP}/Contents/MacOS/pdfluent-desktop"
  local allowlist="${REPO_ROOT}/scripts/ci/offline-allowlist.mjs"
  # The sockets were sampled during S2; nothing to probe for them here.
  #
  # The scan gates what this repository writes -- the built frontend and the
  # backend sources -- and reports the linked executable without gating it. A
  # release binary carries the string literals of every crate and framework it
  # links, and an allow-list cannot tell a namespace identifier from an address.
  if [ -f "${allowlist}" ]; then
    local args=(--tree src-tauri/src --binary "${bin}")
    [ -d "${REPO_ROOT}/dist" ] && args=(--tree dist "${args[@]}")
    _run offline_allowlist node "${allowlist}" "${args[@]}"
  fi
}

driver_s3_checks() {
  local out=""
  [ -e "${WORK}/probes/net_observe.rc" ] && out="offline:observe"
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

# The UI walk (S5) drives a ui-walk build of the same commit, never the installed
# application (#471). A release build ships no inspectable web view and no
# automation surface, and adding one to reach this step would ship it to every
# user in order to test it. So scripts/build-ui-walk.sh builds the same commit a
# second time with the in-page walker compiled in, the workflow passes that .app as
# UI_WALK_APP, and this runs it on a copy of a golden document. Every row the judge
# writes says "measured on the ui-walk build of <sha>, not on the shipped bytes".
#
# No UI_WALK_APP, or a walk that did not produce a probe, leaves the probe absent:
# every registered control gets a SKIPPED row with the reason and the report is
# INCOMPLETE, as it was for 1.0.0.
driver_ui_walk() {
  local app="${UI_WALK_APP:-}"
  if [ -z "${app}" ] || [ ! -d "${app}" ]; then
    UI_WALK_GAP="no ui-walk build was given to this run (UI_WALK_APP), so no control was driven; the installed application has no inspectable web view"
    return 0
  fi
  local exe doc="${WORK}/ui-walk-doc.pdf"
  exe="$(ls "${app}"/Contents/MacOS/* 2>/dev/null | head -1)"
  cp "${REPO_ROOT}/src-tauri/tests/fixtures/ui-walk-doc.pdf" "${doc}" 2>/dev/null || true
  mkdir -p "${WORK}/probes"
  if ! node "${SUITE_DIR}/ui_walk_run.mjs" --binary "${exe}" --fixture "${doc}" --work "${WORK}" \
        --built-from "${UI_WALK_BUILT_FROM:-}" --repo "${REPO_ROOT}" 2> "${WORK}/probes/ui_walk.err"; then
    UI_WALK_GAP="$(tail -n 1 "${WORK}/probes/ui_walk.err" | tr -d '\r' | sed 's/^SKIPPED (not a pass): //')"
    rm -f "${WORK}/probes/ui_walk.out" "${WORK}/probes/ui_walk.rc"
  fi
}

driver_gaps() {
  [ -e "${WORK}/probes/embed_gate.rc" ] || \
    printf 'S1|embed|artefact|no dist/ in this checkout to compare the embedded frontend against\n'
  [ -e "${WORK}/probes/net_observe.rc" ] || \
    printf 'S3|offline:observe|offline|connections were not sampled during this run\n'
}
