# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# The processes this suite starts to watch a launch, and the one rule about
# them: an observer never outlives the launch it watches.
#
# S3 samples the sockets of the real run with `lsof` and watches it
# continuously with `nettop` under a pty. Both were stopped on the happy path
# only. An interrupted run -- a gate abort, a timeout, a kill of the suite
# process -- left them behind, and on 15-09 that filled a shared machine twice:
# first 17 and then 34 `nettop` processes with ppid 1, 30-50 % CPU each, load
# 251. Nobody had started them on purpose and nobody could tell which run had.
#
# So there are four layers here, and each one covers a way the other three are
# not reached:
#
#   1. Every observer pid is written down, in a file rather than a variable,
#      because every step runs in its own subshell and a variable set in one
#      dies with it (that was #542).
#   2. The step that starts them and the suite that runs the step both reap on
#      EXIT, INT, TERM and HUP. EXIT alone does not fire when a shell is killed
#      by a signal it has not trapped.
#   3. Every observer is bound to the pid it watches AND to the suite process,
#      and exits by itself when either is gone. This is the layer that survives
#      SIGKILL, which runs no trap anywhere.
#   4. The next run reports what it finds with ppid 1 rather than killing it.
#      A parentless `nettop` may belong to another session on a shared machine,
#      and a sweep that kills quietly is how one session's tidiness becomes
#      another session's missing evidence.

# Where the pids live. Lazy, so this file can be sourced before WORK exists.
_observers_file() { printf '%s' "${OBSERVERS_FILE:-${WORK:-.}/observers}"; }

# The suite process itself. Set by release_suite.sh; `$$` is the fallback, and
# inside a `( ... )` step subshell bash still reports the parent shell there,
# which is the pid an observer has to outlive nothing of.
observer_owner_pid() { printf '%s' "${SUITE_PID:-$$}"; }

observer_record() { # observer_record <pid> <kind>
  local f
  [ -n "${1:-}" ] || return 0
  f="$(_observers_file)"
  mkdir -p "$(dirname "${f}")" 2>/dev/null || true
  printf '%s\t%s\n' "$1" "${2:-observer}" >> "${f}"
}

# Every recorded pid and every process still hanging off one, children first.
#
# Children first because `script` holds a pty: killing the wrapper alone can
# leave what it wrapped attached to a terminal nothing reads any more, which is
# the shape the orphans on 15-09 had.
_observer_tree() { # _observer_tree <pid>
  local kid
  for kid in $(pgrep -P "$1" 2>/dev/null); do _observer_tree "${kid}"; done
  printf '%s\n' "$1"
}

_observer_pids() {
  local f pid kind
  f="$(_observers_file)"
  [ -f "${f}" ] || return 0
  while IFS="$(printf '\t')" read -r pid kind; do
    [ -n "${pid}" ] || continue
    _observer_tree "${pid}"
  done < "${f}"
}

# Is any of these pids still running? One `ps` for the lot, parsed in the shell.
#
# Asked twenty times inside a trap, so what it costs matters: a version that
# asked `ps` and `pgrep` per pid per turn started about a hundred and sixty
# processes to wait for four, and on a machine running a full test suite it
# took longer to find out than the observers took to die.
_observer_any_alive_of() { # _observer_any_alive_of <comma-separated pids>
  local out line
  [ -n "${1:-}" ] || return 1
  # States only: the question is whether ANY of them is still there, so which
  # one it is costs a column nothing here reads.
  out="$(ps -o state= -p "$1" 2>/dev/null)" || return 1
  [ -n "${out}" ] || return 1
  while IFS= read -r line; do
    line="${line// /}"
    [ -n "${line}" ] || continue
    # A zombie is not something still watching. Reading one as alive is how a
    # reaper waits out its whole grace period for a process that is already
    # over, every single time.
    case "${line}" in Z*) continue ;; esac
    return 0
  done <<EOF
${out}
EOF
  return 1
}

# Stop every observer this run started, and forget them.
#
# Polite first, then not. TERM lets the pty wrapper run its own trap and take
# what it wrapped down with it; the KILL pass is for whatever did not take the
# hint, because this function is the last place anything gets to be polite.
observer_reap() {
  local f pids csv pid left=20
  f="$(_observers_file)"
  [ -f "${f}" ] || return 0
  # Walked once. After the first TERM the tree is changing under the walk
  # anyway, and the pids that were in it are the pids that have to end.
  pids="$(_observer_pids)"
  [ -n "${pids}" ] || { : > "${f}"; return 0; }
  csv=""
  for pid in ${pids}; do csv="${csv}${csv:+,}${pid}"; kill -TERM "${pid}" 2>/dev/null || true; done
  while [ "${left}" -gt 0 ]; do
    _observer_any_alive_of "${csv}" || break
    /bin/sleep 0.05
    left=$((left - 1))
  done
  for pid in ${pids}; do kill -KILL "${pid}" 2>/dev/null || true; done
  : > "${f}"
}

# Reap on every way out of this shell, not only the orderly one.
#
# Each signal handler re-raises after reaping so the shell still dies of what
# killed it; a trap that swallows the signal turns Ctrl-C into a run that
# carries on.
observer_traps_install() {
  trap 'observer_reap' EXIT
  trap 'observer_reap; trap - INT; kill -INT $$' INT
  trap 'observer_reap; trap - TERM; kill -TERM $$' TERM
  trap 'observer_reap; trap - HUP; kill -HUP $$' HUP
}

OBSERVER_LAST_PID=""

