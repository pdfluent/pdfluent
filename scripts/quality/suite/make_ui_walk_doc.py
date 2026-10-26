#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Build src-tauri/tests/fixtures/ui-walk-doc.pdf, the document the S5 UI walk opens.

The golden three-page sample plus the two things some controls can only act on:
a text box (a /FreeText annotation) and a placed image (a /Stamp named Image, the
shape src-tauri/src/annot_write.rs writes), both on page one. The walk selects
them before it presses "Replace image" or "Edit text box".

    python3 scripts/quality/suite/make_ui_walk_doc.py

Deterministic: no clock, no random ids (the output is checked in, and
tests/ui-walk-document.test.ts reads it back).
"""
import pathlib
import pikepdf
from pikepdf import Array, Dictionary, Name, Pdf, String

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "src-tauri/tests/golden/fixture-sample-text-3p.pdf"
OUT = ROOT / "src-tauri/tests/fixtures/ui-walk-doc.pdf"

def main() -> None:
    pdf = Pdf.open(SRC)
    page = pdf.pages[0]

    # The text box: a visible FreeText with an appearance stream.
    rect = [72, 640, 300, 700]
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    ap_text = pdf.make_stream(b"BT /F1 12 Tf 0 g 4 40 Td (UI walk text box) Tj ET")
    ap_text.Type = Name.XObject
    ap_text.Subtype = Name.Form
    ap_text.BBox = Array([0, 0, rect[2] - rect[0], rect[3] - rect[1]])
    ap_text.Resources = Dictionary(Font=Dictionary(F1=font))
    freetext = pdf.make_indirect(Dictionary(
        Type=Name.Annot, Subtype=Name.FreeText, Rect=Array(rect), F=4,
        Contents=String("UI walk text box"), DA=String("/Helv 12 Tf 0 g"),
        AP=Dictionary(N=ap_text),
    ))

    # The image: a Stamp named Image whose appearance draws the picture.
    image = pdf.make_stream(bytes([255, 0, 0] * 4))
    image.Type = Name.XObject
    image.Subtype = Name.Image
    image.Width = 2
    image.Height = 2
    image.ColorSpace = Name.DeviceRGB
    image.BitsPerComponent = 8
    irect = [320, 640, 400, 720]
    ap_img = pdf.make_stream(b"q 80 0 0 80 0 0 cm /Im0 Do Q")
    ap_img.Type = Name.XObject
    ap_img.Subtype = Name.Form
    ap_img.BBox = Array([0, 0, irect[2] - irect[0], irect[3] - irect[1]])
    ap_img.Resources = Dictionary(XObject=Dictionary(Im0=image))
    stamp = pdf.make_indirect(Dictionary(
        Type=Name.Annot, Subtype=Name.Stamp, Rect=Array(irect), F=4, Name=Name.Image,
        AP=Dictionary(N=ap_img),
    ))

    existing = page.get("/Annots")
    annots = Array(list(existing)) if existing is not None else Array()
    annots.append(freetext)
    annots.append(stamp)
    page.Annots = pdf.make_indirect(annots)
    pdf.save(OUT, deterministic_id=True, static_id=True, object_stream_mode=pikepdf.ObjectStreamMode.disable)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
