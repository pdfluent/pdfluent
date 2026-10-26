// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  groupByKind,
  initialSelection,
  PII_KIND_ORDER,
  pageNumbers,
  selectAll,
  selectedTexts,
  toggle,
  type PiiCandidate,
} from '../src/viewer/pii/piiReview';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const pattern = (c: Pick<PiiCandidate, 'kind' | 'text' | 'pages' | 'occurrences'>): PiiCandidate => ({
  detail: null,
  source: 'pattern',
  score_pct: 100,
  validated: true,
  preselected: true,
  ...c,
});

const list: PiiCandidate[] = [
  pattern({ kind: 'phone', text: '+31 6 12345678', pages: [0], occurrences: 1 }),
  pattern({ kind: 'iban', text: 'NL91 ABNA 0417 1643 00', pages: [0, 2], occurrences: 3 }),
  pattern({ kind: 'email', text: 'jan@example.com', pages: [1], occurrences: 1 }),
  pattern({ kind: 'phone', text: '020 1234567', pages: [0], occurrences: 1 }),
];

const modelHit = (text: string, score: number, preselected: boolean): PiiCandidate => ({
  kind: 'person',
  text,
  pages: [0],
  occurrences: 1,
  detail: null,
  source: 'model',
  score_pct: score,
  validated: false,
  preselected,
});

describe('PII review list (J-66)', () => {
  it('groups by kind in a fixed order and drops empty groups', () => {
    expect(groupByKind(list).map(g => [g.kind, g.items.length])).toEqual([['iban', 1], ['email', 1], ['phone', 2]]);
    expect(groupByKind([])).toEqual([]);
  });

  it('starts with everything ticked and hands over exactly the ticked texts', () => {
    const all = selectAll(list);
    expect(selectedTexts(list, all)).toEqual(list.map(c => c.text));
    const without = toggle(all, '020 1234567');
    expect(selectedTexts(list, without)).toEqual(['+31 6 12345678', 'NL91 ABNA 0417 1643 00', 'jan@example.com']);
    expect(selectedTexts(list, toggle(without, '020 1234567'))).toHaveLength(4);
    expect(selectedTexts(list, new Set())).toEqual([]);
  });

  it('opens with the proven items and the confident model hits ticked, and the doubtful ones listed but unticked', () => {
    const mixed = [...list, modelHit('Jan Jansen', 97, true), modelHit('Piet', 55, false)];
    const ticked = initialSelection(mixed);
    expect(selectedTexts(mixed, ticked)).toEqual([...list.map(c => c.text), 'Jan Jansen']);
    expect(ticked.has('Piet')).toBe(false);
    // "Select all" still reaches the doubtful one: the user decides.
    expect(selectAll(mixed).has('Piet')).toBe(true);
  });

  it('lists names and addresses first and every kind the backend can send', () => {
    const kinds = ['iban', 'credit_card', 'national_id', 'date_of_birth', 'email', 'phone', 'bank_account', 'person', 'address'];
    expect([...PII_KIND_ORDER].sort()).toEqual([...kinds].sort());
    expect(PII_KIND_ORDER.slice(0, 2)).toEqual(['person', 'address']);
  });

  it('toggling never mutates the previous selection', () => {
    const all = selectAll(list);
    toggle(all, 'jan@example.com');
    expect(all.has('jan@example.com')).toBe(true);
  });

  it('shows 1-based page numbers', () => {
    expect(pageNumbers([0, 2])).toBe('1, 3');
  });
});

describe('PII wiring', () => {
  const panel = read('../src/viewer/v3/PiiControls.tsx');
  const shell = read('../src/viewer/v3/EditorV3Shell.tsx');
  const lib = read('../src-tauri/src/lib.rs');

  it('the panel calls the two backend commands and the redact panel mounts it', () => {
    expect(panel).toContain("'detect_pii'");
    expect(panel).toContain("'redact_pii', { texts }");
    expect(shell).toContain('<PiiControls onApplied={onDocumentMutated} />');
  });

  it('both commands exist in the backend, are registered, and the redaction records an undo step', () => {
    expect(lib).toContain('fn detect_pii(');
    expect(lib).toContain('fn redact_pii(');
    expect(lib).toMatch(/with_document_edit\("redact-personal-data"/);
    expect(lib).toMatch(/generate_handler!\[[\s\S]*\bdetect_pii,[\s\S]*\bredact_pii,/);
  });

  it('every user-visible string in the panel goes through i18n and exists in en and nl', () => {
    const keys = [...panel.matchAll(/editorV3\.redact\.pii\.[A-Za-z]+(?![A-Za-z.$])/g)].map(m => m[0]);
    expect(keys.length).toBeGreaterThan(8);
    for (const loc of ['en', 'nl']) {
      const json = JSON.parse(read(`../src/i18n/locales/${loc}.json`)) as Record<string, unknown>;
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], json);
        expect(typeof value, `${loc}: ${key}`).toBe('string');
      }
    }
    // the kind labels are built from a variable, so check them by name
    for (const kind of PII_KIND_ORDER) {
      const en = JSON.parse(read('../src/i18n/locales/en.json')) as { editorV3: { redact: { pii: { kind: Record<string, string> } } } };
      expect(en.editorV3.redact.pii.kind[kind]).toBeTruthy();
    }
  });
});
