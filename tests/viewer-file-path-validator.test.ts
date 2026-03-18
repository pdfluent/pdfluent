// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/validation/filePathValidator.ts', import.meta.url),
  'utf8'
);

describe('constants', () => {
  it('exports MAX_PATH_LENGTH = 4096', () => {
    expect(source).toContain('export const MAX_PATH_LENGTH = 4096');
  });

  it('exports SUPPORTED_PDF_EXTENSIONS with .pdf', () => {
    expect(source).toContain('export const SUPPORTED_PDF_EXTENSIONS');
    expect(source).toContain("'.pdf'");
  });

  it('exports SUPPORTED_BUNDLE_EXTENSIONS', () => {
    expect(source).toContain('export const SUPPORTED_BUNDLE_EXTENSIONS');
    expect(source).toContain("'.reviewbundle'");
    expect(source).toContain("'.json'");
  });
});

describe('FilePathValidationResult', () => {
  it('declares valid boolean', () => {
    const s = source.indexOf('interface FilePathValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('valid: boolean');
  });

  it('declares optional error string', () => {
    const s = source.indexOf('interface FilePathValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('error?: string');
  });

  it('declares normalizedPath field', () => {
    const s = source.indexOf('interface FilePathValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('normalizedPath: string');
  });
});

describe('normalizeFilePath', () => {
  it('exports normalizeFilePath function', () => {
    expect(source).toContain('export function normalizeFilePath(path: string)');
  });

  it('trims the path', () => {
    const fn = source.indexOf('export function normalizeFilePath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('trim()');
  });

  it('replaces backslashes with forward slashes', () => {
    const fn = source.indexOf('export function normalizeFilePath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("replace(/\\\\/g, '/')");
  });
});

describe('validateFilePath', () => {
  it('exports validateFilePath function', () => {
    expect(source).toContain('export function validateFilePath(path: string)');
  });

  it('rejects empty paths', () => {
    const fn = source.indexOf('export function validateFilePath');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("normalizedPath === ''");
  });

  it('rejects paths exceeding MAX_PATH_LENGTH', () => {
    const fn = source.indexOf('export function validateFilePath');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('MAX_PATH_LENGTH');
  });

  it('returns normalizedPath in result', () => {
    const fn = source.indexOf('export function validateFilePath');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('normalizedPath');
  });
});

describe('isPdfPath', () => {
  it('exports isPdfPath function', () => {
    expect(source).toContain('export function isPdfPath(path: string)');
  });

  it('checks for .pdf extension (case-insensitive)', () => {
    const fn = source.indexOf('export function isPdfPath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("endsWith('.pdf')");
    expect(body).toContain('toLowerCase()');
  });
});

describe('isBundlePath', () => {
  it('exports isBundlePath function', () => {
    expect(source).toContain('export function isBundlePath(path: string)');
  });

  it('checks SUPPORTED_BUNDLE_EXTENSIONS', () => {
    const fn = source.indexOf('export function isBundlePath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('SUPPORTED_BUNDLE_EXTENSIONS');
  });
});

describe('validatePdfPath', () => {
  it('exports validatePdfPath function', () => {
    expect(source).toContain('export function validatePdfPath(path: string)');
  });

  it('calls validateFilePath first', () => {
    const fn = source.indexOf('export function validatePdfPath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('validateFilePath(path)');
  });

  it('calls isPdfPath check', () => {
    const fn = source.indexOf('export function validatePdfPath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('isPdfPath(');
  });
});
