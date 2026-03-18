// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("advanced phase action wiring", () => {
  it("repairs malformed PDFs during open flow before failing hard", () => {
    expect(appSource).toContain("open_pdf_malformed_detected");
    expect(appSource).toContain("const repairedPath = path.replace(/\\.pdf$/i, \".pdfluent-repaired.pdf\");");
    expect(appSource).toContain("open_pdf_malformed_repaired");
  });

  it("supports crop and advanced image replacement mutations", () => {
    expect(appSource).toContain("const cropCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("cropPageToRect(bytes, currentPage, rect)");
    expect(appSource).toContain("\"crop_page\"");
    expect(appSource).toContain("const replaceImageAreaOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("replaceImageAreaOnPage(");
    expect(appSource).toContain("\"replace_image_area\"");
  });

  it("writes OCR output into searchable text layer when requested", () => {
    expect(appSource).toContain("OCR mode (searchable|txt):");
    expect(appSource).toContain("OCR scope (current|all):");
    expect(appSource).toContain("OCR language code (PaddleOCR, e.g. en, nl, de, fr):");
    expect(appSource).toContain("Enable PP-Structure layout analysis? (yes|no):");
    expect(appSource).toContain("const includeStructure = includeStructureNormalized === \"yes\";");
    expect(appSource).toContain("OCR preprocess mode (off|auto|manual):");
    expect(appSource).toContain("const ocrPolicy = buildOcrPolicy({");
    expect(appSource).toContain("runPaddleOcr({");
    expect(appSource).toContain("include_structure: includeStructure");
    expect(appSource).toContain("preprocess_mode: ocrPolicy.mode");
    expect(appSource).toContain("preprocess_steps: ocrPolicy.steps");
    expect(appSource).toContain("const structurePayload = {");
    expect(appSource).toContain("replaceFileExtension(outputPath, \".structure.json\")");
    expect(appSource).toContain("addOcrTextLayerToPages(");
    expect(appSource).toContain("pushUndoSnapshot(\"ocr_searchable_layer\"");
    expect(appSource).toContain("\"ocr_searchable_layer\"");
  });

  it("exports XLSX conversion alongside DOCX export", () => {
    expect(appSource).toContain("const exportAsXlsx = useCallback(async () => {");
    expect(appSource).toContain("const exportAsPptx = useCallback(async () => {");
    expect(appSource).toContain("convertPdfToXlsx(existingBytes)");
    expect(appSource).toContain("convertPdfToPptx(existingBytes)");
    expect(appSource).toContain("recordAudit(\"export_xlsx\", \"success\"");
    expect(appSource).toContain("recordAudit(\"export_pptx\", \"success\"");
  });

  it("adds PDF/X preflight and fixup copy actions beside PDF/A", () => {
    expect(appSource).toContain("const validatePdfX = useCallback(async () => {");
    expect(appSource).toContain("const exportPdfXReadyCopy = useCallback(async () => {");
    expect(appSource).toContain("const report = await validatePdfXReadiness(existingBytes);");
    expect(appSource).toContain("recordAudit(\"validate_pdfx\"");
    expect(appSource).toContain("const pdfxBytes = await generatePdfXReadyCopy(existingBytes);");
    expect(appSource).toContain("recordAudit(\"generate_pdfx_copy\"");
  });
});
