// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Writing direction of the UI language.
 *
 * Arabic shipped with the whole shell laid out left to right, because nothing
 * ever set `dir` on the document. The browser mirrors flex and grid order,
 * logical CSS properties and text alignment on its own once
 * `<html dir="rtl">` is set; this module is the one place that decides it.
 *
 * Adding a right-to-left locale (he, fa, ur) is one entry in RTL_LANGUAGES.
 * tests/i18n-direction.test.ts fails when a locale whose native name is
 * written in a right-to-left script is shipped without that entry.
 */

export type TextDirection = 'ltr' | 'rtl';

/** Base language subtags of the shipped locales that are written right to left. */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar']);

/** Direction of a BCP 47 language tag: `ar`, `ar-EG` and `AR` are all rtl. */
export function directionOf(lang: string | null | undefined): TextDirection {
  if (!lang) return 'ltr';
  const base = lang.trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
  return RTL_LANGUAGES.has(base) ? 'rtl' : 'ltr';
}

/** The part of an element this module writes; `document.documentElement` in the app. */
export interface LanguageRoot {
  setAttribute(name: string, value: string): void;
}

/**
 * Set `lang` and `dir` on the root element for a UI language.
 *
 * `lang` matters as much as `dir`: a screen reader picks its voice from it, and
 * with `lang="en"` fixed in index.html VoiceOver read Dutch and Arabic labels
 * with an English voice.
 */
export function applyLanguageToRoot(lang: string, root: LanguageRoot): TextDirection {
  const dir = directionOf(lang);
  root.setAttribute('lang', lang);
  root.setAttribute('dir', dir);
  return dir;
}

/** applyLanguageToRoot on the live document; a no-op where there is none (tests, workers). */
export function applyLanguageToDocument(lang: string): TextDirection | null {
  if (typeof document === 'undefined' || !document.documentElement) return null;
  return applyLanguageToRoot(lang, document.documentElement);
}
