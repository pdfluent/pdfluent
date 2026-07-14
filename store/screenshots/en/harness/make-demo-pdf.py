from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                ListFlowable, ListItem, PageBreak)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ACCENT = colors.HexColor("#3B4A6B")   # muted professional indigo
INK    = colors.HexColor("#1F2430")
GREY   = colors.HexColor("#5A6172")
LIGHT  = colors.HexColor("#EEF1F6")

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=30,
                    textColor=INK, spaceAfter=6, leading=34, alignment=TA_LEFT)
SUB= ParagraphStyle('SUB', parent=ss['Normal'], fontName='Helvetica', fontSize=14,
                    textColor=GREY, spaceAfter=24, leading=18)
H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=16,
                    textColor=ACCENT, spaceBefore=18, spaceAfter=8, leading=20)
BODY=ParagraphStyle('BODY', parent=ss['Normal'], fontName='Helvetica', fontSize=11,
                    textColor=INK, leading=17, spaceAfter=10)
LI = ParagraphStyle('LI', parent=BODY, spaceAfter=4)

def build(path):
    doc = SimpleDocTemplate(path, pagesize=A4,
                            leftMargin=24*mm, rightMargin=24*mm,
                            topMargin=24*mm, bottomMargin=22*mm,
                            title="Project Proposal", author="Operations Team")
    e = []
    # --- Page 1: title + summary ---
    e.append(Spacer(1, 30))
    e.append(Paragraph("Project Proposal", H1))
    e.append(Paragraph("Operational Efficiency Initiative &mdash; Planning Document", SUB))
    e.append(Paragraph("Overview", H2))
    e.append(Paragraph(
        "This proposal outlines a focused initiative to streamline day-to-day operations "
        "across the team. The goal is to reduce manual handoffs, shorten turnaround times, "
        "and give everyone a clearer view of work in progress without adding new overhead.", BODY))
    e.append(Paragraph(
        "The plan is intentionally simple. It groups the work into three short phases, each "
        "with a clear owner and a measurable outcome, so progress stays easy to track and the "
        "team can adjust quickly as it learns.", BODY))
    e.append(Paragraph("Objectives", H2))
    e.append(ListFlowable([
        ListItem(Paragraph("Cut average request turnaround from five days to two.", LI)),
        ListItem(Paragraph("Replace three manual checklists with a single shared view.", LI)),
        ListItem(Paragraph("Make the status of any task visible in under one minute.", LI)),
        ListItem(Paragraph("Keep all documents and data on local, owned systems.", LI)),
    ], bulletType='bullet', start='square', leftIndent=14))
    e.append(PageBreak())
    # --- Page 2: scope + timeline table ---
    e.append(Paragraph("Scope and Timeline", H2))
    e.append(Paragraph(
        "The initiative covers intake, review, and delivery. It does not change reporting "
        "lines or budgets; it only improves how existing work moves through each step.", BODY))
    data = [["Phase", "Focus", "Duration", "Owner"],
            ["1. Map", "Document the current flow end to end", "2 weeks", "Operations"],
            ["2. Simplify", "Remove duplicate steps and handoffs", "3 weeks", "Process Lead"],
            ["3. Roll out", "Train the team and measure results", "3 weeks", "Team Leads"]]
    t = Table(data, colWidths=[28*mm, 66*mm, 26*mm, 32*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),ACCENT),
        ('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,1),(-1,-1),'Helvetica'),
        ('FONTSIZE',(0,0),(-1,-1),10.5),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LIGHT]),
        ('TEXTCOLOR',(0,1),(-1,-1),INK),
        ('LINEBELOW',(0,0),(-1,0),0.6,ACCENT),
        ('GRID',(0,1),(-1,-1),0.4,colors.HexColor("#D7DCE6")),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    e.append(t)
    e.append(Spacer(1, 16))
    e.append(Paragraph("Expected Outcomes", H2))
    e.append(Paragraph(
        "By the end of the rollout, the team should see faster turnaround, fewer dropped "
        "requests, and a single place to check status. The same approach can then extend to "
        "neighbouring teams with little extra effort.", BODY))
    e.append(PageBreak())
    # --- Page 3: budget + conclusion ---
    e.append(Paragraph("Resource Overview", H2))
    e.append(Paragraph(
        "The initiative uses existing tools and people. The only new cost is time set aside "
        "for mapping and training during the eight-week window.", BODY))
    b = [["Item", "Notes", "Estimate"],
         ["Mapping workshops", "Four short sessions", "Low"],
         ["Shared status view", "Built on current tools", "None"],
         ["Training", "Two sessions per team", "Low"],
         ["Contingency", "Buffer for adjustments", "Low"]]
    bt = Table(b, colWidths=[40*mm, 78*mm, 34*mm])
    bt.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),ACCENT),
        ('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,1),(-1,-1),'Helvetica'),
        ('FONTSIZE',(0,0),(-1,-1),10.5),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LIGHT]),
        ('TEXTCOLOR',(0,1),(-1,-1),INK),
        ('GRID',(0,1),(-1,-1),0.4,colors.HexColor("#D7DCE6")),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    e.append(bt)
    e.append(Spacer(1, 16))
    e.append(Paragraph("Conclusion", H2))
    e.append(Paragraph(
        "This is a low-risk, high-clarity change. It keeps ownership in the team, relies on "
        "tools already in place, and produces results that are easy to measure. We recommend "
        "starting with the mapping phase next month.", BODY))
    doc.build(e)

build("/tmp/Project Proposal.pdf")
print("OK created")
