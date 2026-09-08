// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Engine Interface — Phase 4 Batch 2
 *
 * Defines the narrow backend contract for real text mutation.
 *
 * Parser-backed desktop contract: only one conservative target shape is sent
 * from the V3 editor —
 *   - Single text span replacement
 *   - Same page, same target span (no cross-paragraph changes)
 *   - Digital text only (not OCR)
 *
 * The TypeScript side is responsible for:
 *   1. Classifying the target (textMutationSupport.ts)
 *   2. Validating the replacement (validateReplacement)
 *   3. Calling replaceTextSpan only after both checks pass
 *
 * The backend is responsible for:
 *   1. Parsing the page content stream and font map
 *   2. Decoding/re-encoding Tj/TJ text runs safely
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
 *                   Used as the search key. The occurrence nearest `target.rect`
 *                   is replaced, or the first one when no rect is sent.
 *                   Must not be empty.
 *   replacementText — The exact new text to write. The native parser-backed
 *                     writer owns encoding/layout safety and returns a typed
 *                     rejection when the replacement cannot be encoded safely.
 */
export interface ReplaceTextSpanRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the span to replace. Used as search key (first occurrence). */
  originalText: string;
  /** New text to write. */
  replacementText: string;
  /**
   * PDF-space metadata about the span the user pointed at.
   *
   * `rect` is the anchor: when the page shows the same text more than once,
   * it is the only thing that says which occurrence was edited. PDF user
   * space, y up — the space `get_page_text_spans` reports in. Omitting it
   * means "the first occurrence", which is what batch callers want.
   */
  target?: {
    rect: { x: number; y: number; width: number; height: number };
    fontSize?: number;
    color?: [number, number, number];
    isBold?: boolean;
    isItalic?: boolean;
  };
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
 *   'text-not-found-in-content-stream'  — original text not in any content stream
 *   'no-content-stream'                 — page has no content streams
 *   'empty-original-text'               — originalText was empty
 *   'page-not-found'                    — pageIndex out of range
 *   'encoding-not-supported'            — the replacement cannot be encoded in this font
 *   'document-signed'                   — the document carries a digital signature
 *   'permissions-denied'                — document permissions forbid content modification
 *   'tagged-text-conflict'              — /ActualText covers the match and would disagree
 *   'unsupported-container'             — the text lives in a form XObject or a shared stream
 *   'mixed-style-span'                  — the match spans more than one font or size
 *
 * The report fields below are the writer's decisions. They are optional
 * because a browser/dev harness has no writer to report any, not because a
 * desktop commit may leave them out.
 */
export interface ReplaceTextSpanResult {
  /** True when the content stream was mutated. */
  readonly replaced: boolean;
  /** Machine-readable reason when replaced is false. Null when replaced is true. */
  readonly reason: string | null;
  /** The engine's own sentence, for the banner and a support bundle. */
  readonly detail?: string | null;
  /** 0-based position of the edited occurrence among the page's matches. */
  readonly occurrenceIndex?: number | null;
  /** How many occurrences of the searched text the page held. */
  readonly occurrenceCount?: number | null;
  /** Resource name of the font that wrote the replacement. */
  readonly fontUsed?: string | null;
  /** True when a standard font stood in for the original. Never silent. */
  readonly fontSubstituted?: boolean | null;
  /** Fit policy applied, lower-case (`"exact"`). */
  readonly fitApplied?: string | null;
  /** Whether the document carries digital signatures. */
  readonly signaturesPresent?: boolean | null;
  /**
   * Whether this edit destroyed the document's Reader-enablement (`/Perms
   * /UR3`) signature. True is not a failure — the edit landed — but it is a
   * cost the user has to be told about, because nothing else on the page shows
   * it. Null where no writer reported (a browser harness).
   */
  readonly usageRightsInvalidated?: boolean | null;
  /** Whether the edited page participates in a structure tree. */
  readonly tagsAffected?: boolean | null;
  /** Coded observations from the writer. */
  readonly diagnostics?: ReadonlyArray<{ code: string; message: string }>;
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
   * Parser-backed desktop constraints:
   *   - Page content streams are parsed natively
   *   - Tj/TJ text runs are decoded through the page font map
   *   - Replacement text is re-encoded into the matched font or a safe fallback
   *   - Unsupported encodings/fonts return typed rejections, never silent writes
   *
   * The caller MUST:
   *   1. Confirm the target is 'writable_digital_text' (textMutationSupport.ts)
   *   2. Validate the replacement via validateReplacement() before calling
   *   3. Mark the document dirty and emit an event log entry after success
   */
  replaceTextSpan(request: ReplaceTextSpanRequest): AsyncEngineResult<ReplaceTextSpanResult>;
}

// ---------------------------------------------------------------------------
// Format request / response — SDK Track G contract (interface only)
// ---------------------------------------------------------------------------

/**
 * Request to change the visual formatting of a text span in the PDF content stream.
 *
 * SDK Track G will implement the Tauri command that fulfils this contract.
 * Until `sdkTextFormatWrites = true`, calling formatTextSpan is not available.
 */
