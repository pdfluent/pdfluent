# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Click once at a point in screen coordinates.
#
# System Events' own `click at {x, y}` reports success and does nothing often
# enough that a screenshot run silently produced two identical scenes. A posted
# CGEvent is the click the window server actually delivers.
#
# usage: click-at.py <x> <y>

import sys
import time

from Quartz import (
    CGEventCreateMouseEvent,
    CGEventPost,
    kCGEventLeftMouseDown,
    kCGEventLeftMouseUp,
    kCGEventMouseMoved,
    kCGHIDEventTap,
    kCGMouseButtonLeft,
)


def post(kind, point, button=kCGMouseButtonLeft):
    CGEventPost(kCGHIDEventTap, CGEventCreateMouseEvent(None, kind, point, button))


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: click-at.py <x> <y>", file=sys.stderr)
        return 2
    point = (float(sys.argv[1]), float(sys.argv[2]))
    post(kCGEventMouseMoved, point)
    time.sleep(0.2)
    post(kCGEventLeftMouseDown, point)
    time.sleep(0.08)
    post(kCGEventLeftMouseUp, point)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
