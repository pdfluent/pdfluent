# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Builds the demo documents the store screenshots show. Everything in them is
# invented: the company, the people, the figures. Greyscale only, so the
# document does not fight the monochrome editor. Re-run after changing a
# phrase, and keep the phrases in tests/screenshots/lib/demo.ts in step
# (tests/screenshots-pipeline.test.ts checks that they are).
#
#   python3 tests/screenshots/fixtures/make-demo-docs.py
import os

from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image as RlImage, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
INK = colors.HexColor("#161616")
GREY = colors.HexColor("#5C5C5C")
RULE = colors.HexColor("#BDBDBD")
WASH = colors.HexColor("#F1F1F1")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=28,
                    textColor=INK, leading=32, alignment=TA_LEFT, spaceAfter=4)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontName="Helvetica", fontSize=13,
                     textColor=GREY, leading=17, spaceAfter=22)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=15,
                    textColor=INK, spaceBefore=16, spaceAfter=7, leading=19)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontName="Helvetica", fontSize=11,
                      textColor=INK, leading=17, spaceAfter=9)


def picture(path):
    img = Image.new("L", (1200, 640), 235)
    d = ImageDraw.Draw(img)
    for i in range(0, 1200, 40):  # a quiet fictitious floor plan
        d.line([(i, 0), (i, 640)], fill=222)
    for i in range(0, 640, 40):
        d.line([(0, i), (1200, i)], fill=222)
    d.rectangle([120, 90, 560, 330], outline=40, width=6, fill=205)
    d.rectangle([560, 90, 1080, 330], outline=40, width=6, fill=190)
    d.rectangle([120, 330, 1080, 540], outline=40, width=6, fill=215)
    d.ellipse([820, 380, 960, 500], outline=40, width=6, fill=170)
    img.save(path)


def build_report(path, png):
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=24 * mm, rightMargin=24 * mm,
                            topMargin=22 * mm, bottomMargin=20 * mm,
                            title="Quarterly Operations Report", author="Harbor & Pine Studio",
                            invariant=1)
    e = []
    e.append(Paragraph("Quarterly Operations Report", H1))
    e.append(Paragraph("Harbor &amp; Pine Studio &mdash; third quarter", SUB))
    e.append(Paragraph("Summary", H2))
    e.append(Paragraph("Orders shipped on time rose in the third quarter, and returns fell for "
                       "the second quarter in a row. The studio kept all of its work on its own "
                       "machines.", BODY))
    e.append(Paragraph("The warehouse move finished two weeks early. Staffing stayed flat while "
                       "the number of orders grew, which is the result the plan asked for.", BODY))
    e.append(Paragraph("Results by region", H2))
    rows = [["Region", "Orders", "On time", "Returns"],
            ["North", "1,240", "96%", "1.8%"],
            ["South", "980", "94%", "2.4%"],
            ["East", "1,515", "97%", "1.5%"],
            ["West", "760", "93%", "2.9%"],
            ["Total", "4,495", "95.6%", "2.1%"]]
    t = Table(rows, colWidths=[52 * mm, 34 * mm, 34 * mm, 34 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10.5),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 10.5),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10.5),
        ("BACKGROUND", (0, 0), (-1, 0), WASH),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#FAFAFA")]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    e.append(t)
    e.append(PageBreak())
    e.append(Paragraph("Warehouse layout", H2))
    e.append(Paragraph("The new floor plan puts packing next to the dock and moves slow stock to "
                       "the back wall.", BODY))
    e.append(Spacer(1, 6))
    e.append(RlImage(png, width=160 * mm, height=160 * mm * 640 / 1200))
    e.append(Spacer(1, 10))
    e.append(Paragraph("Next quarter", H2))
    e.append(Paragraph("Two things are planned: a shared pick list for the East and West sites, "
                       "and a review of the supplier terms in the services agreement on the next "
                       "page.", BODY))
    e.append(PageBreak())
    e.append(Paragraph("Services Agreement", H1))
    e.append(Paragraph("Between Harbor &amp; Pine Studio and Northfield Packaging Ltd.", SUB))
    e.append(Paragraph("Northfield Packaging supplies cartons and tape to the studio on the terms "
                       "below, for twelve months from the date of signing.", BODY))
    e.append(Paragraph("Prices are fixed for the term. Either side may end the agreement with "
                       "thirty days' notice in writing.", BODY))
    e.append(Spacer(1, 70))
    e.append(Paragraph("Signed for Harbor &amp; Pine Studio:", BODY))
    doc.build(e)


if __name__ == "__main__":
    png = os.path.join(HERE, "demo-floorplan.png")
    picture(png)
    build_report(os.path.join(HERE, "demo-report.pdf"), png)
    print("wrote demo-report.pdf, demo-floorplan.png")
