// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Support Classification — Phase 4 Batch 1, extended Phase 5 Batch 9
 *
 * Classifies whether a text target is structurally safe to mutate (write back
 * to the PDF document). This is distinct from textEditability.ts, which answers
 * "can the user enter edit mode?" — this module answers "can we safely persist
 * a text change to the PDF structure?"
 *
 * Phase 4 MVP writable class ("writable_digital_text"):
 *   - Source is 'digital' (not OCR)
 *   - Exactly one line with exactly one span (single font run)
 *   - Text content is not empty
 *   - Replacement text is equal-or-shorter (no reflow required)
 *
 * Explicit encoding assumptions (Phase 4):
 *   - We assume WinAnsi or MacRoman encoding for single-span Latin text.
 *   - We do NOT inspect the actual PDF encoding object in this phase.
 *     CID fonts, custom encodings, and Identity-H/V are treated as unknown.
 *   - If the Rust mutation backend encounters an unsupported encoding,
 *     it rejects the write with a specific error rather than corrupting the file.
 *
 * Explicit non-goals (deferred to later phases):
 *   - Multi-span paragraphs: different font runs, complex kerning, spacing
 *   - Multi-line paragraphs: reflow and line spacing recalculation
 *   - Arbitrary font substitution: requires font metrics and layout engine
 *   - Longer replacement text: potential overflow and reflow
 *   - OCR text mutation: overlay write is a separate, unrelated pipeline
 *   - Protected / encrypted document detection: delegated to Rust layer
 *
 * Save-safety notes:
 *   - ONLY writable_digital_text targets are ever sent to the mutation backend.
 *   - All other classification paths leave the PDF untouched.
 *   - validateReplacement() MUST be called before invoking the backend.
 *     A failed validation prevents any Tauri IPC call.
 *   - If the backend rejects the mutation (e.g. encoding mismatch, font issue),
 *     the error is surfaced through the existing errorCenter, never swallowed.
 */

import type { TextParagraphTarget } from './textInteractionModel';
import { ESTIMATED_CHAR_WIDTH_RATIO } from './textMutationFidelity';
import i18n from '../../i18n';

// ---------------------------------------------------------------------------
// Support class
// ---------------------------------------------------------------------------

/**
 * Classification of a text target's mutation support level.
 *
 * Only 'writable_digital_text' should be sent to the mutation backend.
 * All other classes are read-only from the mutation perspective.
 */
export type TextMutationSupportClass =
  /** Safe to attempt real PDF mutation via the mutation backend. */
  | 'writable_digital_text'
  /**
   * Digital source but structure not yet supported in Phase 4.
   * Includes: multi-span, multi-line, or complex layout paragraphs.
   */
  | 'non_writable_digital_text'
  /**
   * OCR-derived text. Mutation to the underlying PDF is not meaningful —
   * OCR text is an overlay, not embedded PDF text operators.
   */
  | 'ocr_read_only'
  /**
   * Document or content is protected / locked.
   * Phase 4: this class is primarily signalled by the Rust layer.
   * TypeScript-side detection is limited to what structural metadata reveals.
   */
  | 'protected_or_locked'
  /** Structure could not be classified; treat as read-only by default. */
  | 'unknown_structure';

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

/** Machine-readable reason for a mutation support decision. */
export type MutationSupportReason =
  | 'single-span-digital'     // → writable_digital_text
  | 'multi-span-unsupported'  // → non_writable_digital_text
  | 'multi-line-unsupported'  // → non_writable_digital_text
  | 'empty-content'           // → non_writable_digital_text / unknown_structure
  | 'ocr-source'              // → ocr_read_only
  | 'protected-content'       // → protected_or_locked
  | 'unknown-source';         // → unknown_structure

// ---------------------------------------------------------------------------
// Mutation constraints
// ---------------------------------------------------------------------------

/**
 * Constraints that apply when a target is writable.
 * MUST be validated via validateReplacement() before invoking the backend.
 */
