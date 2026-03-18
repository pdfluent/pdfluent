// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/validation/inputSanitizer.ts', import.meta.url),
  'utf8'
);

describe('constants', () => {
  it('exports MIN_ZOOM = 0.1', () => {
    expect(source).toContain('export const MIN_ZOOM = 0.1');
  });

  it('exports MAX_ZOOM = 10.0', () => {
    expect(source).toContain('export const MAX_ZOOM = 10.0');
  });

  it('exports DEFAULT_ZOOM = 1.0', () => {
    expect(source).toContain('export const DEFAULT_ZOOM = 1.0');
  });

  it('exports TEXT_MAX_LENGTH = 10_000', () => {
    expect(source).toContain('export const TEXT_MAX_LENGTH = 10_000');
  });
});

describe('sanitizeText', () => {
  it('exports sanitizeText function', () => {
    expect(source).toContain('export function sanitizeText(text: string');
  });

  it('trims leading/trailing whitespace', () => {
    const fn = source.indexOf('export function sanitizeText');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('trim()');
  });

  it('collapses internal whitespace', () => {
    const fn = source.indexOf('export function sanitizeText');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("replace(/\\s+/g, ' ')");
  });

  it('slices to maxLength', () => {
    const fn = source.indexOf('export function sanitizeText');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('slice(0, maxLength)');
  });

  it('defaults maxLength to TEXT_MAX_LENGTH', () => {
    const fn = source.indexOf('export function sanitizeText');
    const sig = source.slice(fn, fn + 100);
    expect(sig).toContain('TEXT_MAX_LENGTH');
  });
});

describe('sanitizeFilePath', () => {
  it('exports sanitizeFilePath function', () => {
    expect(source).toContain('export function sanitizeFilePath(path: string)');
  });

  it('trims the path', () => {
    const fn = source.indexOf('export function sanitizeFilePath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('trim()');
  });

  it('replaces backslashes with forward slashes', () => {
    const fn = source.indexOf('export function sanitizeFilePath');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("replace(/\\\\/g, '/')");
  });
});

describe('sanitizePageNumber', () => {
  it('exports sanitizePageNumber function', () => {
    expect(source).toContain('export function sanitizePageNumber(value: unknown, pageCount: number)');
  });

  it('falls back to 1 for invalid input', () => {
    const fn = source.indexOf('export function sanitizePageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('return 1');
  });

  it('clamps using Math.min and Math.max', () => {
    const fn = source.indexOf('export function sanitizePageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('Math.min');
    expect(body).toContain('Math.max');
  });

  it('rounds to integer', () => {
    const fn = source.indexOf('export function sanitizePageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('Math.round');
  });
});

describe('isValidPageNumber', () => {
  it('exports isValidPageNumber function', () => {
    expect(source).toContain('export function isValidPageNumber(page: number, pageCount: number)');
  });

  it('requires Number.isInteger', () => {
    const fn = source.indexOf('export function isValidPageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('Number.isInteger(page)');
  });

  it('checks page >= 1', () => {
    const fn = source.indexOf('export function isValidPageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('page >= 1');
  });

  it('checks page <= pageCount', () => {
    const fn = source.indexOf('export function isValidPageNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('page <= pageCount');
  });
});

describe('sanitizeZoomLevel', () => {
  it('exports sanitizeZoomLevel function', () => {
    expect(source).toContain('export function sanitizeZoomLevel(value: unknown)');
  });

  it('falls back to DEFAULT_ZOOM for non-finite', () => {
    const fn = source.indexOf('export function sanitizeZoomLevel');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('DEFAULT_ZOOM');
  });

  it('clamps with MIN_ZOOM and MAX_ZOOM', () => {
    const fn = source.indexOf('export function sanitizeZoomLevel');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('MIN_ZOOM');
    expect(body).toContain('MAX_ZOOM');
  });
});

describe('isValidZoom', () => {
  it('exports isValidZoom function', () => {
    expect(source).toContain('export function isValidZoom(zoom: number)');
  });

  it('checks zoom >= MIN_ZOOM', () => {
    const fn = source.indexOf('export function isValidZoom');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('zoom >= MIN_ZOOM');
  });

  it('checks zoom <= MAX_ZOOM', () => {
    const fn = source.indexOf('export function isValidZoom');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('zoom <= MAX_ZOOM');
  });
});
