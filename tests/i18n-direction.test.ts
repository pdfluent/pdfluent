// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The UI language decides <html dir> and <html lang>.
 *
 * Arabic shipped laid out left to right: nothing set `dir` anywhere (J-94).
 * Red when: a right-to-left language resolves to ltr, a locale written in a
 * right-to-left script ships without an RTL_LANGUAGES entry, or a language
 * change stops reaching the document element.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyLanguageToRoot, directionOf, RTL_LANGUAGES } from '../src/i18n/direction';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from '../src/i18n';

/** Hebrew, Arabic, Syriac, Thaana, NKo and the Arabic presentation forms. */
const RTL_SCRIPT = /[\u0590-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;

class FakeRoot {
  attrs = new Map<string, string>();
  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('directionOf', () => {
  it('Arabic is right to left, with or without a region, in any case', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('ar-EG')).toBe('rtl');
    expect(directionOf('AR_sa')).toBe('rtl');
  });

  it('the left-to-right locales and unknown or empty tags are ltr', () => {
    for (const lang of ['en', 'nl', 'de', 'ja', 'zh-CN', 'zh-TW', 'hi', 'th', 'xx', '', null, undefined]) {
      expect(directionOf(lang), String(lang)).toBe('ltr');
    }
  });

  it('every shipped locale written in a right-to-left script is in RTL_LANGUAGES, and no other', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const rtlScript = RTL_SCRIPT.test(LANGUAGE_NAMES[lang]);
      expect(directionOf(lang), `${lang} (${LANGUAGE_NAMES[lang]})`).toBe(rtlScript ? 'rtl' : 'ltr');
    }
    // RTL_LANGUAGES lists only languages that ship; a stale entry is noise.
    for (const lang of RTL_LANGUAGES) {
      expect(SUPPORTED_LANGUAGES.some((l) => l.split('-')[0] === lang), lang).toBe(true);
    }
  });
});

describe('applyLanguageToRoot', () => {
  it('writes lang and dir', () => {
    const root = new FakeRoot();
    expect(applyLanguageToRoot('ar', root)).toBe('rtl');
    expect(root.attrs.get('dir')).toBe('rtl');
    expect(root.attrs.get('lang')).toBe('ar');
    applyLanguageToRoot('nl', root);
    expect(root.attrs.get('dir')).toBe('ltr');
    expect(root.attrs.get('lang')).toBe('nl');
  });
});

describe('the i18n instance keeps the document in step', () => {
  it('sets dir and lang on init and on every language change', async () => {
    const root = new FakeRoot();
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', {
      getItem: () => 'en',
      setItem: () => undefined,
    });
    vi.resetModules();
    const mod = await import('../src/i18n');

    expect(root.attrs.get('lang')).toBe('en');
    expect(root.attrs.get('dir')).toBe('ltr');

    await mod.default.changeLanguage('ar');
    expect(root.attrs.get('dir')).toBe('rtl');
    expect(root.attrs.get('lang')).toBe('ar');

    mod.setLanguage('de');
    await Promise.resolve();
    expect(root.attrs.get('dir')).toBe('ltr');
    expect(root.attrs.get('lang')).toBe('de');
  });
});
