// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("text and OCR parity flows", () => {
  it("supports copying full document text and page-level find-replace", () => {
    expect(appSource).toContain("const copyDocumentText = useCallback(async () => {");
    expect(appSource).toContain("extractDocumentText(bytes)");
    expect(appSource).toContain("copy_document_text_success");
    expect(appSource).toContain("const replaceTextMatchesOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("replaceTextMatchesOnPage(");
    expect(appSource).toContain("\"replace_text_matches_page\"");
    expect(appSource).toContain("const replaceTextMatchesAcrossDocument = useCallback(async () => {");
    expect(appSource).toContain("\"replace_text_matches_document\"");
    expect(appSource).toContain("Replace matches across all");
  });

  it("supports OCR scope and language selection with searchable overlays", () => {
    expect(appSource).toContain("ocr_offline_mode_enabled");
    expect(appSource).not.toContain("OCR requires online mode for language model loading.");
    expect(appSource).toContain("OCR scope (current|all):");
    expect(appSource).toContain("OCR language code (PaddleOCR, e.g. en, nl, de, fr):");
    expect(appSource).toContain("Enable PP-Structure layout analysis? (yes|no):");
    expect(appSource).toContain("Skip pages that already contain selectable text? (yes|no):");
    expect(appSource).toContain("OCR preprocess mode (off|auto|manual):");
    expect(appSource).toContain("Manual preprocessing steps (deskew,denoise,contrast):");
    expect(appSource).toContain("buildOcrPolicy({");
    expect(appSource).toContain("runPaddleOcr({");
    expect(appSource).toContain("include_structure: includeStructure");
    expect(appSource).toContain("preprocess_mode: ocrPolicy.mode");
    expect(appSource).toContain("preprocess_steps: ocrPolicy.steps");
    expect(appSource).toContain("const pageIndexes =");
    expect(appSource).toContain("scope === \"all\"");
    expect(appSource).toContain("addOcrTextLayerToPages(");
    expect(appSource).toContain("ocr_page_start");
    expect(appSource).toContain("ocr_page_success");
    expect(appSource).toContain("ocr_structure_exported");
  });
});
