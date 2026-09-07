// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The 27 locales carry the same keys, and the English ones are written down.
 *
 * Twenty-five locales were missing the same 64 keys — the About dialog, the
 * update prompts, the organise toasts, the external-link consent — and nothing
 * ever failed, because i18next falls back to English. A missing key looks
 * exactly like a translated one to the app, so every feature that landed made
 * the gap wider and no one could see it.
 *
 * Red when: a key is added to en.json and not to the rest (`--fill` closes it),
 * a rename leaves an orphan behind in one locale, or a key listed in
 * src/i18n/untranslated.json is translated and left on the list — the same
 * ratchet the UI register uses for its exceptions, so the backlog cannot rot
 * into a list nobody reads.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  check,
  fill,
  flatten,
  localeNames,
  readLocale,
  readUntranslated,
  LOCALES_DIR,
  SOURCE_LOCALE,
  UNTRANSLATED_PATH,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/quality/i18n-parity.mjs';

describe('locale key parity', () => {
  it('every locale carries exactly the keys en.json has', () => {
    expect(check()).toEqual([]);
  });

  it('ships the locale set the app advertises', () => {
    const names = localeNames() as string[];
    expect(names).toContain(SOURCE_LOCALE);
    expect(names).toContain('nl');
    expect(names.length).toBe(27);
  });

  it('the capability panels added in #404 exist in every locale', () => {
    const keys = [
      'toolbar.pdfa',
      'toolbar.metadata',
      'toolbar.invoice',
      'toolbar.bookmarks',
      'editorV3.pdfa.convert',
      'editorV3.metadata.apply',
      'editorV3.invoice.read',
      'editorV3.esign.verify',
    ];
    for (const name of localeNames() as string[]) {
      const locale = flatten(readLocale(name)) as Map<string, string>;
      for (const key of keys) {
        expect(locale.has(key), `${name}.json is missing ${key}`).toBe(true);
      }
    }
  });

  it('--fill also drops a key en.json no longer has', () => {
    // The check calls an orphan "a rename left them behind" and the only fix it
    // offers is --fill, which used to add keys and never remove one. Removing
    // four dead controls left eight orphans in 25 locales and no tool that
    // could clear them: advice that does not work is worse than none.
    const root = mkdtempSync(join(tmpdir(), 'i18n-parity-'));
    mkdirSync(join(root, LOCALES_DIR), { recursive: true });
    writeFileSync(join(root, LOCALES_DIR, 'en.json'), JSON.stringify({ rail: { keep: 'Keep' } }));
    writeFileSync(join(root, LOCALES_DIR, 'nl.json'), JSON.stringify({ rail: { keep: 'Houden', ruler: 'Liniaal' } }));
    writeFileSync(join(root, UNTRANSLATED_PATH), JSON.stringify({ nl: ['rail.ruler'] }));

    fill(root);

    expect(JSON.parse(readFileSync(join(root, LOCALES_DIR, 'nl.json'), 'utf8')))
      .toEqual({ rail: { keep: 'Houden' } });
    expect(check(root)).toEqual([]);
  });

  it('records the English placeholders rather than hiding them', () => {
    const backlog = readUntranslated() as Record<string, string[]>;
    const source = flatten(readLocale(SOURCE_LOCALE)) as Map<string, string>;
    // Every listed key exists and still holds the English string; the check
    // above fails when one of them is translated and not removed from the list.
    for (const [name, keys] of Object.entries(backlog)) {
      const locale = flatten(readLocale(name)) as Map<string, string>;
      for (const key of keys) {
        expect(source.has(key), `${UNTRANSLATED_HINT} ${key}`).toBe(true);
        expect(locale.get(key)).toBe(source.get(key));
      }
    }
    expect(Object.keys(backlog)).not.toContain(SOURCE_LOCALE);
  });
});

const UNTRANSLATED_HINT = 'src/i18n/untranslated.json names a key en.json does not have:';
