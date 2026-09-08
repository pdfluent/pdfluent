# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S5 — walk the artefact through every control docs/UI_REGISTER.md offers.
#
# The register says what the interface offers and what activating it reaches;
# until this step, nothing compared that to the thing people install. The driver
# does the walking and writes one JSON probe; ui_walk.mjs turns it into a row
# per registered control at the flush, so a control the walk never touched
# leaves a SKIPPED row rather than no row at all.

step_s5() {
  if command -v driver_ui_walk >/dev/null 2>&1; then
    driver_ui_walk || true
  fi
  # One queue line, expanded by the judge: the control list lives in the
  # register, and the flush is already the interpreter that has to read it.
  printf 'W\t%s\t%s\n' "$(_flat "${REPO_ROOT}")" "$(_flat "${UI_WALK_GAP:-}")" >> "${QUEUE}"
  return 0
}
