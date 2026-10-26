#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Build table_report.pdf: one page, a heading, a sentence and a ruled table.

The table has three columns (Item, Quantity, Price) and three data rows with
a full grid of ruling lines, which is what the structured extraction reads a
table from. It is the fixture of the "Tables to Excel" and "Markdown" export
journeys (J-98, J-99). Generated here, not copied from a third party.

    python3 src-tauri/tests/fixtures/make_table_report.py
"""
from pathlib import Path

ROWS = [
    ("Item", "Quantity", "Price"),
    ("Widget", "10", "2.50"),
    ("Gadget", "4", "12.00"),
    ("Gizmo", "7", "3.75"),
]
LEFT = 72
COL_X = [LEFT, LEFT + 180, LEFT + 300, LEFT + 420]
TOP = 600
ROW_H = 28

ops = ["BT /F1 18 Tf 72 720 Td (Quarterly stock report) Tj ET"]
ops.append("BT /F1 11 Tf 72 690 Td (The table below lists the items on hand at the end of the quarter.) Tj ET")
# Rulings are thin filled rectangles, the way producers draw them and the way
# the extraction's own end-to-end tests draw theirs.
ops.append("0 g")
bottom = TOP - ROW_H * len(ROWS)
for r in range(len(ROWS) + 1):
    y = TOP - ROW_H * r
    ops.append(f"{COL_X[0]} {y} {COL_X[-1] - COL_X[0]} 0.5 re f")
for x in COL_X:
    ops.append(f"{x} {bottom} 0.5 {TOP - bottom} re f")
for r, row in enumerate(ROWS):
    y = TOP - ROW_H * r - 19
    for c, text in enumerate(row):
        ops.append(f"BT /F1 12 Tf {COL_X[c] + 8} {y} Td ({text}) Tj ET")
content = "\n".join(ops).encode()

objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
]
out = bytearray(b"%PDF-1.7\n")
offsets = []
for i, body in enumerate(objects, start=1):
    offsets.append(len(out))
    out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
for off in offsets:
    out += b"%010d 00000 n \n" % off
out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
Path(__file__).with_name("table_report.pdf").write_bytes(out)
