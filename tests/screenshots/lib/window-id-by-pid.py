# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Print the CGWindowID of the largest on-screen window of process <pid>.
# store/mas/screenshots/harness/window-id.py does the same by owner name; the
# e2e build is an unbundled binary whose owner name is not the product name,
# so the screenshot suite asks by process id, which it already has.
#
# usage: window-id-by-pid.py <pid>
import sys

from Quartz import CGWindowListCopyWindowInfo, kCGNullWindowID, kCGWindowListOptionOnScreenOnly

pid = int(sys.argv[1])
best = None
for w in CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID):
    if w.get("kCGWindowOwnerPID") != pid or w.get("kCGWindowLayer", 0) != 0:
        continue
    b = w.get("kCGWindowBounds", {})
    area = b.get("Width", 0) * b.get("Height", 0)
    if best is None or area > best[1]:
        best = (w["kCGWindowNumber"], area)
if best is None:
    print(f"no on-screen window for pid {pid}", file=sys.stderr)
    sys.exit(1)
print(best[0])
