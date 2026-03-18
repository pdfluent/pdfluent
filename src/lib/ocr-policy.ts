// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
export type OcrPreprocessMode = "off" | "auto" | "manual";
export type OcrPreprocessStep = "deskew" | "denoise" | "contrast";

export interface OcrPageAssessment {
  pageIndex: number;
  extractableTextLength: number;
}

export interface OcrPolicyInput {
  mode: OcrPreprocessMode;
  manualSteps: OcrPreprocessStep[];
  forceOnTextPages: boolean;
  pageAssessments: OcrPageAssessment[];
}

export interface OcrPolicyResult {
  mode: OcrPreprocessMode;
  steps: OcrPreprocessStep[];
  shouldRunPages: number[];
  skippedPages: Array<{ pageIndex: number; reason: string }>;
}

const DEFAULT_MANUAL_STEPS: OcrPreprocessStep[] = [
  "deskew",
  "denoise",
  "contrast",
];

export function normalizeManualPreprocessSteps(
  values: string[],
): OcrPreprocessStep[] {
  const allowed: OcrPreprocessStep[] = ["deskew", "denoise", "contrast"];
  const result: OcrPreprocessStep[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase() as OcrPreprocessStep;
    if (!allowed.includes(normalized)) continue;
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

export function buildOcrPolicy(input: OcrPolicyInput): OcrPolicyResult {
  const steps =
    input.mode === "manual"
      ? input.manualSteps.length > 0
        ? input.manualSteps
        : DEFAULT_MANUAL_STEPS
      : [];

  const shouldRunPages: number[] = [];
  const skippedPages: Array<{ pageIndex: number; reason: string }> = [];

  for (const page of input.pageAssessments) {
    if (!input.forceOnTextPages && page.extractableTextLength > 12) {
      skippedPages.push({
        pageIndex: page.pageIndex,
        reason: "native_text_detected",
      });
      continue;
    }
    shouldRunPages.push(page.pageIndex);
  }

  return {
    mode: input.mode,
    steps,
    shouldRunPages,
    skippedPages,
  };
}
