// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Messaging — Phase 4 Batch 5, extended Phase 5 Batch 7
 *
 * Maps mutation support classes and reason codes to user-facing UX messages.
 * Used by TextContextBar, TextInlineEditor, and ViewerApp error surfaces
 * to explain WHY a text target cannot be edited or why a commit was rejected.
 *
 * Phase 5 Batch 7 additions:
 * - protected-content and unknown-source reason mappings
 * - getFontEncodingMessage() for font-encoding-specific rejection UX
 * - getOverflowRiskMessage() for character overflow warnings
 * - Extended BackendRejectionCode: font-encoding-unsafe, glyph-risk-detected
 *
 * Keeps message strings in one place — no magic strings at call sites.
 * Backend rejection messages go through i18n; the support-class and
 * reason-code tables above them are still Dutch literals.
 */

import type {
  TextMutationSupportClass,
  MutationSupportReason,
  TextMutationSupportResult,
} from './textMutationSupport';
import type { FontEncodingClass } from './fontMutationSupport';
import i18n from '../../i18n';

// ---------------------------------------------------------------------------
// Messaging result
// ---------------------------------------------------------------------------

export interface MutationMessage {
  /** Short label suitable for a tooltip or inline badge. */
  readonly tooltip: string;
  /** Longer explanation suitable for a notice or error panel. */
  readonly explanation: string;
  /**
   * Whether the user can take a corrective action.
   * true  → show a "learn more" or action affordance
   * false → purely informational
   */
  readonly actionable: boolean;
}

/**
 * A rejected text edit, as the UI needs to show it: the engine's own code and
 * message alongside the sentence a person can act on. The code is kept because
 * a support bundle needs the machine-readable half; the banner prints both.
 */
export interface TextMutationRejection extends MutationMessage {
  /** One of BackendRejectionCode, or whatever the engine sent that was not. */
  readonly code: string;
  /** Verbatim engine message when the failure was thrown rather than typed. */
  readonly detail: string | null;
  /** The text the writer was asked to replace. */
  readonly originalText: string;
}

// ---------------------------------------------------------------------------
// Support class messages
// ---------------------------------------------------------------------------

const SUPPORT_CLASS_MESSAGES: Record<TextMutationSupportClass, MutationMessage> = {
  writable_digital_text: {
    tooltip: 'Edit text',
    explanation: 'This text can be edited and saved directly to the PDF.',
    actionable: false,
  },
  non_writable_digital_text: {
    tooltip: 'Complex text structure — not editable',
    explanation:
      'This text has a formatting structure that is too complex (several lines or fonts) ' +
      'to edit directly. Simple, single text blocks are editable.',
    actionable: false,
  },
  ocr_read_only: {
    tooltip: 'OCR text — read only',
    explanation:
      'This text was recognized by OCR and cannot be written back to the PDF. ' +
      'OCR text is an overlay on scanned content, not embedded PDF text.',
    actionable: false,
  },
  protected_or_locked: {
    tooltip: 'Protected document — editing blocked',
    explanation:
      'This document or its content is protected or locked. ' +
      i18n.t('textMutation.removeProtection'),
    actionable: true,
  },
  unknown_structure: {
    tooltip: 'Unknown text structure — not editable',
    explanation:
      'The structure of this text could not be determined. ' +
      'Editing is disabled to avoid damaging the PDF.',
    actionable: false,
  },
};

// ---------------------------------------------------------------------------
// Reason code messages (more specific than support class)
// ---------------------------------------------------------------------------

const REASON_CODE_MESSAGES: Partial<Record<MutationSupportReason, MutationMessage>> = {
  'multi-span-unsupported': {
    tooltip: 'Several fonts in one line — not editable',
    explanation:
      'This line of text has several segments with different fonts or styles. ' +
      'Only single text segments are editable for now.',
    actionable: false,
  },
  'multi-line-unsupported': {
    tooltip: 'Multi-line paragraph — not editable',
    explanation:
      'Multi-line paragraphs cannot be edited yet. ' +
      'Single lines without wrapping are editable.',
    actionable: false,
  },
  'ocr-source': {
    tooltip: 'OCR text — read only',
    explanation:
      'This text comes from OCR recognition and is not embedded in the PDF content stream. ' +
      i18n.t('textMutation.ocrCannotSave'),
    actionable: false,
  },
  'empty-content': {
    tooltip: 'Empty text — not editable',
    explanation: 'This text block has no content and cannot be edited.',
    actionable: false,
  },
  'protected-content': {
    tooltip: 'Protected content — editing blocked',
    explanation:
      'This text is protected or belongs to a locked form field. ' +
      i18n.t('textMutation.removeDocProtection'),
    actionable: true,
  },
  'unknown-source': {
    tooltip: 'Unknown text source — not editable',
    explanation:
      'The origin of this text could not be determined. ' +
      'Editing is disabled to avoid damaging the PDF.',
    actionable: false,
  },
};

// ---------------------------------------------------------------------------
// Backend error code messages
// ---------------------------------------------------------------------------

export type BackendRejectionCode =
  | 'replacement-too-long'
  | 'text-not-found-in-content-stream'
  | 'no-content-stream'
  | 'empty-original-text'
  | 'page-not-found'
  | 'encoding-not-supported'
  | 'font-encoding-unsafe'
  | 'glyph-risk-detected'
  | 'document-signed'
  | 'permissions-denied'
  | 'tagged-text-conflict'
  | 'unsupported-container'
  | 'mixed-style-span'
  | 'internal-error';

/**
 * The fourteen ways `replace_text_span` can decline, in the reader's language.
 *
 * These used to be Dutch string literals in this file. An English-speaking user
 * hitting a CID-encoded font got a sentence they could not read, which reaches
 * them no better than the "not replaced" it replaced. Read through i18n at call
 * time, not at module load: the language switcher would otherwise hand out
 * whatever locale was active when this module was first imported.
 */
