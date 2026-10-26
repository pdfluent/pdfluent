#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Builds pii_sample.pdf: two pages of plain Helvetica text with personal data
(IBAN, e-mail, phone) and near-misses that must not be flagged. Every value
is made up or taken from public documentation (the IBANs are the registry's
published examples). Run: python3 make_pii_sample.py > pii_sample.pdf"""
import sys

PAGES = [
    [
        "Customer record",
        "Account holder IBAN: NL91 ABNA 0417 1643 00",
        "Mail: jan.jansen@example.com",
        "Mobile: +31 6 12345678",
        "Office: 020 1234567",
        "Checksum typo: NL92 ABNA 0417 1643 00",
        "Old account number: 0417164300",
        "Invoice 2024-0042 dated 18-10-2024",
    ],
    [
        "Reminder",
        "Reminder sent to jan.jansen@example.com",
        "Support: +44 20 7946 0958",
        "Reference: DE89 3704 0044 0532 0130 00",
        "Version 1.2.3 ratio 3:1 total 1.234,56",
    ],
]

def build():
    objs = []
    def add(b): objs.append(b); return len(objs)
    add(b"<< /Type /Catalog /Pages 2 0 R >>")
    n = len(PAGES)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n))
    add(f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode())
    font_id = 3 + 2 * n
    for i, lines in enumerate(PAGES):
        content = "".join(
            f"BT /F1 12 Tf 72 {720 - 24 * j} Td ({t}) Tj ET\n" for j, t in enumerate(lines)
        ).encode()
        add(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + 2 * i} 0 R "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> >>".encode())
        add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"endstream")
    add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)

sys.stdout.buffer.write(build())
