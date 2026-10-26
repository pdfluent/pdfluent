#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Start or stop the macOS editor runner (mac-editor) on this Mac.
#
#   scripts/runner/mac-editor/runner-ctl.sh start   # starts it, then waits for GitHub to say online
#   scripts/runner/mac-editor/runner-ctl.sh stop    # SIGTERM to the listener; refuses while a job runs
#
# start has to give the runner the mktemp shim first on PATH and TMPDIR on the
# build volume: started from a plain shell, the storage guard refused both Mac
# jobs within 30 s (21-10). It fails loudly (exit 1, log tails) when GitHub does
# not show the runner online within 5 minutes.
set -u

# Everything the runner starts inherits the architecture of the shell that starts it.
# `#!/usr/bin/env bash` can resolve to an Intel Homebrew bash, and then the runner's
# node and uname report x86_64: on 22-10 every journey of macos-arm64 was SKIPPED
# ("runs on macos-arm64, windows-x64 only") and the OCR component was built for
# x86_64. So: arm64 or nothing.
if [ "$(uname -m)" != arm64 ]; then
  if [ -x /usr/bin/arch ] && [ "${EDITOR_MAC_CTL_REEXEC:-}" != 1 ]; then
    EDITOR_MAC_CTL_REEXEC=1 exec /usr/bin/arch -arm64 /bin/bash "$0" "$@"
  fi
  echo "FAIL: this shell is $(uname -m), not arm64; the runner would run translated." >&2; exit 1
fi
DIR="${EDITOR_MAC_RUNNER_DIR:-/Volumes/PDFluent-Builds/PDFluent/builds/actions-runner-editor-mac}"
SHIM="$HOME/actions-runner-pdfluent-editor-mac/shim"
TMP_ROOT="${EDITOR_MAC_TMPDIR:-/Volumes/PDFluent-Builds/PDFluent/tmp/mac-editor}"
REPO="pdfluent/pdfluent-internal"
NAME="mac-editor"

listener() { pgrep -f "$DIR/bin/Runner.Listener" | head -1; }
worker()   { pgrep -f "$DIR/bin/Runner.Worker" | head -1; }
status()   { gh api "repos/$REPO/actions/runners" --jq ".runners[]|select(.name==\"$NAME\")|.status" 2>/dev/null; }

case "${1:-}" in
  start)
    [ -n "$(listener)" ] && { echo "REFUSED: the editor listener already runs (pid $(listener)); stop it first." >&2; exit 1; }
    [ -d "$SHIM" ] || { echo "FAIL: the shim directory $SHIM is missing." >&2; exit 1; }
    mkdir -p "$TMP_ROOT"
    # Own session and process group, parent gone: a runner left in the caller's group
    # dies with it. Started from a CI-watcher shell on 22-10, the listener was killed
    # twice (02:53 and 03:04) when that watcher ended, and the queued jobs waited.
    ( cd "$DIR" && PATH="$SHIM:$PATH" TMPDIR="$TMP_ROOT" nohup /usr/bin/perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' /usr/bin/arch -arm64 /bin/bash ./run.sh >> runner-restart.log 2>&1 & )
    until=$((SECONDS + 300))
    while [ $SECONDS -lt $until ]; do
      if [ "$(status)" = online ]; then
        # Check that what the runner will start is arm64: the shell it started in is.
        mine="$(ps -o pgid= -p $$ | tr -d ' ')"; theirs="$(ps -o pgid= -p "$(listener)" | tr -d ' ')"
        if [ -n "$theirs" ] && [ "$theirs" = "$mine" ]; then
          echo "FAIL: the listener shares this shell's process group ($mine); it dies with it." >&2; exit 1
        fi
        echo "$NAME is online (listener $(listener), own process group $theirs, started from an $(uname -m) shell)."; exit 0
      fi
      sleep 10
    done
    echo "FAIL: $NAME is not online at GitHub after 5 minutes. Tails of its logs:" >&2
    tail -15 "$DIR/runner-restart.log" >&2
    f="$(ls -t "$DIR"/_diag/Runner_*.log 2>/dev/null | head -1)"; [ -n "$f" ] && tail -15 "$f" | cut -c1-220 >&2
    exit 1 ;;
  stop)
    [ -z "$(listener)" ] && { echo "$NAME is not running."; exit 0; }
    [ -n "$(worker)" ] && { echo "REFUSED: an editor job is running (worker $(worker))." >&2; exit 1; }
    kill -TERM "$(listener)"
    until=$((SECONDS + 60))
    while [ $SECONDS -lt $until ]; do [ -z "$(listener)" ] && { echo "$NAME stopped."; exit 0; }; sleep 2; done
    echo "The listener did not exit within 60 s; it is left running." >&2; exit 2 ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
