// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJsonSource = readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8",
);
const workflowSource = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("compliance and OCR hardening tooling", () => {
  it("defines compliance generation and gate scripts in package.json", () => {
    expect(packageJsonSource).toContain("\"ocr:manifest\"");
    expect(packageJsonSource).toContain("\"compliance:generate\"");
    expect(packageJsonSource).toContain("\"compliance:check\"");
  });

  it("runs compliance gate in CI", () => {
    expect(workflowSource).toContain("Generate OCR model manifest");
    expect(workflowSource).toContain("Generate compliance inventory");
    expect(workflowSource).toContain("Enforce license policy gate");
  });

  it("wires OCR policy and enhanced OCR action in app flow", () => {
    expect(appSource).toContain("const runOcrWorkflow = useCallback(async (preset?: OcrRunPreset)");
    expect(appSource).toContain("const ocrPolicy = buildOcrPolicy({");
    expect(appSource).toContain("const runEnhancedOcrOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("onEnhanceScanForOcr={() => {");
  });
});
