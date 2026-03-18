// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { runPaddleOcr } from '../../../lib/tauri-api';
import type { AsyncEngineResult } from '../../../core/engine/types';
import type { OcrEngine, OcrPageResult, OcrRunOptions, OcrWordResult, OcrStructureBlock } from '../../../core/engine/OcrEngine';
import type { PaddleOcrWord, PaddleOcrStructureBlock } from '../../../lib/tauri-api';

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapWord(w: PaddleOcrWord): OcrWordResult {
  return {
    text: w.text,
    confidence: w.confidence,
    x0: w.x0,
    y0: w.y0,
    x1: w.x1,
    y1: w.y1,
  };
}

function mapStructureBlock(b: PaddleOcrStructureBlock): OcrStructureBlock {
  return {
    kind: b.kind,
    text: b.text,
    confidence: b.confidence,
    x0: b.x0,
    y0: b.y0,
    x1: b.x1,
    y1: b.y1,
  };
}

// ---------------------------------------------------------------------------
// TauriOcrEngine
// ---------------------------------------------------------------------------

export class TauriOcrEngine implements OcrEngine {
  isAvailable(): boolean {
    return true;
  }

  async runOcr(
    imageBase64: string,
    pageIndex: number,
    options: OcrRunOptions
  ): AsyncEngineResult<OcrPageResult> {
    try {
      const response = await runPaddleOcr({
        image_base64: imageBase64,
        language: options.language,
        include_structure: options.includeStructure,
        preprocess_mode: options.preprocessMode,
        preprocess_steps: options.preprocessSteps ? [...options.preprocessSteps] : undefined,
        auto_confidence_threshold: options.autoConfidenceThreshold,
      });

      const result: OcrPageResult = {
        pageIndex,
        engine: response.engine,
        language: response.language,
        words: response.words.map(w => mapWord(w as PaddleOcrWord)),
        text: response.text,
        structureBlocks: response.structure_blocks.map(b => mapStructureBlock(b as PaddleOcrStructureBlock)),
        averageConfidence: response.average_confidence,
        preprocessingApplied: response.preprocessing_applied,
        preprocessingMode: response.preprocessing_mode,
        preprocessingSteps: response.preprocessing_steps as OcrRunOptions['preprocessSteps'] ?? [],
        preprocessingReason: response.preprocessing_reason,
        qualityMetrics: response.quality_metrics,
      };

      return { success: true, value: result };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'internal-error',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
