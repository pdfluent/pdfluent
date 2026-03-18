// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Engine Interface — Phase 4 Batch 2
 *
 * Defines the narrow backend contract for real text mutation.
 *
 * Phase 4 MVP contract: only one shape is supported —
 *   - Single text span replacement
 *   - Equal-or-shorter replacement text (no reflow)
 *   - Same page, same target span (no cross-paragraph changes)
 *   - Digital text only (not OCR)
 *
 * The TypeScript side is responsible for:
 *   1. Classifying the target (textMutationSupport.ts)
 *   2. Validating the replacement (validateReplacement)
 *   3. Calling replaceTextSpan only after both checks pass
 *
 * The backend is responsible for:
 *   1. Finding the actual text operator in the content stream
 *   2. Replacing the text bytes safely
 *   3. Marking the document as modified
 *   4. Returning honest errors when replacement is not possible
 *
 * This interface is intentionally narrow. It does NOT cover:
 *   - Multi-span replacements
 *   - Text reflow
 *   - Font substitution
 *   - OCR text mutation
 *   - Batch / multi-paragraph operations
 */

import type { AsyncEngineResult } from './types';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/**
 * Request to replace a single text span on a page.
 *
 * Field contract:
 *   pageIndex     — 0-based page index (matches TypeScript convention throughout)
 *   originalText  — The exact text currently in the PDF span.
 *                   Used as the search key. First occurrence in the content
 *                   stream is replaced. Must not be empty.
 *   replacementText — The new text to write. Must be ≤ originalText.length
 *                     characters. Shorter text is padded with trailing spaces
 *                     to preserve glyph advance widths and prevent reflow.
 */
export interface ReplaceTextSpanRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the span to replace. Used as search key (first occurrence). */
  originalText: string;
  /** New text (must be equal-or-shorter than originalText). */
  replacementText: string;
}

/**
 * Result of a text span replacement attempt.
 *
 * replaced: true  → the text was found and the content stream was mutated.
 *                    The document is now dirty and requires save.
 * replaced: false → the text was not found, or the replacement was rejected.
 *                   The document is unchanged. reason explains why.
 *
 * Reason codes when replaced is false:
 *   'replacement-too-long'              — replacement.length > original.length
 *   'text-not-found-in-content-stream'  — original text not in any content stream
 *   'no-content-stream'                 — page has no content streams
 *   'empty-original-text'               — originalText was empty
 *   'page-not-found'                    — pageIndex out of range
 *   'encoding-not-supported'            — content stream encoding is unsupported
 */
export interface ReplaceTextSpanResult {
  /** True when the content stream was mutated. */
  readonly replaced: boolean;
  /** Machine-readable reason when replaced is false. Null when replaced is true. */
  readonly reason: string | null;
}

// ---------------------------------------------------------------------------
// Engine interface
// ---------------------------------------------------------------------------

/**
 * Text Mutation Engine
 *
 * Provides the minimal write path for real PDF text content mutation.
 * This is separate from the document/render/annotation sub-engines because
 * text mutation is an optional capability that will evolve independently.
 *
 * Only one method for Phase 4: replaceTextSpan.
 * Future phases may add: replaceTextSpanBatch, insertTextRun, deleteTextRun, etc.
 */
export interface TextMutationEngine {
  /**
   * Replace a single text span in a PDF page content stream.
   *
   * Phase 4 MVP constraints:
   *   - Replacement must be equal-or-shorter (no reflow)
   *   - Only simple Tj operators are handled (not TJ arrays or hex strings)
   *   - Only the first occurrence of originalText is replaced
   *   - Encoding is assumed to be standard Latin (WinAnsi/MacRoman)
   *
   * The caller MUST:
   *   1. Confirm the target is 'writable_digital_text' (textMutationSupport.ts)
   *   2. Validate the replacement via validateReplacement() before calling
   *   3. Mark the document dirty and emit an event log entry after success
   */
  replaceTextSpan(request: ReplaceTextSpanRequest): AsyncEngineResult<ReplaceTextSpanResult>;
}
