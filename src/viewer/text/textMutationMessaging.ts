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
    tooltip: 'Tekst bewerken',
    explanation: 'Deze tekst kan worden bewerkt en direct worden opgeslagen in de PDF.',
    actionable: false,
  },
  non_writable_digital_text: {
    tooltip: 'Complexe tekststructuur — niet bewerkbaar',
    explanation:
      'Deze tekst heeft een te complexe opmaakstructuur (meerdere regels of lettertypes) ' +
      'om direct te bewerken. Eenvoudige, enkelvoudige tekstblokken zijn wel bewerkbaar.',
    actionable: false,
  },
  ocr_read_only: {
    tooltip: 'OCR-tekst — alleen lezen',
    explanation:
      'Deze tekst is herkend via OCR en kan niet worden teruggeschreven naar de PDF. ' +
      'OCR-tekst is een overlay over gescande inhoud, geen ingebedde PDF-tekst.',
    actionable: false,
  },
  protected_or_locked: {
    tooltip: 'Beveiligd document — bewerking geblokkeerd',
    explanation:
      'Dit document of deze inhoud is beveiligd of vergrendeld. ' +
      i18n.t('textMutation.removeProtection'),
    actionable: true,
  },
  unknown_structure: {
    tooltip: 'Tekststructuur onbekend — niet bewerkbaar',
    explanation:
      'De structuur van deze tekst kon niet worden vastgesteld. ' +
      'Bewerking is uitgeschakeld om beschadiging van de PDF te voorkomen.',
    actionable: false,
  },
};

// ---------------------------------------------------------------------------
// Reason code messages (more specific than support class)
// ---------------------------------------------------------------------------

const REASON_CODE_MESSAGES: Partial<Record<MutationSupportReason, MutationMessage>> = {
  'multi-span-unsupported': {
    tooltip: 'Meerdere lettertypes in één regel — niet bewerkbaar',
    explanation:
      'Deze tekstregel bevat meerdere segmenten met verschillende lettertypes of stijlen. ' +
      'Alleen enkelvoudige tekstsegmenten zijn momenteel bewerkbaar.',
    actionable: false,
  },
  'multi-line-unsupported': {
    tooltip: 'Alinea met meerdere regels — niet bewerkbaar',
    explanation:
      'Alinea\'s met meerdere regels kunnen nog niet worden bewerkt. ' +
      'Enkelvoudige regels zonder regelomloop zijn wel bewerkbaar.',
    actionable: false,
  },
  'ocr-source': {
    tooltip: 'OCR-tekst — alleen lezen',
    explanation:
      'Deze tekst is afkomstig van OCR-herkenning en is niet ingebed in de PDF-inhoudsstream. ' +
      i18n.t('textMutation.ocrCannotSave'),
    actionable: false,
  },
  'empty-content': {
    tooltip: 'Lege tekst — niet bewerkbaar',
    explanation: 'Dit tekstblok bevat geen inhoud en kan niet worden bewerkt.',
    actionable: false,
  },
  'protected-content': {
    tooltip: 'Beveiligde inhoud — bewerking geblokkeerd',
    explanation:
      'Deze tekst is beveiligd of behoort tot een vergrendeld formulierveld. ' +
      i18n.t('textMutation.removeDocProtection'),
    actionable: true,
  },
  'unknown-source': {
    tooltip: 'Onbekende tekstbron — niet bewerkbaar',
    explanation:
      'De herkomst van deze tekst kon niet worden vastgesteld. ' +
      'Bewerking is uitgeschakeld om schade aan de PDF te voorkomen.',
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
  | 'internal-error';

/**
 * The nine ways `replace_text_span` can decline, in the reader's language.
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
  'internal-error',
]);

// ---------------------------------------------------------------------------
// Font encoding messages — Phase 5 Batch 7
// ---------------------------------------------------------------------------

const FONT_ENCODING_MESSAGES: Record<FontEncodingClass, MutationMessage> = {
  standard_latin: {
    tooltip: 'Standaard Latin-codering — veilig',
    explanation: 'Dit lettertype gebruikt een standaard Latin-codering (WinAnsi of MacRoman). Bewerking is mogelijk.',
    actionable: false,
  },
  subset_embedded: {
    tooltip: 'Ingesloten subset-lettertype — veilig',
    explanation: 'Dit lettertype is als subset ingebed in de PDF. Bewerking is mogelijk voor tekens in de subset.',
    actionable: false,
  },
  identity_h: {
    tooltip: 'Identity-H codering — niet bewerkbaar',
    explanation:
      'Dit lettertype gebruikt Identity-H (CID-gebaseerde glyfindexen). ' +
      'Directe tekstvarvanging is niet mogelijk — de bytes zijn glyfindexen, geen Unicode.',
    actionable: false,
  },
  identity_v: {
    tooltip: 'Identity-V codering — niet bewerkbaar',
    explanation:
      'Dit lettertype gebruikt Identity-V (verticale CID-codering). ' +
      'Directe tekstvarvanging is niet mogelijk.',
    actionable: false,
  },
  cid_keyed: {
    tooltip: 'CID-lettertype — niet bewerkbaar',
    explanation:
      'Dit lettertype gebruikt een CID-gebaseerde CMap. ' +
      i18n.t('textMutation.requiresFontInspection'),
    actionable: false,
  },
  custom_encoding: {
    tooltip: 'Aangepaste codering — niet bewerkbaar',
    explanation:
      'Dit lettertype gebruikt een niet-standaard codering. ' +
      'Directe tekstvarvanging is uitgeschakeld om beschadiging te voorkomen.',
    actionable: false,
  },
  unknown: {
    tooltip: 'Codering onbekend — niet bewerkbaar',
    explanation:
      'De codering van dit lettertype kon niet worden vastgesteld. ' +
      'Bewerking is uitgeschakeld als voorzorgsmaatregel.',
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
    tooltip: `Vervangtekst ${excess} teken${excess === 1 ? '' : 's'} te lang`,
    explanation:
      `De vervangende tekst is ${excess} teken${excess === 1 ? '' : 's'} langer dan het origineel. ` +
      'Verkort de vervangtekst om opmaakproblemen in de PDF te voorkomen.',
    actionable: true,
  };
}
