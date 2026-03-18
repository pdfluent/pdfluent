// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * TauriTextMutationEngine — Phase 4 Batch 2
 *
 * Tauri IPC implementation of the TextMutationEngine interface.
 *
 * Bridges the TypeScript text mutation contract to the Rust backend via
 * the `replace_text_span` Tauri command. The Rust command performs the
 * actual content stream mutation using lopdf.
 *
 * IPC contract (Tauri command: "replace_text_span"):
 *   Request:  { request: { page_index, original_text, replacement_text } }
 *   Response: { replaced: bool, reason: string | null }
 *   Error:    Rust returns Err(String) → caught and wrapped as EngineResult failure
 *
 * Field name mapping (camelCase TypeScript → snake_case Rust/serde):
 *   pageIndex       → page_index
 *   originalText    → original_text
 *   replacementText → replacement_text
 */

import { invoke } from '@tauri-apps/api/core';
import type { AsyncEngineResult } from '../../../core/engine/types';
import type {
  TextMutationEngine,
  ReplaceTextSpanRequest,
  ReplaceTextSpanResult,
} from '../../../core/engine/TextMutationEngine';

// ---------------------------------------------------------------------------
// Rust backend response shape (snake_case from serde)
// ---------------------------------------------------------------------------

interface TauriReplaceTextSpanRequest {
  page_index: number;
  original_text: string;
  replacement_text: string;
}

interface TauriReplaceTextSpanResult {
  replaced: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Tauri-backed implementation of TextMutationEngine.
 *
 * Calls the Rust `replace_text_span` command, which:
 *   1. Locates the page content streams via lopdf
 *   2. Searches for the `(original_text) Tj` pattern
 *   3. Replaces it with `(replacement_text_padded) Tj`
 *   4. Calls sync_after_mutation() to keep the render view consistent
 *
 * Phase 4 Rust-side constraints (mirroring textMutationSupport.ts):
 *   - Only simple `Tj` text show operators (not `TJ` arrays, not hex strings)
 *   - Replacement padded to original length with trailing spaces
 *   - First occurrence only
 */
export class TauriTextMutationEngine implements TextMutationEngine {
  async replaceTextSpan(request: ReplaceTextSpanRequest): AsyncEngineResult<ReplaceTextSpanResult> {
    const tauriRequest: TauriReplaceTextSpanRequest = {
      page_index: request.pageIndex,
      original_text: request.originalText,
      replacement_text: request.replacementText,
    };
    try {
      const result = await invoke<TauriReplaceTextSpanResult>('replace_text_span', {
        request: tauriRequest,
      });
      return {
        success: true,
        value: {
          replaced: result.replaced,
          reason: result.reason,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: { code: 'internal-error', message: String(e) },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/**
 * Singleton instance for use by the viewer layer.
 * Created lazily so it does not require Tauri availability at module load time.
 */
let _instance: TauriTextMutationEngine | null = null;

export function getTauriTextMutationEngine(): TauriTextMutationEngine {
  if (!_instance) {
    _instance = new TauriTextMutationEngine();
  }
  return _instance;
}
