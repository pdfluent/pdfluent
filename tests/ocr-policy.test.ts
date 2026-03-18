// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import {
  buildOcrPolicy,
  normalizeManualPreprocessSteps,
} from "../src/lib/ocr-policy";

describe("ocr policy", () => {
  it("normalizes and deduplicates manual preprocessing steps", () => {
    const steps = normalizeManualPreprocessSteps([
      "deskew",
      "DENOISE",
      "contrast",
      "contrast",
      "invalid",
    ]);
    expect(steps).toEqual(["deskew", "denoise", "contrast"]);
  });

  it("skips pages with native text by default", () => {
    const policy = buildOcrPolicy({
      mode: "auto",
      manualSteps: [],
      forceOnTextPages: false,
      pageAssessments: [
        { pageIndex: 0, extractableTextLength: 32 },
        { pageIndex: 1, extractableTextLength: 0 },
      ],
    });

    expect(policy.shouldRunPages).toEqual([1]);
    expect(policy.skippedPages).toEqual([
      { pageIndex: 0, reason: "native_text_detected" },
    ]);
  });

  it("forces OCR on text pages when explicitly requested", () => {
    const policy = buildOcrPolicy({
      mode: "manual",
      manualSteps: [],
      forceOnTextPages: true,
      pageAssessments: [{ pageIndex: 0, extractableTextLength: 120 }],
    });

    expect(policy.shouldRunPages).toEqual([0]);
    expect(policy.skippedPages).toEqual([]);
    expect(policy.steps).toEqual(["deskew", "denoise", "contrast"]);
  });
});
