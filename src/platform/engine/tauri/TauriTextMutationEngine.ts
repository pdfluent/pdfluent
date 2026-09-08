// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * TauriTextMutationEngine — Phase 4 Batch 2 + Track G (G5/G6)
 *
 * Tauri IPC implementation of TextMutationEngineWithFormatting.
 *
 * Bridges the TypeScript text mutation contract to the Rust backend via
 * three Tauri commands:
 *
 *   replace_text_span  — parser-backed PDF text replacement via pdf-manip
 *   format_text_span   — font size + color write via pdf-text-format (G5)
 *   set_text_run_style — bold/italic via font substitution via pdf-manip (G6)
 *
 * IPC contract (field name mapping camelCase TypeScript → snake_case Rust/serde):
 *   replace:  { page_index, original_text, replacement_text, anchor? }
 *   format:   { page_index, original_text, font_size?, color? }
 *   style:    { page_index, original_text, bold?, italic? }
 *
 * Native-only note:
 *   PDFluent is a Tauri desktop app. Text writes are handled by Rust commands;
 *   browser/dev harnesses receive typed unsupported results and never mutate
 *   real PDF bytes.
 */

import { invokeCommand as invoke } from '../../../lib/commandBridge';
import type { TextReplaceResultWire } from '../../../lib/tauri-api';
import type { AsyncEngineResult } from '../../../core/engine/types';
import type {
  TextMutationEngineWithFormatting,
  ReplaceTextSpanRequest,
  ReplaceTextSpanResult,
  FormatTextSpanRequest,
  FormatTextSpanResult,
  SetTextRunStyleRequest,
  SetTextRunStyleResult,
} from '../../../core/engine/TextMutationEngine';

// ---------------------------------------------------------------------------
// Rust backend request/response shapes (snake_case from serde)
// ---------------------------------------------------------------------------

interface TauriReplaceTextSpanRequest {
  page_index: number;
  original_text: string;
  replacement_text: string;
  /**
   * Where the user was pointing, in PDF user space. Absent means "the first
   * occurrence"; present means the backend ranks the page's matches against it.
   */
  anchor?: { x: number; y: number; width: number; height: number };
}

/**
 * The backend result. Its key list lives in `src/lib/textSpanWireContract.ts`
 * and is bound to this type at compile time, so a rename on either side of the
 * IPC stops the build instead of quietly delivering `undefined`.
 */
type TauriReplaceTextSpanResult = TextReplaceResultWire;

// G5 — format_text_span

interface TauriFormatTextSpanRequest {
  page_index: number;
  original_text: string;
  font_size: number | null;
  color: [number, number, number] | null;
}

interface TauriFormatTextSpanResult {
  formatted: boolean;
  reason: string | null;
}

// G6 — set_text_run_style

interface TauriSetTextRunStyleRequest {
  page_index: number;
  original_text: string;
  bold: boolean | null;
  italic: boolean | null;
}

interface TauriSetTextRunStyleResult {
  styled: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Tauri-backed implementation of TextMutationEngineWithFormatting.
 *
 * replaceTextSpan:
 *   Uses the SDK's pdf_manip::text_edit session (find -> stage -> commit) so
 *   one addressable occurrence changes, and the writer's own report -- which
 *   occurrence, which font, whether a font stood in -- comes back with it.
 *
 * formatTextSpan — Track G5:
 *   Uses pdf-text-format::format_text_run via extract_page_text_runs match.
 *   Injects q/rg/Tf … Q/Tf operators for state-isolated size + color changes.
 *
 * setTextRunStyle — Track G6:
 *   Uses pdf-manip::text_style::set_text_run_style.
 *   Swaps the Tf font reference to the bold/italic variant in the xref.
 *   Returns { styled: false, reason: 'font-variant-not-embedded' } when absent.
 */
export class TauriTextMutationEngine implements TextMutationEngineWithFormatting {
  // ---- Parser-backed text replacement ----

  async replaceTextSpan(request: ReplaceTextSpanRequest): AsyncEngineResult<ReplaceTextSpanResult> {
    const tauriRequest: TauriReplaceTextSpanRequest = {
      page_index: request.pageIndex,
      original_text: request.originalText,
      replacement_text: request.replacementText,
      ...(request.target?.rect && { anchor: request.target.rect }),
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
          detail: result.detail,
          occurrenceIndex: result.occurrence_index,
          occurrenceCount: result.occurrence_count,
          fontUsed: result.font_used,
          fontSubstituted: result.font_substituted,
          fitApplied: result.fit_applied,
          signaturesPresent: result.signatures_present,
          tagsAffected: result.tags_affected,
          diagnostics: result.diagnostics,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: { code: 'internal-error', message: String(e) },
      };
    }
  }

  // ---- Track G5 — font size / color format ----

  async formatTextSpan(request: FormatTextSpanRequest): AsyncEngineResult<FormatTextSpanResult> {
    const tauriRequest: TauriFormatTextSpanRequest = {
      page_index: request.pageIndex,
      original_text: request.originalText,
      font_size: request.formatting.fontSize ?? null,
      color: request.formatting.color ?? null,
    };
    try {
      const result = await invoke<TauriFormatTextSpanResult>('format_text_span', {
        request: tauriRequest,
      });
      return {
        success: true,
        value: {
          formatted: result.formatted,
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

  // ---- Track G6 — bold / italic font substitution ----

  async setTextRunStyle(request: SetTextRunStyleRequest): AsyncEngineResult<SetTextRunStyleResult> {
    const tauriRequest: TauriSetTextRunStyleRequest = {
      page_index: request.pageIndex,
      original_text: request.originalText,
      bold: request.style.bold ?? null,
      italic: request.style.italic ?? null,
    };
    try {
      const result = await invoke<TauriSetTextRunStyleResult>('set_text_run_style', {
        request: tauriRequest,
      });
      return {
        success: true,
        value: {
          styled: result.styled,
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
 * Returns the full TextMutationEngineWithFormatting interface (G5 + G6 included).
 */
let _instance: TauriTextMutationEngine | null = null;

export function getTauriTextMutationEngine(): TauriTextMutationEngine {
  if (!_instance) {
    _instance = new TauriTextMutationEngine();
  }
  return _instance;
}
