# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S4 — updater artefacts. A latest.json that names a payload nobody verified is
# the one thing the feed must never say.
#
# Both rows are judged even when no probe ran: with --expect-updater a missing
# updater artefact is a SKIPPED (the run measured less than a release needs),
# and without it the row is NOT_APPLICABLE, so a deliberate direct-download
# build is a clean pass that still says on the record why.

step_s4() {
  driver_s4_probes 2>/dev/null || true
  judge "updater:sigs,updater:payload"
}
