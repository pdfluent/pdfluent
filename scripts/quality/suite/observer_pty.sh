#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# observer_pty.sh — run a watcher under a pty and make sure it dies first.
#
#   observer_pty.sh <app_pid> <owner_pid> <command> [args...]
#
# This sits between `script` and the watcher it wraps. Without it there is
# nothing between them: kill `script` and the watcher is reparented to init,
# still running, still sampling, and nothing left on the machine knows which
# run started it. That is what filled a shared Mac twice on 15-09.
#
# Two things stop it, and they cover different ends:
#
#   the traps  — an orderly end (the suite finished the launch, or was asked to
#                stop) takes the watcher down within the same breath;
#   the poll   — SIGKILL runs no trap, so the loop below asks instead: is the
#                launch still there, and is the suite that wanted this watching
#                still there. Either answer of no ends the watch.
#
# <app_pid> may be 0 for a watcher bound to the suite only.
set -u

APP_PID="${1:-0}"
OWNER_PID="${2:-0}"
shift 2 2>/dev/null || true

CHILD=""

# Which of these pids are running and not zombies, in ONE `ps`.
#
# The loop below asks five times a second for the whole length of a launch, so
# a call per pid is three process starts a turn on a machine that is also
# building and testing. A zombie counts as gone: the wrapper waits for its own
# child only after the loop, so a child read as alive because nobody has
# reaped it yet is a loop that never ends.
ALIVE=""
_refresh_alive() { # _refresh_alive <comma-separated pids>
  local out line
  ALIVE=""
  out="$(ps -o pid=,state= -p "$1" 2>/dev/null)" || return 0
  while IFS= read -r line; do
    # Unquoted on purpose: word splitting drops the padding `ps` puts in front
    # of a pid, which no parameter expansion does in one step.
    # shellcheck disable=SC2086
    set -- ${line}
    [ $# -ge 2 ] || continue
    case "$2" in Z*) continue ;; esac
    ALIVE="${ALIVE} $1"
  done <<EOF
${out}
EOF
}

_alive() { # _alive <pid> -- against the last _refresh_alive
  [ -n "${1:-}" ] && [ "${1}" != "0" ] || return 1
  case " ${ALIVE} " in *" $1 "*) return 0 ;; esac
  return 1
}

_reap() {
  [ -n "${CHILD}" ] || return 0
  kill -TERM "${CHILD}" 2>/dev/null || true
  local left=20
  while [ "${left}" -gt 0 ]; do
    _refresh_alive "${CHILD}"
    _alive "${CHILD}" || break
    /bin/sleep 0.05; left=$((left - 1))
  done
  kill -KILL "${CHILD}" 2>/dev/null || true
}

# EXIT covers the ordinary return. The three signals are here because the
# suite's own reaper sends TERM, and a TERM that kills only this wrapper is
# exactly how the watcher used to escape: the signal handler has to reach the
# child before this process stops existing.
trap '_reap' EXIT
trap '_reap; trap - INT; kill -INT $$' INT
trap '_reap; trap - TERM; trap - EXIT; exit 143' TERM
trap '_reap; trap - HUP; trap - EXIT; exit 129' HUP

[ $# -gt 0 ] || exit 2
"$@" &
CHILD=$!

# Both pids are written down where the suite can read them back, so a case can
# assert on the whole chain rather than on the one end of it that the shell
# which spawned `script` happened to learn.
if [ -n "${OBSERVERS_FILE:-}" ]; then
  printf '%s\twrapper\n%s\twatcher\n' "$$" "${CHILD}" >> "${OBSERVERS_FILE}" 2>/dev/null || true
fi

WATCH="${CHILD}"
[ "${APP_PID}" = "0" ] || WATCH="${WATCH},${APP_PID}"
[ "${OWNER_PID}" = "0" ] || WATCH="${WATCH},${OWNER_PID}"

while :; do
  _refresh_alive "${WATCH}"
  _alive "${CHILD}" || break
  [ "${APP_PID}" = "0" ] || _alive "${APP_PID}" || break
  [ "${OWNER_PID}" = "0" ] || _alive "${OWNER_PID}" || break
  /bin/sleep 0.2
done

_reap
wait "${CHILD}" 2>/dev/null || true
