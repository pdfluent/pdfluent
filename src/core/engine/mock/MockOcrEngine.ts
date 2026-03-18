// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { AsyncEngineResult } from '../types';
import type { OcrEngine, OcrPageResult, OcrRunOptions } from '../OcrEngine';

export class MockOcrEngine implements OcrEngine {
  isAvailable(): boolean {
    return true;
  }

  async runOcr(
    _imageBase64: string,
    pageIndex: number,
    options: OcrRunOptions
  ): AsyncEngineResult<OcrPageResult> {
    const result: OcrPageResult = {
      pageIndex,
      engine: 'mock',
      language: options.language,
      words: [
        { text: 'Mock', confidence: 0.99, x0: 10, y0: 10, x1: 60, y1: 30 },
        { text: 'OCR', confidence: 0.98, x0: 65, y0: 10, x1: 100, y1: 30 },
      ],
      text: 'Mock OCR',
      structureBlocks: [],
      averageConfidence: 0.985,
      preprocessingApplied: false,
      preprocessingMode: options.preprocessMode,
      preprocessingSteps: options.preprocessSteps ?? [],
      preprocessingReason: '',
      qualityMetrics: {
        contrast_stddev: 50.0,
        sharpness_laplacian_var: 200.0,
        skew_degrees: 0.0,
      },
    };
    return { success: true, value: result };
  }
}
