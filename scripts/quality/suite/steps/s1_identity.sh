# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S1 — artefact identity and signature chain. What the bytes are, who signed
# them, and whether the operating system agrees.

step_s1() {
  driver_s1_probes 2>/dev/null || true
  local checks; checks="$(driver_s1_checks)"
  [ -n "${checks}" ] || { skip_row S1 identity artefact "this driver produced no identity probes"; return 0; }
  judge "${checks}"
}
