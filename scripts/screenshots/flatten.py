# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Flatten a PNG to opaque RGB and check its size. Apple refuses screenshots
# with an alpha channel; the browser that draws the frames writes RGBA.
#
# usage: flatten.py <in.png> <out.png> <width> <height> <keep-alpha:0|1>
import sys

from PIL import Image

src, dst, w, h, keep = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5] == "1"
img = Image.open(src)
if img.size != (w, h):
    sys.exit(f"{src} is {img.size[0]}x{img.size[1]}, expected {w}x{h}")
if not keep:
    bg = Image.new("RGB", img.size, (255, 255, 255))
    bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[3])
    img = bg
img.save(dst, "PNG", optimize=True)
print(f"{dst} {w}x{h} {img.mode}")
