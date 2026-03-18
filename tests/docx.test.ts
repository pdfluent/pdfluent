// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDF } from "@libpdf/core";
import { convertPdfToDocx, convertPdfToPptx, convertPdfToXlsx } from "../src/lib/docx";

describe("docx conversion", () => {
  it("converts extracted PDF text into a layout-aware DOCX package", async () => {
    const pdf = PDF.create();
    const page = pdf.addPage({ size: "letter" });
    page.drawText("Hello DOCX conversion", { x: 72, y: 700, size: 14 });
    page.drawText("Second positioned line", { x: 180, y: 640, size: 11 });
    const bytes = await pdf.save();

    const docxBytes = await convertPdfToDocx(bytes);
    expect(docxBytes.length).toBeGreaterThan(500);

    const zip = await JSZip.loadAsync(docxBytes);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toBeDefined();
    expect(documentXml ?? "").toContain("Hello DOCX conversion");
    expect(documentXml ?? "").toContain("Second positioned line");
    expect(documentXml ?? "").toContain("<w:ind w:left=");
    expect(documentXml ?? "").toContain("<w:spacing w:before=");
    expect(documentXml ?? "").toContain("<w:pgSz w:w=\"12240\" w:h=\"15840\"/>");
  });

  it("converts extracted PDF text into a position-mapped XLSX workbook", async () => {
    const pdf = PDF.create();
    const page = pdf.addPage({ size: "letter" });
    page.drawText("Hello XLSX conversion", { x: 72, y: 700, size: 14 });
    page.drawText("Cell far right", { x: 360, y: 620, size: 12 });
    const bytes = await pdf.save();

    const xlsxBytes = await convertPdfToXlsx(bytes);
    expect(xlsxBytes.length).toBeGreaterThan(600);

    const zip = await JSZip.loadAsync(xlsxBytes);
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");

    expect(workbookXml ?? "").toContain("Page 1");
    expect(sheetXml ?? "").toContain("Hello XLSX conversion");
    expect(sheetXml ?? "").toContain("Cell far right");
    expect(sheetXml ?? "").toMatch(/<c r=\"[B-Z]+[0-9]+\"/);
  });

  it("converts extracted PDF text into a layout-aware PPTX slide deck", async () => {
    const pdf = PDF.create();
    const page = pdf.addPage({ size: "letter" });
    page.drawText("Hello PPTX conversion", { x: 72, y: 700, size: 14 });
    page.drawText("Slide positioned text", { x: 280, y: 620, size: 12 });
    const bytes = await pdf.save();

    const pptxBytes = await convertPdfToPptx(bytes);
    expect(pptxBytes.length).toBeGreaterThan(1500);

    const zip = await JSZip.loadAsync(pptxBytes);
    const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
    const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

    expect(presentationXml ?? "").toContain("<p:sldIdLst>");
    expect(presentationXml ?? "").toContain("<p:sldSz cx=\"7772400\" cy=\"10058400\" type=\"custom\"/>");
    expect(slideXml ?? "").toContain("Hello PPTX conversion");
    expect(slideXml ?? "").toContain("Slide positioned text");
    expect(slideXml ?? "").toContain("<a:off x=");
    expect(slideXml ?? "").toContain("<a:ext cx=");
    expect((slideXml ?? "").match(/<p:sp>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
