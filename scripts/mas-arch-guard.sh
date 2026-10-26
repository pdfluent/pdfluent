# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# mas-arch-guard.sh — sourced by build-mas.sh and mas-preflight.sh. Refuses to
# run in a shell that executes under Rosetta on Apple Silicon.
#
# Why. A translated shell makes every child inherit x86_64: node loads the x64
# native binding of @tauri-apps/cli, which is not installed, and the build dies
# after the build number is spent (and the gate on 21-10 died the same way).
# The usual cause is /usr/local/bin/bash, which is Intel-only and comes first
# in PATH. /bin/bash is universal.
#
# Test overrides (never set them for a real build):
#   MAS_GUARD_UNAME_S, MAS_GUARD_UNAME_M, MAS_GUARD_TRANSLATED
if [ "${MAS_GUARD_UNAME_S:-$(uname -s)}" = "Darwin" ]; then
  _mas_m="${MAS_GUARD_UNAME_M:-$(uname -m)}"
  _mas_t="${MAS_GUARD_TRANSLATED:-$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)}"
  if [ "${_mas_m}" != "arm64" ] || [ "${_mas_t}" = "1" ]; then
    echo "✘ This shell runs as ${_mas_m}$([ "${_mas_t}" = "1" ] && echo ' under Rosetta'). The store build needs a native arm64 shell:" >&2
    echo "  arch -arm64 /bin/bash $0" >&2
    echo "  (PATH 'bash' is often /usr/local/bin/bash, which is Intel-only; use /bin/bash.)" >&2
    exit 1
  fi
  unset _mas_m _mas_t
fi
