#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Release-time half of the offline gate: start the built application under a
# sandbox profile that denies outbound network access, and fail if it cannot
# work. The static gate (scripts/ci/offline-allowlist.mjs) proves that no
# undeclared address ships; this proves the declared ones are not needed.
#
# macOS only, and it needs a built .app -- which is a release build, an hour of
# a machine that is shared with the engine's gates. So it is not a push gate.
# When it cannot run it says SKIPPED (not a pass) and exits 3, never 0. A check
# that reports success when it did nothing is the failure mode this repository
# has been bitten by three times, and an exit status is what a caller reads.
#
# Exit codes: 0 the app worked with no network, 1 it did not, 3 nothing to run
# against.
#
# usage: bash scripts/quality/offline-runtime-check.sh [path/to/PDFluent.app]

set -uo pipefail

skip() { echo "SKIPPED (not a pass): $*" >&2; exit 3; }

fail() {
  echo "OFFLINE-RUNTIME: $1" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || skip "sandbox-exec is macOS-only; this host is $(uname -s)"
command -v sandbox-exec >/dev/null 2>&1 || skip "sandbox-exec is not available on this host"

APP="${1:-src-tauri/target/release/bundle/macos/PDFluent.app}"
BIN="$APP/Contents/MacOS/pdfluent-desktop"
[ -x "$BIN" ] || skip "no built application at $BIN (run: npm run tauri build)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PROFILE="$WORK/deny-network.sb"
LOG="$WORK/run.log"

# allow default / deny network*: everything the app does locally is permitted,
# every outbound connection is refused. If the app needs the network to open a
# document, it dies here -- which is the whole point.
cat > "$PROFILE" <<'PROFILE'
(version 1)
(allow default)
(deny network-outbound)
(deny network-inbound)
PROFILE

echo "OFFLINE-RUNTIME: starting $BIN with outbound network denied"
sandbox-exec -f "$PROFILE" "$BIN" > "$LOG" 2>&1 &
PID=$!

# 20 seconds is past the 5-second startup update check, so a build that ignores
# the setting has had its chance to try.
for _ in $(seq 1 20); do
  sleep 1
  kill -0 "$PID" 2>/dev/null || break
done

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  STILL_RUNNING=yes
else
  wait "$PID"
  EXIT_CODE=$?
  STILL_RUNNING=no
fi

echo "--- app output ---"
cat "$LOG"
echo "------------------"

if [ "$STILL_RUNNING" = "no" ] && [ "${EXIT_CODE:-0}" -ne 0 ]; then
  fail "the app exited with $EXIT_CODE while the network was denied; it should not need one"
fi

# A refused connection surfaces in the app's own log as an operation-not-
# permitted error. Any of these means something tried to reach the network on a
# plain start, which the product promises it does not do.
if grep -Eiq 'operation not permitted \(os error 1\)|network is unreachable|failed to lookup address|no route to host' "$LOG"; then
  fail "the app attempted an outbound connection on startup (see output above)"
fi

echo "OFFLINE-RUNTIME: the app started and stayed up with no network."
