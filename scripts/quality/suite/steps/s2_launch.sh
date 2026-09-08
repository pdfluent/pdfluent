# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S2 — launch the real binary, open a golden document, quit it cleanly.
#
# The suite asserts what the binary writes about itself (the parse mark, the
# session pair, the exit line) plus process liveness. It does not assert pixels:
# claiming to have seen a window it never looked at is the failure this suite
# was written against.

step_s2() {
  local doc checks docs=""
  while IFS= read -r doc; do [ -n "${doc}" ] && docs="${docs} ${doc}"; done <<< "$(driver_documents)"
  if [ -z "${docs// /}" ]; then
    skip_row S2 launch open "the application was not started, so nothing was opened or quit"
    return 0
  fi
  local open_checks=""
  for doc in ${docs}; do
    driver_open_document "${doc}" || true
    open_checks="${open_checks}${open_checks:+,}open:${doc}"
  done
  judge "${open_checks}"
  checks="$(driver_s2_checks)"
  [ -n "${checks}" ] && judge "${checks}"
  return 0
}
