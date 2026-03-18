// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("stability and parity action wiring", () => {
  it("uses transactional safe writes for in-place document mutations", () => {
    expect(appSource).toContain("async function writeDocumentSafely(");
    expect(appSource).toContain("safe_write_recovery_snapshot_created");
    expect(appSource).toContain("\"add_annotation\",");
    expect(appSource).toContain("\"update_form_field\",");
    expect(appSource).toContain("\"sign_document\",");
    expect(appSource).toContain("existingBytes,");
    expect(appSource).toContain("documentBytes,");
    expect(appSource).toContain("safe_write_rollback_success");
  });

  it("wires compare/optimize/debug export actions from app to toolbar", () => {
    expect(appSource).toContain("const comparePdfFiles = useCallback(async () => {");
    expect(appSource).toContain("const optimizePdf = useCallback(async () => {");
    expect(appSource).toContain("const exportDebugBundle = useCallback(async () => {");
    expect(appSource).toContain("debugSessionId: getDebugSessionId(),");
    expect(appSource).toContain("const addHeaderFooterAndBates = useCallback(async () => {");
    expect(appSource).toContain("const insertBlankPage = useCallback(async () => {");
    expect(appSource).toContain("const replaceCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("const cropCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("const replaceImageAreaOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("const addFormField = useCallback(async () => {");
    expect(appSource).toContain("const removeFormField = useCallback(");
    expect(appSource).toContain("const exportAsXlsx = useCallback(async () => {");
    expect(appSource).toContain("const exportAsPptx = useCallback(async () => {");
    expect(appSource).toContain("const copyCurrentPageText = useCallback(async () => {");
    expect(appSource).toContain("const copyDocumentText = useCallback(async () => {");
    expect(appSource).toContain("const replaceTextMatchesOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("const replaceTextMatchesAcrossDocument = useCallback(async () => {");
    expect(appSource).toContain("const runEnhancedOcrOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("const undoLastMutation = useCallback(async () => {");
    expect(appSource).toContain("const redoLastMutation = useCallback(async () => {");
    expect(appSource).toContain("onComparePdfFiles={() => {");
    expect(appSource).toContain("void comparePdfFiles();");
    expect(appSource).toContain("onOptimizePdf={() => {");
    expect(appSource).toContain("void optimizePdf();");
    expect(appSource).toContain("onInsertBlankPage={() => {");
    expect(appSource).toContain("void insertBlankPage();");
    expect(appSource).toContain("onReplaceCurrentPage={() => {");
    expect(appSource).toContain("void replaceCurrentPage();");
    expect(appSource).toContain("onCropPage={() => {");
    expect(appSource).toContain("void cropCurrentPage();");
    expect(appSource).toContain("onReplaceImageArea={() => {");
    expect(appSource).toContain("void replaceImageAreaOnCurrentPage();");
    expect(appSource).toContain("onExportXlsx={() => {");
    expect(appSource).toContain("void exportAsXlsx();");
    expect(appSource).toContain("onExportPptx={() => {");
    expect(appSource).toContain("void exportAsPptx();");
    expect(appSource).toContain("onCopyPageText={() => {");
    expect(appSource).toContain("void copyCurrentPageText();");
    expect(appSource).toContain("onCopyDocumentText={() => {");
    expect(appSource).toContain("void copyDocumentText();");
    expect(appSource).toContain("onFindReplacePage={() => {");
    expect(appSource).toContain("void replaceTextMatchesOnCurrentPage();");
    expect(appSource).toContain("onFindReplaceDocument={() => {");
    expect(appSource).toContain("void replaceTextMatchesAcrossDocument();");
    expect(appSource).toContain("onEnhanceScanForOcr={() => {");
    expect(appSource).toContain("void runEnhancedOcrOnCurrentPage();");
    expect(appSource).toContain("onAddFormField={() => {");
    expect(appSource).toContain("void addFormField();");
    expect(appSource).toContain("onAddHeaderFooter={() => {");
    expect(appSource).toContain("void addHeaderFooterAndBates();");
    expect(appSource).toContain("onUndo={() => {");
    expect(appSource).toContain("void undoLastMutation();");
    expect(appSource).toContain("onRedo={() => {");
    expect(appSource).toContain("void redoLastMutation();");
    expect(appSource).toContain("onExportDebugBundle={() => {");
    expect(appSource).toContain("void exportDebugBundle();");
  });

  it("registers debug context provider for crash diagnostics", () => {
    expect(appSource).toContain("setDebugLogContextProvider(() => ({");
    expect(appSource).toContain("filePath,");
    expect(appSource).toContain("currentPage: currentPage + 1,");
    expect(appSource).toContain("pageCount: docInfo?.page_count ?? 0,");
    expect(appSource).toContain("annotationTool,");
    expect(appSource).toContain("textEditorEnabled,");
    expect(appSource).toContain("networkMode,");
    expect(appSource).toContain("setDebugLogContextProvider(null);");
  });

  it("disables toolbar actions for all save/mutation states", () => {
    expect(toolbarSource).toContain(
      "const isProcessing = signing || checkingUpdates || ocrProcessing || annotationSaving;",
    );
    expect(toolbarSource).toContain("onComparePdfFiles: () => void;");
    expect(toolbarSource).toContain("onOptimizePdf: () => void;");
    expect(toolbarSource).toContain("onInsertBlankPage: () => void;");
    expect(toolbarSource).toContain("onReplaceCurrentPage: () => void;");
    expect(toolbarSource).toContain("onCropPage: () => void;");
    expect(toolbarSource).toContain("onReplaceImageArea: () => void;");
    expect(toolbarSource).toContain("onExportXlsx: () => void;");
    expect(toolbarSource).toContain("onExportPptx: () => void;");
    expect(toolbarSource).toContain("onCopyPageText: () => void;");
    expect(toolbarSource).toContain("onCopyDocumentText: () => void;");
    expect(toolbarSource).toContain("onFindReplacePage: () => void;");
    expect(toolbarSource).toContain("onFindReplaceDocument: () => void;");
    expect(toolbarSource).toContain("onEnhanceScanForOcr: () => void;");
    expect(toolbarSource).toContain("onAddFormField: () => void;");
    expect(toolbarSource).toContain("onAddHeaderFooter: () => void;");
    expect(toolbarSource).toContain("onUndo: () => void;");
    expect(toolbarSource).toContain("onRedo: () => void;");
    expect(toolbarSource).toContain("onExportDebugBundle: () => void;");
    expect(toolbarSource).toContain("Compare files");
    expect(toolbarSource).toContain("Optimize PDF");
    expect(toolbarSource).toContain("Insert blank page");
    expect(toolbarSource).toContain("Replace current page");
    expect(toolbarSource).toContain("Crop current page");
    expect(toolbarSource).toContain("Replace image area");
    expect(toolbarSource).toContain("Export as XLSX");
    expect(toolbarSource).toContain("Export as PPTX");
    expect(toolbarSource).toContain("Copy page text");
    expect(toolbarSource).toContain("Copy document text");
    expect(toolbarSource).toContain("Find & replace (page)");
    expect(toolbarSource).toContain("Find & replace (document)");
    expect(toolbarSource).toContain("Enhance scan + OCR");
    expect(toolbarSource).toContain("Add form field");
    expect(toolbarSource).toContain("Header/Footer & Bates");
    expect(toolbarSource).toContain("Undo");
    expect(toolbarSource).toContain("Redo");
    expect(toolbarSource).toContain("Export debug bundle");
  });
});
