// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import { PDF } from "@libpdf/core";
import {
  addAnnotation,
  addImageToPage,
  addFormFieldToDocument,
  addOcrTextLayerToPage,
  addOcrTextLayerToPages,
  comparePdfDocuments,
  addHeaderFooterToDocument,
  addWatermarkToDocument,
  createPdfFromImages,
  cropPageToRect,
  duplicatePdfPage,
  extractDocumentText,
  generatePdfAReadyCopy,
  generatePdfUaReadyCopy,
  generatePdfXReadyCopy,
  insertBlankPageAfter,
  mergePdfs,
  optimizePdfDocument,
  protectPdfWithPassword,
  redactPageRegions,
  removeFormFieldFromDocument,
  removeImageAreaFromPage,
  replaceImageAreaOnPage,
  replacePageWithExternalPage,
  replaceTextLine,
  replaceTextMatchesOnPage,
  sortIssuesByNumberPrefix,
  validatePdfAReadiness,
  validatePdfUaReadiness,
  validatePdfXReadiness,
  verifyPdfSignatures,
} from "../src/lib/pdf-manipulator";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZqWQAAAAASUVORK5CYII=";

function tinyPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(tinyPngBase64, "base64"));
}

function countStartXrefMarkers(bytes: Uint8Array): number {
  const decoded = new TextDecoder("latin1").decode(bytes);
  return decoded.match(/startxref/g)?.length ?? 0;
}

async function makeBasicPdf(): Promise<Uint8Array> {
  const pdf = PDF.create();
  const page = pdf.addPage({ size: "letter" });
  page.drawText("PDFluent test document", { x: 72, y: 700, size: 14 });
  return pdf.save();
}

