// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// OCR component decisions, kept out of React so they can be tested as
// behaviour: which languages to offer by default and whether a run can start.
// The component ships inside every build, so there is nothing to download or
// to ask the user about.
// ---------------------------------------------------------------------------

import type { OcrComponentStatus } from './tauri-api';

/** UI language (i18next code) to the Tesseract language pack that reads it. */
const UI_TO_TESSERACT: Readonly<Record<string, string>> = {
  en: 'eng',
  nl: 'nld',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
};

/**
 * The languages an OCR run uses: the Settings value (Tesseract codes, joined
 * with `+` or `,`), else the UI language plus English. Only codes the
 * component offers survive, in order, without duplicates.
 */
export function ocrLanguagesFor(
  settingValue: string,
  uiLanguage: string,
  offered: readonly string[],
): string[] {
  const fromSetting = settingValue
    .split(/[+,\s]+/)
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
  const base = uiLanguage.toLowerCase().split('-')[0] ?? '';
  const fromUi = [UI_TO_TESSERACT[base], 'eng'].filter((c): c is string => typeof c === 'string');
  const wanted = fromSetting.length > 0 ? fromSetting : fromUi;
  const result: string[] = [];
  for (const code of wanted) {
    if (offered.includes(code) && !result.includes(code)) result.push(code);
  }
  if (result.length === 0 && offered.includes('eng')) result.push('eng');
  return result;
}

export type OcrReadiness =
  /** The bundle is complete and every wanted language is in it: run. */
  | { kind: 'ready'; languages: string[] }
  /** This build cannot run OCR; say why. */
  | { kind: 'unavailable'; reason: 'platform' | 'missing' };

/** What pressing "Run OCR" leads to. */
export function ocrReadiness(status: OcrComponentStatus, languages: readonly string[]): OcrReadiness {
  const missing = languages.filter((code) => !status.languages.some((l) => l.code === code && l.installed));
  if (status.installed && missing.length === 0 && languages.length > 0) {
    return { kind: 'ready', languages: [...languages] };
  }
  // A development override (debug builds) is used as it is.
  if (status.development_override && status.installed) {
    return { kind: 'ready', languages: [...languages] };
  }
  if (!status.platform_supported) return { kind: 'unavailable', reason: 'platform' };
  // An unpublished manifest, an incomplete bundle and a missing language are
  // the same thing to the user: the files that belong to this build are not
  // all there. Settings and the log name which one (status.problem).
  return { kind: 'unavailable', reason: 'missing' };
}
