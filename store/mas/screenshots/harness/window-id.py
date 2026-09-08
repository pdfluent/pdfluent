# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Print the CGWindowID of an app's largest on-screen window.
#
# `screencapture -R <region>` photographs a rectangle of the screen, so anything
# floating over the app — a notification banner, another process's keychain
# prompt — lands in the picture. `screencapture -l <windowid>` photographs the
# window itself and leaves whatever is above it out. That needs a window id, and
# no shell command hands one out.
#
# usage: window-id.py <owner name>       e.g. window-id.py PDFluent

import sys

from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGNullWindowID,
    kCGWindowListOptionOnScreenOnly,
)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: window-id.py <owner name>", file=sys.stderr)
        return 2
    owner = sys.argv[1]
    best = None
    for window in CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID):
        if window.get("kCGWindowOwnerName") != owner:
            continue
        bounds = window.get("kCGWindowBounds", {})
        area = bounds.get("Width", 0) * bounds.get("Height", 0)
        if best is None or area > best[1]:
            best = (window["kCGWindowNumber"], area)
    if best is None:
        print(f"no on-screen window owned by {owner!r}", file=sys.stderr)
        return 1
    print(best[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
