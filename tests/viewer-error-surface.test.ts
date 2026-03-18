// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/state/errorCenter.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ErrorSeverity type
// ---------------------------------------------------------------------------

describe('ErrorSeverity', () => {
  it("exports ErrorSeverity type with 'error' | 'warning' | 'info'", () => {
    const typeStart = source.indexOf('export type ErrorSeverity');
    const typeLine = source.slice(typeStart, typeStart + 80);
    expect(typeLine).toContain("'error'");
    expect(typeLine).toContain("'warning'");
    expect(typeLine).toContain("'info'");
  });
});

// ---------------------------------------------------------------------------
// AppError interface
// ---------------------------------------------------------------------------

describe('AppError interface', () => {
  it('declares id field', () => {
    expect(source).toContain('readonly id: string');
  });

  it('declares severity field', () => {
    expect(source).toContain('readonly severity: ErrorSeverity');
  });

  it('declares title field', () => {
    expect(source).toContain('readonly title: string');
  });

  it('declares message field', () => {
    expect(source).toContain('readonly message: string');
  });

  it('declares timestamp field as Date', () => {
    expect(source).toContain('readonly timestamp: Date');
  });

  it('declares source field', () => {
    expect(source).toContain('readonly source: string');
  });
});

// ---------------------------------------------------------------------------
// ERROR_CENTER_MAX
// ---------------------------------------------------------------------------

describe('ERROR_CENTER_MAX', () => {
  it('exports ERROR_CENTER_MAX constant', () => {
    expect(source).toContain('export const ERROR_CENTER_MAX');
  });

  it('cap is 50', () => {
    expect(source).toContain('ERROR_CENTER_MAX = 50');
  });
});

// ---------------------------------------------------------------------------
// makeAppError
// ---------------------------------------------------------------------------

describe('makeAppError', () => {
  it('exports makeAppError function', () => {
    expect(source).toContain('export function makeAppError(');
  });

  it('generates id with err- prefix', () => {
    const fnStart = source.indexOf('export function makeAppError');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('`err-${Date.now()}-');
  });

  it('sets timestamp to new Date()', () => {
    const fnStart = source.indexOf('export function makeAppError');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('timestamp: new Date()');
  });
});

// ---------------------------------------------------------------------------
// appendError
// ---------------------------------------------------------------------------

describe('appendError', () => {
  it('exports appendError function', () => {
    expect(source).toContain('export function appendError(errors: readonly AppError[], error: AppError)');
  });

  it('evicts oldest entries when exceeding ERROR_CENTER_MAX', () => {
    const fnStart = source.indexOf('export function appendError');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('ERROR_CENTER_MAX');
    expect(body).toContain('.slice(next.length - ERROR_CENTER_MAX)');
  });
});

// ---------------------------------------------------------------------------
// clearError and clearAllErrors
// ---------------------------------------------------------------------------

describe('clearError', () => {
  it('exports clearError function', () => {
    expect(source).toContain('export function clearError(errors: readonly AppError[], id: string)');
  });

  it('filters by id', () => {
    const fnStart = source.indexOf('export function clearError(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('e.id !== id');
  });
});

describe('clearAllErrors', () => {
  it('exports clearAllErrors function', () => {
    expect(source).toContain('export function clearAllErrors(');
  });

  it('returns empty array', () => {
    const fnStart = source.indexOf('export function clearAllErrors');
    const body = source.slice(fnStart, fnStart + 100);
    expect(body).toContain('return []');
  });
});

// ---------------------------------------------------------------------------
// Convenience factory helpers
// ---------------------------------------------------------------------------

describe('Convenience error factories', () => {
  it('exports makeOcrError', () => {
    expect(source).toContain('export const makeOcrError');
  });

  it('makeOcrError uses source ocr', () => {
    expect(source).toContain("'ocr'");
  });

  it('exports makeExportError', () => {
    expect(source).toContain('export const makeExportError');
  });

  it('makeExportError uses source export', () => {
    expect(source).toContain("'export'");
  });

  it('exports makeRedactionError', () => {
    expect(source).toContain('export const makeRedactionError');
  });

  it('exports makeDocumentLoadError', () => {
    expect(source).toContain('export const makeDocumentLoadError');
  });

  it('makeDocumentLoadError uses source document_load', () => {
    expect(source).toContain("'document_load'");
  });
});
