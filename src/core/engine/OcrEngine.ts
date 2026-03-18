// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// OCR Engine Interface
// ---------------------------------------------------------------------------

import type { AsyncEngineResult } from './types';

export type OcrPreprocessMode = 'off' | 'auto' | 'manual';
export type OcrPreprocessStep = 'deskew' | 'denoise' | 'contrast';

export interface OcrWordResult {
  readonly text: string;
  readonly confidence: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface OcrStructureBlock {
  readonly kind: string;
  readonly text: string;
  readonly confidence: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface OcrQualityMetrics {
  readonly contrast_stddev: number;
  readonly sharpness_laplacian_var: number;
  readonly skew_degrees: number;
}

export interface OcrPageResult {
  readonly pageIndex: number;
  readonly engine: string;
  readonly language: string;
  readonly words: readonly OcrWordResult[];
  readonly text: string;
  readonly structureBlocks: readonly OcrStructureBlock[];
  readonly averageConfidence: number;
  readonly preprocessingApplied: boolean;
  readonly preprocessingMode: OcrPreprocessMode;
  readonly preprocessingSteps: readonly OcrPreprocessStep[];
  readonly preprocessingReason: string;
  readonly qualityMetrics: OcrQualityMetrics;
}

export interface OcrRunOptions {
  /** PaddleOCR language code (e.g. 'en', 'nl', 'de', 'fr'). */
  readonly language: string;
  /** Whether to run PP-Structure layout analysis. */
  readonly includeStructure: boolean;
  /** Preprocessing mode — off | auto | manual. */
  readonly preprocessMode: 'off' | 'auto' | 'manual';
  /** Steps to apply when preprocessMode is 'manual'. */
  readonly preprocessSteps?: readonly OcrPreprocessStep[];
  /** Confidence threshold for auto retry (default 0.72). */
  readonly autoConfidenceThreshold?: number;
}

/**
 * OcrEngine — runs OCR on a rendered page image and returns structured results.
 */
export interface OcrEngine {
  /**
   * Run OCR on a single page (identified by its rendered base64 image).
   *
   * @param imageBase64  Base64-encoded PNG of the rendered page.
   * @param pageIndex    0-based page index (for bookkeeping in the result).
   * @param options      Language, preprocessing, and structure options.
   */
  runOcr(
    imageBase64: string,
    pageIndex: number,
    options: OcrRunOptions
  ): AsyncEngineResult<OcrPageResult>;

  /**
   * Check whether the OCR engine is available in the current environment.
   */
  isAvailable(): boolean;
}