export interface FormatTextSpanRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the span (used as search key, same as replaceTextSpan). */
  originalText: string;
  /** Formatting changes to apply. Only specified fields are changed. */
  formatting: {
    /** New font size in points. */
    fontSize?: number;
    /** New fill color RGB in [0.0, 1.0]. */
    color?: [number, number, number];
  };
}

export interface FormatTextSpanResult {
  readonly formatted: boolean;
  readonly reason: string | null;
  /** C8 error code when formatted is false (e.g. `'E-ENV-DESKTOP-NATIVE-REQUIRED'`). */
  readonly code?: string;
}

/**
 * Request to change formatting for a substring inside one PDF text run.
 *
 * Offsets are JavaScript string offsets into `originalText`. This is used by
 * the inline editor when the user selects a word inside the inline
 * contenteditable surface and applies a color.
 */
export interface FormatTextRangeRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the PDF run that contains the selected range. */
  originalText: string;
  /** Inclusive start offset inside originalText. */
  startOffset: number;
  /** Exclusive end offset inside originalText. */
  endOffset: number;
  /** Formatting changes to apply to the selected range. */
  formatting: {
    /** New fill color RGB in [0.0, 1.0]. */
    color?: [number, number, number];
    /** New font size in points. */
    fontSize?: number;
    /** Set bold on or off. */
    bold?: boolean;
    /** Set italic on or off. */
    italic?: boolean;
    /** Draw an underline for the selected range. */
    underline?: boolean;
    /** Draw a strikethrough for the selected range. */
    strikethrough?: boolean;
  };
}

export interface FormatTextRangesRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the PDF run that contains all selected ranges. */
  originalText: string;
  /** One or more non-empty ranges inside originalText. */
  ranges: ReadonlyArray<Omit<FormatTextRangeRequest, 'pageIndex' | 'originalText'>>;
}

// ---------------------------------------------------------------------------
// Style request / response — SDK Track G6 contract (bold / italic writes)
// ---------------------------------------------------------------------------

/**
 * Request to change the bold/italic style of a text span via font substitution.
 *
 * Tauri-desktop only. The PDF must already contain the target font variant in
 * its xref table. Returns `styled: false` with reason `'font-variant-not-embedded'`
 * when the variant is absent (document is left unmodified).
 */
export interface SetTextRunStyleRequest {
  /** 0-based page index. */
  pageIndex: number;
  /** Exact text of the span (used as search key, same as replaceTextSpan). */
  originalText: string;
  /** Style changes to apply. At least one of bold/italic must be specified. */
  style: {
    /** Set bold on or off. Omit to leave as-is. */
    bold?: boolean;
    /** Set italic on or off. Omit to leave as-is. */
    italic?: boolean;
  };
}

export interface SetTextRunStyleResult {
  readonly styled: boolean;
  /**
   * Machine-readable reason when styled is false:
   *   'font-variant-not-embedded'          — the requested bold/italic variant is not in the xref
   *   'text-not-found'                     — originalText not found in the page's content streams
   *   'page-not-found'                     — pageIndex out of range
   *   'internal-error'                     — unexpected backend failure
   *   'desktop-native-runtime-required'      — native Tauri runtime is required
   */
  readonly reason: string | null;
  /** C8 error code when styled is false (e.g. `'E-ENV-DESKTOP-NATIVE-REQUIRED'`). */
  readonly code?: string;
}

/**
 * Extended TextMutationEngine interface that includes format and style writes.
 *
 * Implementations:
 *   - TauriTextMutationEngine: Tauri IPC path for the desktop product.
 *   - DesktopRequiredTextMutationEngine: typed unsupported fallback for
 *     browser-test harnesses.
 *
 * Feature gates in editorTextSpan.ts decide which implementation's capabilities
 * are surfaced to the UI based on isTauriEnvironment().
 */
export interface TextMutationEngineWithFormatting extends TextMutationEngine {
  /**
   * Apply visual formatting changes to a text span in the PDF content stream.
   *
   * Track G5 constraints:
   * - Only simple Tf + rg operator sequences are handled
   * - Returns { formatted: false, reason: 'complex-graphics-state' } for others
   * - Font size and color only — bold/italic via font substitution is G6 below
   */
  formatTextSpan(request: FormatTextSpanRequest): AsyncEngineResult<FormatTextSpanResult>;

  /**
   * Apply color formatting to an exact substring of a text run.
   *
   * This is intentionally separate from formatTextSpan because SDK G5 targets
   * whole runs by run index. The inline editor needs selection-level writes.
   */
  formatTextRange?(request: FormatTextRangeRequest): AsyncEngineResult<FormatTextSpanResult>;

  /** Apply formatting to one or more selected ranges inside the same text run. */
  formatTextRanges?(request: FormatTextRangesRequest): AsyncEngineResult<FormatTextSpanResult>;

  /**
   * Apply bold/italic style to a text span via font substitution.
   *
   * Track G6 constraints:
   * - Font variant must be embedded in the PDF xref (no system font injection)
   * - No synthetic bold (no Tr mode manipulation)
   * - Only the first occurrence of originalText is targeted
   * - Document is left unmodified when the variant is absent
   */
  setTextRunStyle(request: SetTextRunStyleRequest): AsyncEngineResult<SetTextRunStyleResult>;
}
