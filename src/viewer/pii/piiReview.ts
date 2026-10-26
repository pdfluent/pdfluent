// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The review list for personal data proposed by the detector (J-66).
 *
 * The detector runs in the backend (`detect_pii`): checksum and context rules
 * always, plus a multilingual model when the user has installed that component.
 * This is only what the panel does with its answer: group it, keep the user's
 * ticks, and hand exactly the ticked texts to `redact_pii`. Everything here is
 * a suggestion; nothing is redacted that is not ticked and confirmed.
 */

export type PiiKind =
  | 'iban'
  | 'credit_card'
  | 'national_id'
  | 'date_of_birth'
  | 'email'
  | 'phone'
  | 'bank_account'
  | 'person'
  | 'address';

export type PiiSource = 'pattern' | 'model' | 'both';

export interface PiiCandidate {
  kind: PiiKind;
  text: string;
  /** 0-based pages the text appears on. */
  pages: number[];
  occurrences: number;
  /** The sort of identifier ("BSN", "NINO") when the kind has several. */
  detail: string | null;
  source: PiiSource;
  /** The model's score in percent; 100 for a validated pattern. */
  score_pct: number;
  /** A checksum or context rule proved it, not just the model. */
  validated: boolean;
  /** Ticked when the list opens. Ticking is not redacting. */
  preselected: boolean;
}

/** What the scan did with the model, so a missing model is never silent. */
export type PiiModelUse =
  | { state: 'not_requested' }
  | { state: 'used' }
  | { state: 'failed'; code: string };

export interface PiiScan {
  candidates: PiiCandidate[];
  model: PiiModelUse;
}

export const PII_KIND_ORDER: readonly PiiKind[] = [
  'person',
  'address',
  'iban',
  'credit_card',
  'national_id',
  'date_of_birth',
  'email',
  'phone',
  'bank_account',
];

export function groupByKind(candidates: readonly PiiCandidate[]): Array<{ kind: PiiKind; items: PiiCandidate[] }> {
  return PII_KIND_ORDER.map(kind => ({ kind, items: candidates.filter(c => c.kind === kind) })).filter(g => g.items.length > 0);
}

/** What is ticked when the list opens: the proven items and the confident model hits. */
export function initialSelection(candidates: readonly PiiCandidate[]): Set<string> {
  return new Set(candidates.filter(c => c.preselected).map(c => c.text));
}

/** Everything ticked, for the "Select all" button. */
export function selectAll(candidates: readonly PiiCandidate[]): Set<string> {
  return new Set(candidates.map(c => c.text));
}

export function toggle(selected: ReadonlySet<string>, text: string): Set<string> {
  const next = new Set(selected);
  if (next.has(text)) next.delete(text);
  else next.add(text);
  return next;
}

/** The ticked texts, in list order, as `redact_pii` takes them. */
export function selectedTexts(candidates: readonly PiiCandidate[], selected: ReadonlySet<string>): string[] {
  return candidates.filter(c => selected.has(c.text)).map(c => c.text);
}

/** 1-based page numbers for display: "1, 2". */
export function pageNumbers(pages: readonly number[]): string {
  return pages.map(p => p + 1).join(', ');
}
