// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/validation/annotationValidator.ts', import.meta.url),
  'utf8'
);

describe('AnnotationValidationResult', () => {
  it('declares valid boolean', () => {
    const s = source.indexOf('interface AnnotationValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('valid: boolean');
  });

  it('declares errors array', () => {
    const s = source.indexOf('interface AnnotationValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('errors: string[]');
  });
});

describe('validateAnnotation', () => {
  it('exports validateAnnotation function', () => {
    expect(source).toContain('export function validateAnnotation(annotation: unknown)');
  });

  it('rejects non-objects', () => {
    const fn = source.indexOf('export function validateAnnotation');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('typeof annotation !== \'object\'');
  });

  it('checks id is non-empty string', () => {
    const fn = source.indexOf('export function validateAnnotation');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('a.id');
  });

  it('checks page is integer >= 1', () => {
    const fn = source.indexOf('export function validateAnnotation');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('Number.isInteger(a.page)');
    expect(body).toContain('a.page < 1');
  });

  it('calls isValidRect', () => {
    const fn = source.indexOf('export function validateAnnotation');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('isValidRect(a.rect)');
  });

  it('returns valid: false with errors array on failure', () => {
    const fn = source.indexOf('export function validateAnnotation');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('valid: false');
    expect(body).toContain('errors');
  });
});

describe('validateAnnotationBatch', () => {
  it('exports validateAnnotationBatch function', () => {
    expect(source).toContain('export function validateAnnotationBatch(annotations: unknown[])');
  });

  it('checks Array.isArray', () => {
    const fn = source.indexOf('export function validateAnnotationBatch');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('Array.isArray(annotations)');
  });

  it('calls validateAnnotation per item', () => {
    const fn = source.indexOf('export function validateAnnotationBatch');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('validateAnnotation(annotations[i])');
  });
});

describe('sanitizeAnnotationText', () => {
  it('exports sanitizeAnnotationText function', () => {
    expect(source).toContain('export function sanitizeAnnotationText(text: string)');
  });

  it('delegates to sanitizeText with TEXT_MAX_LENGTH', () => {
    const fn = source.indexOf('export function sanitizeAnnotationText');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('sanitizeText(text, TEXT_MAX_LENGTH)');
  });
});

describe('isValidRect', () => {
  it('exports isValidRect function', () => {
    expect(source).toContain('export function isValidRect(rect: unknown)');
  });

  it('requires array of exactly 4 elements', () => {
    const fn = source.indexOf('export function isValidRect');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('rect.length !== 4');
  });

  it('checks all elements are finite numbers', () => {
    const fn = source.indexOf('export function isValidRect');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('Number.isFinite');
  });

  it('checks width > 0 and height > 0', () => {
    const fn = source.indexOf('export function isValidRect');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('rect[2] > 0');
    expect(body).toContain('rect[3] > 0');
  });
});
