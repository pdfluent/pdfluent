// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What pressing "Run OCR" leads to (J-60): run at once (the component ships in
// the app), or say why OCR is not available -- never a silent nothing, never an
// offer to download.

import { describe, expect, it } from 'vitest';
import * as ocrComponent from '../ocrComponent';
import { ocrLanguagesFor, ocrReadiness } from '../ocrComponent';
import { localizeErrorCode } from '../commandBridge';
import type { OcrComponentStatus } from '../tauri-api';

function status(overrides: Partial<OcrComponentStatus> = {}): OcrComponentStatus {
  return {
    published: true,
    platform_supported: true,
    platform: 'macos-aarch64',
    installed: true,
    problem: null,
    component: 'tesseract-ocr',
    version: '5.5.1',
    component_size: 30_000_000,
    files: [{ path: 'bin/tesseract', size: 30_000_000 }],
    notices: [],
    languages: [
      { code: 'eng', name: 'English', size: 4_000_000, installed: true },
      { code: 'nld', name: 'Nederlands', size: 2_000_000, installed: true },
      { code: 'deu', name: 'Deutsch', size: 1_500_000, installed: true },
    ],
    development_override: false,
    ...overrides,
  };
}

const offered = ['eng', 'nld', 'deu', 'fra'];

describe('ocrLanguagesFor', () => {
  it('takes the Settings value, in order, when it names offered packs', () => {
    expect(ocrLanguagesFor('nld+eng', 'en', offered)).toEqual(['nld', 'eng']);
    expect(ocrLanguagesFor('deu, fra', 'en', offered)).toEqual(['deu', 'fra']);
  });

  it('falls back to the UI language plus English', () => {
    expect(ocrLanguagesFor('', 'nl', offered)).toEqual(['nld', 'eng']);
    expect(ocrLanguagesFor('', 'de-DE', offered)).toEqual(['deu', 'eng']);
    expect(ocrLanguagesFor('', 'ja', offered)).toEqual(['eng']);
  });

  it('drops what is not offered and never returns nothing while English is offered', () => {
    expect(ocrLanguagesFor('xyz', 'ja', offered)).toEqual(['eng']);
    expect(ocrLanguagesFor('eng+eng', 'en', offered)).toEqual(['eng']);
  });
});

describe('ocrReadiness', () => {
  it('runs at once when the bundle is complete: no dialog, no download', () => {
    expect(ocrReadiness(status(), ['nld', 'eng'])).toEqual({ kind: 'ready', languages: ['nld', 'eng'] });
  });

  it('never offers a download: an incomplete bundle or a missing language is unavailable', () => {
    const broken = status({
      installed: false,
      problem: 'OCR_COMPONENT_NOT_INSTALLED:bundle: tessdata/nld.traineddata: missing',
      languages: status().languages.map((l) => ({ ...l, installed: false })),
    });
    expect(ocrReadiness(broken, ['eng'])).toEqual({ kind: 'unavailable', reason: 'missing' });
    const noDutch = status({ languages: status().languages.map((l) => ({ ...l, installed: l.code !== 'nld' })) });
    expect(ocrReadiness(noDutch, ['nld'])).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  it('names why OCR cannot run instead of failing silently', () => {
    expect(ocrReadiness(status({ published: false, installed: false }), ['eng'])).toEqual({ kind: 'unavailable', reason: 'missing' });
    expect(ocrReadiness(status({ platform_supported: false, installed: false }), ['eng'])).toEqual({ kind: 'unavailable', reason: 'platform' });
  });

  it('runs with a development override as it is', () => {
    expect(ocrReadiness(status({ development_override: true, languages: [] }), ['eng'])).toEqual({ kind: 'ready', languages: ['eng'] });
  });

  it('has no download vocabulary left in the module', () => {
    expect(Object.keys(ocrComponent).sort()).toEqual(['ocrLanguagesFor', 'ocrReadiness']);
  });
});

describe('localizeErrorCode', () => {
  it('turns a backend OCR code into a sentence, keeping the detail', () => {
    const text = localizeErrorCode('OCR_LANGUAGE_MISSING:nld');
    expect(text).not.toContain('OCR_LANGUAGE_MISSING');
    expect(text).toContain('(nld)');
  });

  it('leaves everything else as it came', () => {
    expect(localizeErrorCode('Failed to parse PDF')).toBe('Failed to parse PDF');
    expect(localizeErrorCode('OCR_NOT_A_REAL_CODE')).toBe('OCR_NOT_A_REAL_CODE');
  });
});
