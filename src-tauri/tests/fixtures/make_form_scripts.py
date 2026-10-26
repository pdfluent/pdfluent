#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Build form_scripts.pdf: an order form that carries two AcroForm scripts.

Fields: qty, price (a format action) and total (a calculate action, product of
qty and price). It is the fixture of the "form scripts run only with your
permission" tests: the document has scripts, the bar must ask about them, and
total must stay empty until the user agrees.

    python3 src-tauri/tests/fixtures/make_form_scripts.py
"""
from pathlib import Path

OBJECTS = [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R 6 0 R] /CO [6 0 R] "
    "/NeedAppearances true /DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv 7 0 R >> >> >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R 5 0 R 6 0 R] "
    "/Resources << /Font << /Helv 7 0 R >> >> >>",
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (qty) /V () /DA (/Helv 12 Tf 0 g) "
    "/Rect [72 700 200 720] /F 4 /P 3 0 R >>",
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (price) /V () /DA (/Helv 12 Tf 0 g) "
    "/Rect [72 660 200 680] /F 4 /P 3 0 R "
    "/AA << /F << /S /JavaScript /JS (AFNumber_Format\\(2, 0, 0, 0, \"\", true\\);) >> >> >>",
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (total) /V () /DA (/Helv 12 Tf 0 g) "
    "/Rect [72 620 200 640] /F 4 /P 3 0 R /Ff 1 "
    "/AA << /C << /S /JavaScript /JS (AFSimple_Calculate\\(\"PRD\", new Array\\(\"qty\", \"price\"\\)\\);) >> >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]

out = bytearray(b"%PDF-1.7\n")
offsets = []
for i, body in enumerate(OBJECTS, start=1):
    offsets.append(len(out))
    out += f"{i} 0 obj\n{body}\nendobj\n".encode()
xref = len(out)
out += f"xref\n0 {len(OBJECTS) + 1}\n0000000000 65535 f \n".encode()
for off in offsets:
    out += f"{off:010d} 00000 n \n".encode()
out += f"trailer\n<< /Size {len(OBJECTS) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
Path(__file__).with_name("form_scripts.pdf").write_bytes(out)
