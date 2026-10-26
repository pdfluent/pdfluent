#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Start or stop the Windows editor runner from the Mac, and check the result.
#
#   scripts/runner/windows-editor/runner-ctl.sh start   # starts, then waits for GitHub to say online
#   scripts/runner/windows-editor/runner-ctl.sh stop    # Ctrl+C to the listener; never a kill
#
# start fails loudly (exit 1, tail of the runner's diag log) when GitHub does not
# show the runner online within 5 minutes: a runner that says "Listening" in its
# own log while GitHub shows it offline is a stale session (HTTP 409), and
# looping restarts only makes more of them.
set -u
HOST="${EDITOR_WINDOWS_HOST:?set EDITOR_WINDOWS_HOST=user@host of the Windows desktop (address: INFRASTRUCTURE.md in the private notes, never in this repo)}"
REPO="pdfluent/pdfluent-internal"
NAME="windows-editor"
here="$(cd "$(dirname "$0")" && pwd)"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=20)

run_ps() { scp -q "${ssh_opts[@]}" "$here/$1" "$HOST:C:/Users/Gebruiker/$1" && ssh "${ssh_opts[@]}" "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\Gebruiker\\$1" 2>&1 | grep -v '^\*\*'; return "${PIPESTATUS[0]}"; }
status() { gh api "repos/$REPO/actions/runners" --jq ".runners[]|select(.name==\"$NAME\")|.status" 2>/dev/null; }
diag_tail() { ssh "${ssh_opts[@]}" "$HOST" 'powershell -NoProfile -Command "$l = Get-ChildItem E:\actions-runner-pdfluent-editor\_diag\Runner_*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1; $l.FullName; Get-Content $l.FullName -Tail 25"' 2>&1 | grep -v '^\*\*' | cut -c1-220; }

case "${1:-}" in
  start)
    run_ps start-runner.ps1 || { echo "start-runner.ps1 failed"; exit 1; }
    until=$((SECONDS + 300))
    while [ $SECONDS -lt $until ]; do
      [ "$(status)" = online ] && { echo "$NAME is online."; exit 0; }
      sleep 10
    done
    echo "FAIL: $NAME is not online at GitHub after 5 minutes. Tail of the runner's diag log:" >&2
    diag_tail >&2
    exit 1 ;;
  stop)
    run_ps stop-runner.ps1 ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