function backendRejectionMessage(code: BackendRejectionCode): MutationMessage {
  return {
    tooltip: i18n.t(`textMutation.rejection.${code}.tooltip`),
    explanation: i18n.t(`textMutation.rejection.${code}.explanation`),
    actionable: ACTIONABLE_REJECTIONS.has(code),
  };
}

/** Rejections the user can do something about, as opposed to be informed of. */
const ACTIONABLE_REJECTIONS = new Set<BackendRejectionCode>([
  'replacement-too-long',
  'glyph-risk-detected',
  'internal-error',
  // A style span is the one refusal with an obvious next move: select less.
  'mixed-style-span',
]);

const KNOWN_REJECTION_CODES = new Set<BackendRejectionCode>([
  'replacement-too-long',
  'text-not-found-in-content-stream',
  'no-content-stream',
  'empty-original-text',
  'page-not-found',
  'encoding-not-supported',
  'font-encoding-unsafe',
  'glyph-risk-detected',
  'document-signed',
  'permissions-denied',
  'tagged-text-conflict',
  'unsupported-container',
  'mixed-style-span',
  'internal-error',
]);

// ---------------------------------------------------------------------------
// Font encoding messages — Phase 5 Batch 7
// ---------------------------------------------------------------------------

const FONT_ENCODING_MESSAGES: Record<FontEncodingClass, MutationMessage> = {
  standard_latin: {
    tooltip: 'Standard Latin encoding — safe',
    explanation: 'This font uses a standard Latin encoding (WinAnsi or MacRoman). Editing is possible.',
    actionable: false,
  },
  subset_embedded: {
    tooltip: 'Embedded subset font — safe',
    explanation: 'This font is embedded in the PDF as a subset. Editing is possible for characters in the subset.',
    actionable: false,
  },
  identity_h: {
    tooltip: 'Identity-H encoding — not editable',
    explanation:
      'This font uses Identity-H (CID-based glyph indices). ' +
      'Direct text replacement is not possible — the bytes are glyph indices, not Unicode.',
    actionable: false,
  },
  identity_v: {
    tooltip: 'Identity-V encoding — not editable',
    explanation:
      'This font uses Identity-V (vertical CID encoding). ' +
      'Direct text replacement is not possible.',
    actionable: false,
  },
  cid_keyed: {
    tooltip: 'CID font — not editable',
    explanation:
      'This font uses a CID-based CMap. ' +
      i18n.t('textMutation.requiresFontInspection'),
    actionable: false,
  },
  custom_encoding: {
    tooltip: 'Custom encoding — not editable',
    explanation:
      'This font uses a non-standard encoding. ' +
      'Directe tekstvarvanging is uitgeschakeld om beschadiging te voorkomen.',
    actionable: false,
  },
  unknown: {
    tooltip: 'Unknown encoding — not editable',
    explanation:
      'The encoding of this font could not be determined. ' +
      'Editing is disabled as a precaution.',
    actionable: false,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the user-facing message for a mutation support result.
 * Uses reason-code-level message when available; falls back to support-class message.
 */
export function getUnsupportedMessage(result: TextMutationSupportResult): MutationMessage {
  const reasonMsg = REASON_CODE_MESSAGES[result.reasonCode];
  if (reasonMsg) return reasonMsg;
  return SUPPORT_CLASS_MESSAGES[result.supportClass];
}

/**
 * Get the user-facing message for a backend rejection code.
 * Falls back to a generic internal-error message for unknown codes.
 */
export function getBackendRejectionMessage(code: string, detail?: string): MutationMessage {
  const known = KNOWN_REJECTION_CODES.has(code as BackendRejectionCode);
  const base = backendRejectionMessage(known ? (code as BackendRejectionCode) : 'internal-error');
  // What the engine actually said. An unrecognised code used to be swapped for
  // the generic internal-error text, so the one sentence that named the real
  // cause was the one thrown away -- and every rejection read the same.
  const raw = (detail ?? (known ? undefined : code))?.trim();
  if (!raw) return base;
  return {
    ...base,
    explanation: `${base.explanation} ${i18n.t('textMutation.rejection.bannerDetail', { detail: raw })}`,
  };
}

/**
 * Get the tooltip text for a support class directly.
 * Convenience accessor used in TextContextBar and TextInlineEditor.
 */
export function getSupportClassTooltip(supportClass: TextMutationSupportClass): string {
  return SUPPORT_CLASS_MESSAGES[supportClass].tooltip;
}

/**
 * Returns true when the support class allows real PDF mutation.
 * Convenience predicate — wraps the support class check.
 */
export function isSupportClassWritable(supportClass: TextMutationSupportClass): boolean {
  return supportClass === 'writable_digital_text';
}

/**
 * Get the user-facing message for a font encoding class.
 * Used when the backend rejects a mutation due to encoding constraints.
 */
export function getFontEncodingMessage(encodingClass: FontEncodingClass): MutationMessage {
  return FONT_ENCODING_MESSAGES[encodingClass];
}

/**
 * Get the user-facing message for a character overflow warning.
 * charOverflow is how many characters the replacement exceeds the original.
 */
export function getOverflowRiskMessage(charOverflow: number): MutationMessage {
  const excess = Math.max(0, charOverflow);
  return {
    tooltip: `Replacement text ${excess} character${excess === 1 ? '' : 's'} too long`,
    explanation:
      `The replacement text is ${excess} character${excess === 1 ? '' : 's'} longer than the original. ` +
      'Shorten the replacement text to avoid layout problems in the PDF.',
    actionable: true,
  };
}
