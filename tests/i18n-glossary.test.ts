// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The term for "redact" is the same word everywhere in a locale (#727).
 *
 * Machine translation rendered it as "edit", "censor" or "delete" in ru, vi,
 * hi, hu, el, ko, zh and fr: a button that permanently removes content read as
 * "edit". `src/i18n/glossary.json` holds the chosen verb and noun per locale
 * plus the stems of the wrong words. Red when a label key drifts from the
 * glossary term, or when any string about redaction in those locales uses a
 * banned stem. The terms are pending native-speaker review; changing one is a
 * change to the glossary, which shows up in review.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  flatten,
  readLocale,
  REPO,
  SOURCE_LOCALE,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/quality/i18n-parity.mjs';

interface Glossary {
  verbKeys: string[];
  nounKeys: string[];
  exemptKeys: string[];
  locales: Record<string, { verb: string; noun: string; banned: string[] }>;
}

const glossary: Glossary = JSON.parse(
  readFileSync(join(REPO, 'src', 'i18n', 'glossary.json'), 'utf8'),
) as Glossary;

const strings_of = (locale: string): Record<string, string> =>
  Object.fromEntries(flatten(readLocale(locale)) as Map<string, string>);
const english = strings_of(SOURCE_LOCALE);
const redactKeys = Object.entries(english)
  .filter(([, v]) => typeof v === 'string' && /redact/i.test(v))
  .map(([k]) => k);

describe('redact glossary', () => {
  it('covers the eight languages the review found wrong (zh counts twice)', () => {
    expect(Object.keys(glossary.locales).sort()).toEqual(
      ['el', 'fr', 'hi', 'hu', 'ko', 'ru', 'vi', 'zh-CN', 'zh-TW'],
    );
  });

  it('finds the redaction strings it is meant to guard', () => {
    expect(redactKeys.length).toBeGreaterThan(40);
    for (const k of [...glossary.verbKeys, ...glossary.nounKeys]) expect(redactKeys).toContain(k);
  });

  for (const [locale, term] of Object.entries(glossary.locales)) {
    describe(locale, () => {
      const strings = strings_of(locale);

      it('labels the verb and the noun with the glossary term', () => {
        for (const k of glossary.verbKeys) expect(strings[k], `${locale} ${k}`).toBe(term.verb);
        for (const k of glossary.nounKeys) expect(strings[k], `${locale} ${k}`).toBe(term.noun);
      });

      it('uses none of the wrong words in any redaction string', () => {
        const bad = redactKeys
          .filter((k) => !glossary.exemptKeys.includes(k))
          .filter((k) => term.banned.some((stem) => String(strings[k]).includes(stem)));
        expect(bad).toEqual([]);
      });
    });
  }
});
