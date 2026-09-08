#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Print the startup and edit timeline the running app wrote to its own log.
#
# The app records `perf <name> +<ms>ms` lines from the first statement of
# run() onwards (src-tauri/src/perf.rs). This script only reads them, so it
# does not launch anything and can be pointed at a log a user sent in.
#
# Usage:
#   scripts/perf/read-startup-timeline.sh                 # newest session in the default log
#   scripts/perf/read-startup-timeline.sh --log <path>    # a log from elsewhere
#   scripts/perf/read-startup-timeline.sh --all           # every session in the file
#
# What it cannot tell you: the time before `starting` — dyld, LaunchServices,
# the sandbox container spin-up. That gap is only visible from the wall clock
# of whatever launched the app; `scripts/quality/suite/drivers/macos.sh`
# records it as the S2 launch probe.

set -euo pipefail

LOG=""
ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --log) LOG="${2:-}"; shift 2 ;;
    --all) ALL=1; shift ;;
    -h|--help) sed -n '9,24p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${LOG}" ]; then
  case "$(uname -s)" in
    Darwin)
      # The shipped build is sandboxed, so its home directory is the container.
      for candidate in \
        "${HOME}/Library/Containers/com.pdfluent.app/Data/Library/Logs/com.pdfluent.app/PDFluent.log" \
        "${HOME}/Library/Logs/com.pdfluent.app/PDFluent.log"; do
        [ -f "${candidate}" ] && LOG="${candidate}" && break
      done
      ;;
    *)
      LOG="${LOCALAPPDATA:-${HOME}/.local/share}/com.pdfluent.app/logs/PDFluent.log"
      ;;
  esac
fi

if [ ! -f "${LOG}" ]; then
  echo "SKIPPED (not a pass): no app log at ${LOG} — run the app once, or pass --log <path>." >&2
  exit 1
fi

echo "log: ${LOG}"

# One session per `perf starting` line. Without --all only the last one is
# printed: a log accumulates every launch, and the first session in the file is
# almost never the one being asked about.
awk -v all="${ALL}" '
  /perf starting \+/ { session++ }
  session > 0 { lines[session] = lines[session] $0 "\n" }
  END {
    if (session == 0) {
      print "SKIPPED (not a pass): the log has no perf marks. This build predates them, or the app has not started since." > "/dev/stderr"
      exit 1
    }
    start = (all == 1) ? 1 : session
    for (s = start; s <= session; s++) {
      printf "\n--- session %d of %d ---\n", s, session
      printf "%s", lines[s]
    }
  }
' "${LOG}" | sed -n 's/.*perf \([a-z_]*\) +\([0-9]*\)ms\(.*\)/  \1\t+\2 ms\3/p;/--- session/p;/^log:/p'
