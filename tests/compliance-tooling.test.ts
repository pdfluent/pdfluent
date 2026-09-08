// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJsonSource = readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8",
);
const complianceWorkflowSource = readFileSync(
  new URL("../.github/workflows/compliance.yml", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../src/legacy/App.tsx", import.meta.url), "utf8");
const qualityWorkflowSource = readFileSync(
  new URL("../.github/workflows/quality.yml", import.meta.url),
  "utf8",
);

describe("compliance and OCR hardening tooling", () => {
  it("defines compliance generation and gate scripts in package.json", () => {
    expect(packageJsonSource).toContain("\"ocr:manifest\"");
    expect(packageJsonSource).toContain("\"compliance:generate\"");
    expect(packageJsonSource).toContain("\"compliance:check\"");
  });

  // The three steps moved from the retired ci.yml to compliance.yml with #465,
  // which is where they already lived in duplicate. Manual, and the workflow
  // says why: compliance:check exits 2 on this tree today.
  it("runs compliance gate in CI", () => {
    expect(complianceWorkflowSource).toContain("Generate OCR model manifest");
    expect(complianceWorkflowSource).toContain("Generate compliance inventory");
    expect(complianceWorkflowSource).toContain("Enforce license policy gate");
  });

  // This one is a push gate, and has to stay one: the notice generator skipped
  // optional platform packages, and an LGPL-3.0 libvips binary sat in the npm
  // tree unlisted for three months. It is named on its own so a regression is
  // named in the log rather than buried in 6,500 other results.
  it("runs the notice-generator gate as a named step on every push", () => {
    expect(qualityWorkflowSource).toContain("Third-party notice generator gate");
    expect(qualityWorkflowSource).toContain(
      "tests/compliance-generator-optional-deps.test.ts",
    );
  });

  it("wires OCR policy and enhanced OCR action in app flow", () => {
    expect(appSource).toContain("const runOcrWorkflow = useCallback(async (preset?: OcrRunPreset)");
    expect(appSource).toContain("const ocrPolicy = buildOcrPolicy({");
    expect(appSource).toContain("const runEnhancedOcrOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("onEnhanceScanForOcr={() => {");
  });
});