describe("advanced pdf manipulator features", () => {
  it("adds watermark and redaction overlays", async () => {
    const source = await makeBasicPdf();
    const sourcePdf = await PDF.load(source);
    sourcePdf.setAuthor("Sensitive Author");
    sourcePdf.setKeywords(["internal", "secret"]);
    sourcePdf.addAttachment("secret.txt", new TextEncoder().encode("classified payload"));
    const sourceWithMetadata = await sourcePdf.save();
    const sourceWithIncrementalHistory = await (async () => {
      const incrementalPdf = await PDF.load(sourceWithMetadata);
      incrementalPdf.setSubject("Top secret source revision");
      return incrementalPdf.save({ incremental: true });
    })();
    const watermarked = await addWatermarkToDocument(source, {
      text: "CONFIDENTIAL",
      opacity: 0.2,
      rotationDegrees: 25,
      fontSize: 36,
    });
    const redacted = await redactPageRegions(watermarked, 0, [
      { x: 72, y: 680, width: 200, height: 20, label: "REDACTED" },
    ]);
    const redactedWithSanitizedMetadata = await redactPageRegions(
      sourceWithIncrementalHistory,
      0,
      [{ x: 72, y: 680, width: 200, height: 20, label: "REDACTED" }],
      { sanitizeMetadata: true },
    );

    const loaded = await PDF.load(redacted);
    const sanitizedLoaded = await PDF.load(redactedWithSanitizedMetadata);
    expect(loaded.getPages()).toHaveLength(1);
    expect(redacted.length).toBeGreaterThan(200);
    expect(sanitizedLoaded.getAuthor()).toBe("");
    expect(sanitizedLoaded.getMetadata().keywords).toEqual([]);
    expect(sanitizedLoaded.getMetadata().title).toBe("Redacted Document");
    expect(sanitizedLoaded.getAttachments().size).toBe(0);
    expect(countStartXrefMarkers(sourceWithIncrementalHistory)).toBeGreaterThan(1);
    expect(countStartXrefMarkers(redactedWithSanitizedMetadata)).toBe(1);
  });

  it("adds header/footer/page numbers and Bates numbering", async () => {
    const source = await makeBasicPdf();
    const enriched = await addHeaderFooterToDocument(source, {
      headerText: "Contract {page}/{total}",
      footerText: "Confidential",
      showPageNumbers: true,
      pageNumberTemplate: "Page {page} of {total}",
      batesPrefix: "PD-",
      batesStart: 42,
      fontSize: 9,
    });

    const loaded = await PDF.load(enriched);
    expect(loaded.getPages()).toHaveLength(1);
    expect(enriched.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("adds and removes image areas on a page", async () => {
    const source = await makeBasicPdf();
    const withImage = await addImageToPage(
      source,
      0,
      tinyPngBytes(),
      "image/png",
      { x: 72, y: 500, width: 120, height: 60 },
    );
    const cleaned = await removeImageAreaFromPage(withImage, 0, {
      x: 72,
      y: 500,
      width: 120,
      height: 60,
    });

    const loaded = await PDF.load(cleaned);
    expect(loaded.getPages()).toHaveLength(1);
  });

  it("adds an image behind existing page content when layer order is back", async () => {
    const source = await makeBasicPdf();
    const withImageBehind = await addImageToPage(
      source,
      0,
      tinyPngBytes(),
      "image/png",
      { x: 72, y: 500, width: 120, height: 60 },
      { layerOrder: "back", opacity: 0.9, rotationDegrees: 5 },
    );

    const loaded = await PDF.load(withImageBehind);
    expect(loaded.getPages()).toHaveLength(1);
    expect(withImageBehind.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("supports extra annotation payloads for free text/stamp/callout/underline/strike/measurement", async () => {
    const source = await makeBasicPdf();
    const withFreeText = await addAnnotation(source, {
      type: "free_text",
      pageIndex: 0,
      rect: { x: 72, y: 650, width: 120, height: 30 },
      contents: "Review note",
    });
    const withStamp = await addAnnotation(withFreeText, {
      type: "stamp",
      pageIndex: 0,
      rect: { x: 72, y: 600, width: 120, height: 30 },
      contents: "APPROVED",
    });
    const withUnderline = await addAnnotation(withStamp, {
      type: "underline",
      pageIndex: 0,
      rect: { x: 72, y: 560, width: 150, height: 16 },
      contents: "Underline",
    });
    const withStrikeout = await addAnnotation(withUnderline, {
      type: "strikeout",
      pageIndex: 0,
      rect: { x: 72, y: 530, width: 150, height: 16 },
      contents: "Strikeout",
    });
    const withCallout = await addAnnotation(withStrikeout, {
      type: "callout",
      pageIndex: 0,
      start: { x: 72, y: 500 },
      end: { x: 180, y: 470 },
      contents: "Callout",
    });
    const withMeasurement = await addAnnotation(withCallout, {
      type: "measurement",
      pageIndex: 0,
      start: { x: 72, y: 450 },
      end: { x: 240, y: 450 },
      contents: "Measurement",
    });

    const loaded = await PDF.load(withMeasurement);
    expect(loaded.getPages()).toHaveLength(1);
    expect(withMeasurement.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("replaces image area with transformed image placement", async () => {
    const source = await makeBasicPdf();
    const replaced = await replaceImageAreaOnPage(
      source,
      0,
      tinyPngBytes(),
      "image/png",
      { x: 72, y: 420, width: 160, height: 90 },
      { opacity: 0.75, rotationDegrees: 12 },
    );

    const loaded = await PDF.load(replaced);
    expect(loaded.getPages()).toHaveLength(1);
    expect(replaced.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("supports replace-image flow with background layer order option", async () => {
    const source = await makeBasicPdf();
    const replaced = await replaceImageAreaOnPage(
      source,
      0,
      tinyPngBytes(),
      "image/png",
      { x: 72, y: 420, width: 160, height: 90 },
      { opacity: 0.75, rotationDegrees: 12, layerOrder: "back" },
    );

    const loaded = await PDF.load(replaced);
    expect(loaded.getPages()).toHaveLength(1);
  });

  it("creates a PDF from images", async () => {
    const imagePdf = await createPdfFromImages([
      {
        name: "one.png",
        bytes: tinyPngBytes(),
      },
    ]);

    const loaded = await PDF.load(imagePdf);
    expect(loaded.getPages()).toHaveLength(1);
  });

  it("duplicates a page at a specific index", async () => {
    const source = await makeBasicPdf();
    const withSecondPage = await mergePdfs([source, source]);
    const duplicated = await duplicatePdfPage(withSecondPage, 0);

    const loaded = await PDF.load(duplicated);
    expect(loaded.getPages()).toHaveLength(3);
  });

  it("inserts a blank page after the selected index", async () => {
    const source = await makeBasicPdf();
    const merged = await mergePdfs([source, source]);
    const inserted = await insertBlankPageAfter(merged, 0);

    const loaded = await PDF.load(inserted);
    expect(loaded.getPages()).toHaveLength(3);
  });

  it("crops the selected page and preserves document page count", async () => {
    const sourcePdf = PDF.create();
    sourcePdf.addPage({ width: 792, height: 612 });
    sourcePdf.addPage({ size: "letter" });
    const source = await sourcePdf.save();

    const cropped = await cropPageToRect(source, 0, {
      x: 96,
      y: 48,
      width: 520,
      height: 420,
    });
    const loaded = await PDF.load(cropped);
    const pages = loaded.getPages();

    expect(pages).toHaveLength(2);
    expect(Math.round(pages[0]?.width ?? 0)).toBe(520);
    expect(Math.round(pages[0]?.height ?? 0)).toBe(420);
  });

  it("replaces a page using a page from another PDF", async () => {
    const source = await makeBasicPdf();
    const replacementPdf = PDF.create();
    const replacementPage = replacementPdf.addPage({ size: "letter" });
    replacementPage.drawText("Replacement", { x: 72, y: 700, size: 14 });

    const merged = await mergePdfs([source, source]);
    const replaced = await replacePageWithExternalPage(
      merged,
      1,
      await replacementPdf.save(),
      0,
    );
    const loaded = await PDF.load(replaced);
    expect(loaded.getPages()).toHaveLength(2);
  });

  it("protects a PDF with password and validates PDF/A readiness", async () => {
    const source = await makeBasicPdf();
    const protectedBytes = await protectPdfWithPassword(source, "user-pass", "owner-pass");
    const protectedPdf = await PDF.load(protectedBytes, { credentials: "user-pass" });

    expect(protectedPdf.isEncrypted).toBe(true);

    const readinessBefore = await validatePdfAReadiness(protectedBytes);
    expect(readinessBefore.compliant).toBe(false);

    const pdfaCopy = await generatePdfAReadyCopy(await makeBasicPdf());
    const readinessAfter = await validatePdfAReadiness(pdfaCopy);
    expect(readinessAfter.compliant).toBe(true);
  });

  it("runs PDF/X preflight checks and emits a PDF/X-oriented fixup copy", async () => {
    const source = await makeBasicPdf();
    const sourceReport = await validatePdfXReadiness(source);
    expect(sourceReport.checks.length).toBeGreaterThan(3);

    const pdfxCopy = await generatePdfXReadyCopy(source);
    const fixedReport = await validatePdfXReadiness(pdfxCopy);
    const loaded = await PDF.load(pdfxCopy);
    const metadata = loaded.getMetadata();

    expect(pdfxCopy.byteLength).toBeGreaterThan(200);
    expect(metadata.producer).toBe("PDFluent");
    expect(metadata.trapped).toBe("True");
    expect(fixedReport.compliant).toBe(true);
  });

  it("runs PDF/UA-oriented checks and produces an accessibility fixup copy", async () => {
    const source = await makeBasicPdf();
    const sourceReport = await validatePdfUaReadiness(source);
    expect(sourceReport.checks.length).toBeGreaterThan(3);

    const accessibleCopy = await generatePdfUaReadyCopy(source);
    const fixedReport = await validatePdfUaReadiness(accessibleCopy);
    const loaded = await PDF.load(accessibleCopy);

    expect(accessibleCopy.byteLength).toBeGreaterThan(200);
    expect(loaded.getLanguage()).toBe("en-US");
    expect(loaded.getTitle()).toContain("PDFluent");
    expect(fixedReport.compliant).toBe(true);
  });

  it("verifies signature structure for unsigned PDFs", async () => {
    const source = await makeBasicPdf();
    const report = await verifyPdfSignatures(source);

    expect(report.fields).toHaveLength(0);
    expect(report.signedFieldCount).toBe(0);
    expect(report.enterpriseReady).toBe(false);
    expect(report.detectedSubFilters).toEqual([]);
    expect(report.signingTimeHints).toEqual([]);
    expect(report.timestampTokenCount).toBe(0);
    expect(report.documentTimestampCount).toBe(0);
    expect(report.estimatedCertificateCount).toBe(0);
    expect(report.dss.present).toBe(false);
    expect(report.dss.certificateCount).toBe(0);
    expect(report.dss.ocspCount).toBe(0);
    expect(report.dss.crlCount).toBe(0);
    expect(report.dss.vriEntryCount).toBe(0);
    expect(report.hasRevocationData).toBe(false);
    expect(report.hasLtvData).toBe(false);
    expect(report.warnings.some((warning) => warning.code === "no_signatures")).toBe(true);
    expect(report.warnings.some((warning) => warning.code === "missing_ltv_data")).toBe(false);
    expect(report.allSignedFieldsHaveContents).toBe(true);
  });

  it("adds and removes form fields", async () => {
    const source = await makeBasicPdf();
    const withField = await addFormFieldToDocument(source, {
      pageIndex: 0,
      name: "customer_name",
      kind: "text",
      rect: { x: 72, y: 640, width: 220, height: 24 },
      defaultValue: "Alice",
    });
    const withoutField = await removeFormFieldFromDocument(withField, "customer_name");

    const loadedWithField = await PDF.load(withField);
    const loadedWithoutField = await PDF.load(withoutField);
    expect(loadedWithField.getForm()?.getFields().length ?? 0).toBe(1);
    expect(loadedWithoutField.getForm()?.getFields().length ?? 0).toBe(0);
  });

  it("embeds OCR text boxes as invisible searchable text", async () => {
    const source = await makeBasicPdf();
    const withOcrLayer = await addOcrTextLayerToPage(
      source,
      0,
      [
        {
          text: "Searchable",
          x0: 120,
          y0: 110,
          x1: 280,
          y1: 148,
          confidence: 0.96,
        },
      ],
      1000,
      1400,
    );

    const loaded = await PDF.load(withOcrLayer);
    const extracted = loaded.extractText();
    expect(extracted[0]?.text ?? "").toContain("Searchable");
  });

  it("embeds OCR text layers across multiple pages", async () => {
    const source = await mergePdfs([await makeBasicPdf(), await makeBasicPdf()]);
    const withLayer = await addOcrTextLayerToPages(source, [
      {
        pageIndex: 0,
        words: [{ text: "PageOneWord", x0: 120, y0: 120, x1: 240, y1: 148 }],
        renderedWidth: 1000,
        renderedHeight: 1400,
      },
      {
        pageIndex: 1,
        words: [{ text: "PageTwoWord", x0: 120, y0: 120, x1: 240, y1: 148 }],
        renderedWidth: 1000,
        renderedHeight: 1400,
      },
    ]);

    const loaded = await PDF.load(withLayer);
    const extracted = loaded.extractText();
    expect(extracted[0]?.text ?? "").toContain("PageOneWord");
    expect(extracted[1]?.text ?? "").toContain("PageTwoWord");
  });

  it("extracts document text by page", async () => {
    const pdf = PDF.create();
    const page1 = pdf.addPage({ size: "letter" });
    page1.drawText("Alpha text", { x: 72, y: 700, size: 14 });
    const page2 = pdf.addPage({ size: "letter" });
    page2.drawText("Beta text", { x: 72, y: 700, size: 14 });

    const extracted = await extractDocumentText(await pdf.save());
    expect(extracted).toHaveLength(2);
    expect(extracted[0]?.text ?? "").toContain("Alpha text");
    expect(extracted[1]?.text ?? "").toContain("Beta text");
  });

  it("replaces text matches on a page with case-insensitive mode", async () => {
    const pdf = PDF.create();
    const page = pdf.addPage({ size: "letter" });
    page.drawText("Hello Search", { x: 72, y: 700, size: 14 });
    page.drawText("HELLO search", { x: 72, y: 674, size: 14 });
    const source = await pdf.save();

    const replaced = await replaceTextMatchesOnPage(
      source,
      0,
      "hello",
      "Hi",
      { caseSensitive: false },
    );

    expect(replaced.replacedLines).toBeGreaterThan(0);
    const loaded = await PDF.load(replaced.bytes);
    const extracted = loaded.extractText();
    expect(extracted[0]?.text ?? "").toContain("Hi");
  });

  it("replaces a text line with wrapped reflow and font fallback", async () => {
    const pdf = PDF.create();
    const page = pdf.addPage({ size: "letter" });
    page.drawText("Original short line", { x: 72, y: 700, size: 14 });
    const source = await pdf.save();
    const lines = await extractDocumentText(source);

    const replaced = await replaceTextLine(
      source,
      0,
      {
        lineIndex: 0,
        text: lines[0]?.lines[0] ?? "Original short line",
        bbox: { x: 72, y: 684, width: 240, height: 26 },
        fontName: "DefinitelyUnknownFontName",
        fontSize: 14,
      },
      "This replacement sentence is intentionally longer to exercise wrapping behavior.",
    );

    const loaded = await PDF.load(replaced);
    const extracted = loaded.extractText();
    expect(extracted[0]?.text ?? "").toContain("replacement sentence");
  });

  it("compares two PDFs and reports changed pages", async () => {
    const basePdf = PDF.create();
    const basePage = basePdf.addPage({ size: "letter" });
    basePage.drawText("Version A", { x: 72, y: 700, size: 14 });

    const targetPdf = PDF.create();
    const targetPage = targetPdf.addPage({ size: "letter" });
    targetPage.drawText("Version B", { x: 72, y: 700, size: 14 });

    const report = await comparePdfDocuments(
      await basePdf.save(),
      await targetPdf.save(),
    );
    expect(report.basePageCount).toBe(1);
    expect(report.targetPageCount).toBe(1);
    expect(report.changedTextPages).toBe(1);
    expect(report.changedVisualPages).toBe(0);
    expect(report.differences[0]?.kind).toBe("text_changed");
    expect(report.differences[0]?.baseVisual).toBeTruthy();
    expect(report.differences[0]?.targetVisual).toBeTruthy();
  });

  it("reports visual page size changes in compare output", async () => {
    const basePdf = PDF.create();
    const basePage = basePdf.addPage({ width: 612, height: 792 });
    basePage.drawText("Same text", { x: 72, y: 700, size: 14 });

    const targetPdf = PDF.create();
    const targetPage = targetPdf.addPage({ width: 792, height: 612 });
    targetPage.drawText("Same text", { x: 72, y: 520, size: 14 });

    const report = await comparePdfDocuments(
      await basePdf.save(),
      await targetPdf.save(),
    );
    expect(report.changedTextPages).toBe(0);
    expect(report.changedVisualPages).toBe(1);
    expect(report.differences.some((difference) => difference.kind === "visual_changed")).toBe(
      true,
    );
  });

  it("optimizes a PDF and returns size/options report", async () => {
    const source = await makeBasicPdf();
    const result = await optimizePdfDocument(source, "custom", {
      compressionThreshold: 320,
      subsetFonts: false,
      compressStreams: true,
    });

    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(result.report.beforeBytes).toBe(source.byteLength);
    expect(result.report.afterBytes).toBe(result.bytes.byteLength);
    expect(result.report.profile).toBe("custom");
    expect(result.report.options.compressionThreshold).toBe(320);
    expect(result.report.options.subsetFonts).toBe(false);
  });

  it("sorts issue titles by numeric prefix", () => {
    const sorted = sortIssuesByNumberPrefix([
      "41. SEO feature pages",
      "32. BYOS",
      "No number issue",
      "39. Audit trail",
    ]);

    expect(sorted[0]?.title).toContain("32.");
    expect(sorted[1]?.title).toContain("39.");
    expect(sorted[2]?.title).toContain("41.");
    expect(sorted[3]?.order).toBeNull();
  });
});
