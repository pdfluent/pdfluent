#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
# Builds a numbered contact sheet from the six final 1920x1080 screenshots.
# Usage: python3 make-contact-sheet.py <final_dir> <out_png>
import sys, os
from PIL import Image, ImageDraw, ImageFont

ORDER = [
    ("01-welcome.png", "1  Welcome / open"),
    ("02-reading.png", "2  Reading view"),
    ("03-edit.png", "3  Inline text editing"),
    ("04-convert.png", "4  Convert / export"),
    ("05-tools.png", "5  All tools"),
    ("06-sign.png", "6  Signing / privacy"),
]

def main():
    final_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    out = sys.argv[2] if len(sys.argv) > 2 else "contact-sheet.png"
    cols, rows = 2, 3
    thumb_w, thumb_h = 760, 428          # 16:9 thumbnails
    pad, label_h, margin = 28, 38, 32
    cell_w, cell_h = thumb_w + pad * 2, thumb_h + label_h + pad
    W = margin * 2 + cell_w * cols
    H = margin * 2 + cell_h * rows
    sheet = Image.new("RGB", (W, H), "#0f1115")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    for i, (fname, label) in enumerate(ORDER):
        r, c = divmod(i, cols)
        x = margin + c * cell_w
        y = margin + r * cell_h
        path = os.path.join(final_dir, fname)
        if os.path.exists(path):
            im = Image.open(path).convert("RGB").resize((thumb_w, thumb_h))
            sheet.paste(im, (x + pad, y + pad))
            draw.rectangle([x + pad, y + pad, x + pad + thumb_w, y + pad + thumb_h], outline="#2b2f3a", width=1)
        else:
            draw.rectangle([x + pad, y + pad, x + pad + thumb_w, y + pad + thumb_h], outline="#5a2b2b", width=2)
            draw.text((x + pad + 16, y + pad + 16), f"MISSING: {fname}", fill="#d98", font=font)
        draw.text((x + pad, y + pad + thumb_h + 10), label, fill="#e6e8ee", font=font)
    sheet.save(out)
    print(f"contact sheet -> {out} ({W}x{H})")

if __name__ == "__main__":
    main()
