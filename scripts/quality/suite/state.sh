# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# State that has to outlive a step.
#
# Every step runs in its own subshell so that a step which dies takes its own
# rows with it rather than the run. That also means a shell variable set in one
# step is gone by the next, and the macOS driver kept the path of the
# application it had just found in exactly such a variable: S2 read it back
# empty and skipped with "the application was not started", S3 skipped its
# offline run for the same reason, and the report said INCOMPLETE without
# saying why. On macOS neither step had ever run (#542).
#
# The probes crossed that boundary from the first day because they are files.
# So does this. It is deliberately not an `export`: a variable exported in a
# subshell does not reach the parent either, and the next person to reach for
# one would land in the same place.
suite_state_set() { # suite_state_set <key> <value>
  mkdir -p "${WORK}/state"
  printf '%s' "$2" > "${WORK}/state/$1"
}

# Empty for a key no step has written, so a caller can tell "not found yet"
# apart from a value without a second existence check.
suite_state_get() { # suite_state_get <key>
  cat "${WORK}/state/$1" 2>/dev/null || true
}