# The `lsof` sampler: one sample per half second for as long as the launch
# lasts, addresses and nothing else (`-F n` prints no user name and no command,
# so there is nothing about this machine for a report to have to filter out).
#
# The loop condition is the binding. It is not an optimisation: a run killed
# outright runs no trap anywhere, and this test is then the only thing left
# that knows the sampler should stop.
observer_sampler_start() { # observer_sampler_start <app_pid> <out_file>
  local pid="$1" out="$2" owner
  OBSERVER_LAST_PID=""
  [ -n "${pid}" ] || return 0
  owner="$(observer_owner_pid)"
  if ! command -v lsof >/dev/null 2>&1; then
    printf 'SKIPPED (not a pass): lsof is not on this machine, so the sockets of the launch were not sampled\n' >> "${out}"
    return 0
  fi
  (
    n=0
    while kill -0 "${pid}" 2>/dev/null && kill -0 "${owner}" 2>/dev/null; do
      n=$((n + 1))
      printf -- '--- sample %s ---\n' "${n}"
      lsof -nP -i -a -p "${pid}" -F n 2>/dev/null
      /bin/sleep 0.5
    done
  ) >> "${out}" 2>/dev/null &
  OBSERVER_LAST_PID=$!
  observer_record "${OBSERVER_LAST_PID}" sampler
}

# `script` comes in two dialects and they disagree about where the command
# goes: BSD takes it as arguments after the typescript file, util-linux takes
# it after -c. Asked of the tool rather than of `uname`, because the tool is
# what has to accept the line.
_observer_script_is_bsd() {
  script --version 2>&1 | grep -qi 'util-linux' && return 1
  return 0
}

# Start a long-running watcher under a pty, wrapped so it cannot outlive what
# it watches.
#
# The pty is not decoration. With its output redirected to a file `nettop` is
# fully buffered and the buffer dies with the process, so three seconds of
# continuous logging landed exactly zero bytes on disk. A pty makes it
# line-buffered. It also adds a process between the suite and the watcher,
# which is precisely how the watcher used to survive: kill the wrapper and the
# watcher is reparented to init, still running, still sampling, invisible.
observer_pty_start() { # observer_pty_start <out_file> <app_pid> <command...>
  local out="$1" pid="$2" owner wrapper
  shift 2
  OBSERVER_LAST_PID=""
  owner="$(observer_owner_pid)"
  wrapper="${SUITE_DIR:-$(dirname "${BASH_SOURCE[0]}")}/observer_pty.sh"
  if ! command -v script >/dev/null 2>&1; then
    printf 'SKIPPED (not a pass): script is not on this machine, so no pty was available and the continuous watcher did not run\n' >> "${out}"
    return 0
  fi
  # The wrapper writes its own pid and the pid of what it wrapped into the
  # same file, so "every observer pid is kept" holds for the two processes this
  # shell never learns the pid of.
  export OBSERVERS_FILE="$(_observers_file)"
  _observer_spawn_script "${out}" "${wrapper}" "${pid}" "${owner}" "$@"
  observer_record "${OBSERVER_LAST_PID}" pty
}

_observer_spawn_script() { # <out_file> <wrapper> <app_pid> <owner_pid> <command...>
  local out="$1"; shift
  if _observer_script_is_bsd; then
    script -q /dev/null "$@" >> "${out}" 2>/dev/null &
  else
    # util-linux runs the string through a shell, so every word is quoted here
    # rather than trusted to survive one.
    local line; line="$(printf '%q ' "$@")"
    script -q -e -c "${line}" /dev/null >> "${out}" 2>/dev/null &
  fi
  OBSERVER_LAST_PID=$!
}

# `nettop` exists only on macOS. Where it does not, the source is named as
# skipped instead of quietly absent: a launch watched by one sampler covers
# less than a launch watched by two, and the difference has to be readable in
# the evidence rather than inferred from its length.
observer_nettop_start() { # observer_nettop_start <app_pid> <out_file>
  local pid="$1" out="$2"
  OBSERVER_LAST_PID=""
  [ -n "${pid}" ] || return 0
  if ! command -v nettop >/dev/null 2>&1; then
    printf 'SKIPPED (not a pass): nettop is not on this platform, so the continuous source did not run and only the lsof samples cover this launch\n' >> "${out}"
    return 0
  fi
  observer_pty_start "${out}" "${pid}" nettop -n -L 0 -p "${pid}"
}

# ── What an earlier run left behind ──────────────────────────────────────────
#
# Reads `ps` lines on stdin -- pid, ppid, elapsed time, command -- and writes a
# line for each watcher whose parent is init. Split from the `ps` call on
# purpose: what a listing means is then testable on a machine that has neither
# of these tools running, which is every machine in CI.
observer_orphan_scan() {
  awk '
    $2 == 1 {
      comm = $4
      sub(/.*\//, "", comm)
      if (comm != "nettop" && comm != "lsof") next
      printf "orphan observer: %s pid %s, age %s, parent 1 — left by an earlier run; reported, not killed\n", comm, $1, $3
    }
  '
}

# The sweep at the start of S3. It reports; it never kills.
observer_orphan_report() { # observer_orphan_report [out_file]
  local out="${1:-}" line found=0 listing
  command -v ps >/dev/null 2>&1 || return 0
  listing="$(ps -axo pid=,ppid=,etime=,comm= 2>/dev/null | observer_orphan_scan)"
  while IFS= read -r line; do
    [ -n "${line}" ] || continue
    found=$((found + 1))
    echo "${line}" >&2
    [ -n "${out}" ] && printf '%s\n' "${line}" >> "${out}"
  done <<EOF
${listing}
EOF
  line="orphan observer sweep: ${found} parentless watcher(s) from earlier runs"
  echo "${line}" >&2
  [ -n "${out}" ] && printf '%s\n' "${line}" >> "${out}"
  return 0
}
