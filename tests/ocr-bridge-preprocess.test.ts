// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridgeSource = readFileSync(
  new URL("../src-tauri/scripts/paddle_ocr_bridge.py", import.meta.url),
  "utf8",
);

describe("paddle OCR preprocess bridge", () => {
  it("supports preprocess mode and step arguments", () => {
    expect(bridgeSource).toContain("--preprocess-mode");
    expect(bridgeSource).toContain("--preprocess-steps");
    expect(bridgeSource).toContain("--auto-confidence-threshold");
    expect(bridgeSource).toContain("choices=[\"off\", \"auto\", \"manual\"]");
  });

  it("implements auto and manual preprocessing flows", () => {
    expect(bridgeSource).toContain("if preprocess_mode == \"manual\":");
    expect(bridgeSource).toContain("elif preprocess_mode == \"auto\":");
    expect(bridgeSource).toContain("should_preprocess_automatically");
    expect(bridgeSource).toContain("DEFAULT_PREPROCESS_STEPS");
  });

  it("returns confidence and quality metrics to the frontend", () => {
    expect(bridgeSource).toContain("\"average_confidence\": average_confidence");
    expect(bridgeSource).toContain("\"quality_metrics\": quality_metrics");
    expect(bridgeSource).toContain("\"preprocessing_applied\": preprocessing_applied");
    expect(bridgeSource).toContain("\"preprocessing_steps\": applied_preprocessing_steps");
  });
});
