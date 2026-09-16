# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S3 — offline. The app is promised to work with no network; this is where that
# promise is either kept or named as unmeasured.

step_s3() {
  # What an earlier run left behind, before this one adds anything of its own.
  #
  # Reported, never killed. A parentless `nettop` on a shared machine may
  # belong to a run that is still going in another session, and a sweep that
  # kills quietly is how one session's tidiness becomes another session's
  # missing evidence. The pid and the age are on the line so the person reading
  # the log can tell which it is.
  observer_orphan_report "${WORK}/probes/observer_orphans.out" || true

  driver_s3_probes 2>/dev/null || true
  local checks; checks="$(driver_s3_checks)"
  if [ -z "${checks}" ]; then
    skip_row S3 offline offline "no network-denying sandbox was available to the suite on this platform"
    return 0
  fi
  judge "${checks}"
}
