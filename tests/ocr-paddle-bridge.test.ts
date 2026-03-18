// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const tauriApiSource = readFileSync(
  new URL("../src/lib/tauri-api.ts", import.meta.url),
  "utf8",
);
const rustSource = readFileSync(
  new URL("../src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);
const rustOcrSource = readFileSync(
  new URL("../src-tauri/src/ocr.rs", import.meta.url),
  "utf8",
);

describe("paddle OCR bridge wiring", () => {
  it("exposes a typed Tauri wrapper for PaddleOCR", () => {
    expect(tauriApiSource).toContain("export interface PaddleOcrRequestPayload");
    expect(tauriApiSource).toContain("export interface PaddleOcrResponse");
    expect(tauriApiSource).toContain("preprocess_mode: \"off\" | \"auto\" | \"manual\";");
    expect(tauriApiSource).toContain("preprocessing_mode: \"off\" | \"auto\" | \"manual\";");
    expect(tauriApiSource).toContain("quality_metrics:");
    expect(tauriApiSource).toContain("return invoke<PaddleOcrResponse>(\"run_paddle_ocr\"");
  });

  it("runs PaddleOCR with optional PP-Structure from the app flow", () => {
    expect(appSource).toContain("Enable PP-Structure layout analysis? (yes|no):");
    expect(appSource).toContain("const includeStructure = includeStructureNormalized === \"yes\";");
    expect(appSource).toContain("const result = await runPaddleOcr({");
    expect(appSource).toContain("include_structure: includeStructure");
    expect(appSource).toContain("preprocess_mode: ocrPolicy.mode");
    expect(appSource).toContain("preprocess_steps: ocrPolicy.steps");
    expect(appSource).toContain("structureBlocks: result.structure_blocks.length");
    expect(appSource).toContain("preprocessingApplied: result.preprocessing_applied");
  });

  it("registers the backend OCR command in the invoke handler", () => {
    expect(rustSource).toContain("fn run_paddle_ocr(payload: PaddleOcrRequest)");
    expect(rustSource).toContain("run_paddle_ocr_command(request_id, payload)");
    expect(rustSource).toContain("run_paddle_ocr,");
    expect(rustOcrSource).toContain(".arg(\"--preprocess-mode\")");
    expect(rustOcrSource).toContain(".arg(\"--preprocess-steps\")");
    expect(rustOcrSource).toContain(".arg(\"--auto-confidence-threshold\")");
  });
});