export interface MutationConstraints {
  /**
   * Maximum character count of the replacement text.
   * Set to the original text length to prevent reflow in Phase 4.
   * Null means no explicit limit (unused in Phase 4 MVP).
   *
   * Rationale: PDF text operators encode character positions and advance
   * widths relative to the original glyph sequence. A longer replacement
   * would overflow the original slot, causing visual corruption.
   */
  readonly maxLength: number | null;
  /**
   * Assumed encoding class for this target.
   *
   * Phase 4 assumption: all single-span digital text is treated as
   * standard Latin encoding (WinAnsi or MacRoman). This assumption holds
   * for the majority of western-language PDFs. Non-Latin text (CJK, Arabic,
   * Hebrew) or specially-encoded fonts may use CID or custom encodings —
   * the Rust backend will reject those gracefully without file corruption.
   */
  readonly assumedEncoding: 'standard-latin' | 'unknown';
  /**
   * Extra characters allowed beyond maxLength when bbox space permits.
   *
   * Phase 5 Batch 9: safe capability expansion.
   * When the span's bounding box is wider than the estimated original text width,
   * the unused space can absorb a few extra characters. Defaults to 0 (Phase 4
   * strict equality behaviour is preserved when not supplied).
   *
   * Use computeBboxExpansionChars() to derive this value from span geometry.
   */
  readonly expansionChars?: number;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface TextMutationSupportResult {
  readonly supportClass: TextMutationSupportClass;
  readonly reasonCode: MutationSupportReason;
  /** Human-readable label (Dutch UI language). */
  readonly label: string;
  /** Whether real PDF mutation should be attempted for this target. */
  readonly writable: boolean;
  /**
   * Mutation constraints to enforce before sending to the backend.
   * Always null when writable is false.
   */
  readonly constraints: MutationConstraints | null;
}

// ---------------------------------------------------------------------------
// Replacement validation
// ---------------------------------------------------------------------------

export interface ReplacementValidation {
  readonly valid: boolean;
  /** Machine-readable reason code. */
  readonly reasonCode: string;
  /** Human-readable message (Dutch). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Dutch labels
// ---------------------------------------------------------------------------

const SUPPORT_LABELS: Record<TextMutationSupportClass, string> = {
  'writable_digital_text':
    'Tekst kan worden bewerkt en opgeslagen in de PDF',
  'non_writable_digital_text':
    'Digitale tekst met een te complexe structuur voor directe bewerking',
  'ocr_read_only':
    'OCR-tekst kan niet worden teruggeschreven naar de PDF',
  'protected_or_locked':
    i18n.t('textMutation.protectedLocked'),
  'unknown_structure':
    'Tekststructuur kon niet worden geclassificeerd — bewerking niet beschikbaar',
};

// ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

/**
 * Classify the mutation support level of a text paragraph target.
 *
 * Pure structural analysis — does NOT consider viewer mode or active tools.
 * Those concerns belong to textEditability.ts.
 *
 * Intended call site: after confirming the target is 'editable' per
 * textEditability, and before invoking the mutation backend.
 */
export function getMutationSupport(target: TextParagraphTarget): TextMutationSupportResult {
  // OCR targets: mutation is meaningless — OCR text is an overlay
  if (target.source === 'ocr') {
    return unsupported('ocr_read_only', 'ocr-source');
  }

  // Non-digital, non-OCR source (future-proofing) — classify as unknown
  if (target.source !== 'digital') {
    return unsupported('unknown_structure', 'unknown-source');
  }

  // Empty structure guard
  const totalSpans = target.lines.reduce((n, l) => n + l.spans.length, 0);
  if (totalSpans === 0) {
    return unsupported('unknown_structure', 'empty-content');
  }

  // MVP constraint: exactly one line
  // Multi-line paragraphs have reflow implications that Phase 4 cannot
  // safely handle. Each line may have independent font metrics and spacing.
  if (target.lines.length !== 1) {
    return unsupported('non_writable_digital_text', 'multi-line-unsupported');
  }

  const line = target.lines[0]!;

  // MVP constraint: exactly one span
  // Multi-span lines contain multiple font runs. Replacing a subset of spans
  // without access to the full layout engine risks corrupting glyph positions.
  if (line.spans.length !== 1) {
    return unsupported('non_writable_digital_text', 'multi-span-unsupported');
  }

  const span = line.spans[0]!;

  // Single-span, single-line digital text — Phase 4 MVP writable target
  return {
    supportClass: 'writable_digital_text',
    reasonCode: 'single-span-digital',
    label: SUPPORT_LABELS['writable_digital_text'],
    writable: true,
    constraints: {
      // Replacement must not exceed original length to prevent reflow
      maxLength: span.text.length,
      // Phase 4 assumption: standard Latin encoding
      assumedEncoding: 'standard-latin',
    },
  };
}

// ---------------------------------------------------------------------------
// Replacement validation
// ---------------------------------------------------------------------------

/**
 * Validate a proposed replacement against the mutation constraints.
 *
 * Call this BEFORE invoking the mutation backend.
 * A failed validation must surface a reason to the user without
 * attempting any PDF write.
 *
 * @param originalText    - The text currently in the PDF span.
 * @param replacementText - The text the user wants to write.
 * @param constraints     - Constraints from getMutationSupport().
 */
export function validateReplacement(
  originalText: string,
  replacementText: string,
  constraints: MutationConstraints,
): ReplacementValidation {
  // No-change shortcut — valid, but caller should skip the write
  if (replacementText === originalText) {
    return {
      valid: true,
      reasonCode: 'no-change',
      message: 'Geen wijzigingen — tekst is identiek aan het origineel.',
    };
  }

  // Empty replacement: not allowed via this path.
  // Users who want to remove content should use the redaction tool.
  if (replacementText.trim().length === 0) {
    return {
      valid: false,
      reasonCode: 'empty-replacement',
      message:
        'Vervangende tekst mag niet leeg zijn. Gebruik het redactiegereedschap om inhoud te verwijderen.',
    };
  }

  // Length constraint: replacement must not exceed original (+ optional bbox tolerance)
  const effectiveMax = constraints.maxLength !== null
    ? constraints.maxLength + (constraints.expansionChars ?? 0)
    : null;
  if (effectiveMax !== null && replacementText.length > effectiveMax) {
    return {
      valid: false,
      reasonCode: 'replacement-too-long',
      message:
        `Vervangende tekst (${replacementText.length} tekens) is langer dan het origineel ` +
        `(${constraints.maxLength} tekens). Gebruik kortere tekst om opmaakproblemen te voorkomen.`,
    };
  }

  return {
    valid: true,
    reasonCode: 'valid',
    message: 'Vervangende tekst voldoet aan alle eisen.',
  };
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/** True when the target can be sent to the real mutation backend. */
export function isWritable(target: TextParagraphTarget): boolean {
  return getMutationSupport(target).writable;
}

/**
 * True when the target is digital but its structure is not yet supported
 * by the Phase 4 mutation backend.
 */
export function isNonWritableDigital(target: TextParagraphTarget): boolean {
  return getMutationSupport(target).supportClass === 'non_writable_digital_text';
}

// ---------------------------------------------------------------------------
// Bbox expansion — Phase 5 Batch 9
// ---------------------------------------------------------------------------

/**
 * Compute how many extra characters the span's bounding box can absorb
 * beyond the original text length.
 *
 * Uses the ESTIMATED_CHAR_WIDTH_RATIO heuristic from textMutationFidelity:
 *   estimatedWidth = charCount * fontSize * ESTIMATED_CHAR_WIDTH_RATIO
 *
 * The spare space is: span.rect.width - estimatedOriginalWidth
 * Extra chars = floor(spareSpace / (fontSize * ESTIMATED_CHAR_WIDTH_RATIO))
 *
 * Returns 0 when:
 *   - Estimated width already exceeds bbox (tight fit or small font)
 *   - Target is not a writable single-span target
 *
 * This value can be passed as `expansionChars` in MutationConstraints to
 * enable safe capability expansion beyond the strict Phase 4 equal-or-shorter rule.
 */
export function computeBboxExpansionChars(target: TextParagraphTarget): number {
  if (target.lines.length !== 1) return 0;
  const line = target.lines[0];
  if (!line || line.spans.length !== 1) return 0;
  const span = line.spans[0];
  if (!span || !span.text || span.text.length === 0) return 0;

  const charWidth = span.fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
  const estimatedOriginalWidth = span.text.length * charWidth;
  const spareWidth = span.rect.width - estimatedOriginalWidth;
  if (spareWidth <= 0) return 0;

  return Math.floor(spareWidth / charWidth);
}

// ---------------------------------------------------------------------------
// Internal factory
// ---------------------------------------------------------------------------

function unsupported(
  supportClass: Exclude<TextMutationSupportClass, 'writable_digital_text'>,
  reasonCode: MutationSupportReason,
): TextMutationSupportResult {
  return {
    supportClass,
    reasonCode,
    label: SUPPORT_LABELS[supportClass],
    writable: false,
    constraints: null,
  };
}
