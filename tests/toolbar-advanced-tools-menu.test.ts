// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar advanced tools menu", () => {
  it("renders an explicit more-tools menu shell", () => {
    expect(toolbarSource).toContain("aria-label=\"More tools\"");
    expect(toolbarSource).toContain("<details className=\"relative\">");
    expect(toolbarSource).toContain("EllipsisIcon");
  });

  it("exposes advanced PDF operations inside the tools menu", () => {
    expect(toolbarSource).toContain("Compare files");
    expect(toolbarSource).toContain("Optimize PDF");
    expect(toolbarSource).toContain("Find & replace (page)");
    expect(toolbarSource).toContain("Find & replace (document)");
    expect(toolbarSource).toContain("Copy document text");
    expect(toolbarSource).toContain("Import encrypted copy");
    expect(toolbarSource).toContain("Add image");
    expect(toolbarSource).toContain("Remove image area");
    expect(toolbarSource).toContain("Replace image area");
    expect(toolbarSource).toContain("Redact page");
    expect(toolbarSource).toContain("Add watermark");
    expect(toolbarSource).toContain("Header/Footer & Bates");
    expect(toolbarSource).toContain("Split PDF ranges");
    expect(toolbarSource).toContain("Insert blank page");
    expect(toolbarSource).toContain("Replace current page");
    expect(toolbarSource).toContain("Crop current page");
    expect(toolbarSource).toContain("Rotate all pages");
    expect(toolbarSource).toContain("Export as DOCX");
    expect(toolbarSource).toContain("Export as XLSX");
    expect(toolbarSource).toContain("Export as PPTX");
    expect(toolbarSource).toContain("Export as images");
    expect(toolbarSource).toContain("Create PDF from images");
    expect(toolbarSource).toContain("Add form field");
    expect(toolbarSource).toContain("Run OCR");
    expect(toolbarSource).toContain("Enhance scan + OCR");
    expect(toolbarSource).toContain("Protect PDF");
    expect(toolbarSource).toContain("PDF/A check");
    expect(toolbarSource).toContain("PDF/A copy");
    expect(toolbarSource).toContain("Verify signatures");
  });

  it("wires advanced menu actions to existing app callbacks", () => {
    expect(toolbarSource).toContain("onClick={onComparePdfFiles}");
    expect(toolbarSource).toContain("onClick={onOptimizePdf}");
    expect(toolbarSource).toContain("onClick={onFindReplacePage}");
    expect(toolbarSource).toContain("onClick={onFindReplaceDocument}");
    expect(toolbarSource).toContain("onClick={onCopyDocumentText}");
    expect(toolbarSource).toContain("onClick={onImportEncryptedCopy}");
    expect(toolbarSource).toContain("onClick={onAddImage}");
    expect(toolbarSource).toContain("onClick={onRemoveImageArea}");
    expect(toolbarSource).toContain("onClick={onReplaceImageArea}");
    expect(toolbarSource).toContain("onClick={onRedactPage}");
    expect(toolbarSource).toContain("onClick={onAddWatermark}");
    expect(toolbarSource).toContain("onClick={onAddHeaderFooter}");
    expect(toolbarSource).toContain("onClick={onSplitPdf}");
    expect(toolbarSource).toContain("onClick={onInsertBlankPage}");
    expect(toolbarSource).toContain("onClick={onReplaceCurrentPage}");
    expect(toolbarSource).toContain("onClick={onCropPage}");
    expect(toolbarSource).toContain("onClick={onRotateAllPages}");
    expect(toolbarSource).toContain("onClick={onExportDocx}");
    expect(toolbarSource).toContain("onClick={onExportXlsx}");
    expect(toolbarSource).toContain("onClick={onExportPptx}");
    expect(toolbarSource).toContain("onClick={onExportImages}");
    expect(toolbarSource).toContain("onClick={onAddFormField}");
    expect(toolbarSource).toContain("onClick={onCreatePdfFromImages}");
    expect(toolbarSource).toContain("onClick={onRunOcr}");
    expect(toolbarSource).toContain("onClick={onEnhanceScanForOcr}");
    expect(toolbarSource).toContain("onClick={onProtectPdf}");
    expect(toolbarSource).toContain("onClick={onValidatePdfA}");
    expect(toolbarSource).toContain("onClick={onGeneratePdfA}");
    expect(toolbarSource).toContain("onClick={onVerifySignatures}");
  });
});
