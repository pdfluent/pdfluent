// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const sanitizerSource = readFileSync(
  new URL('../src/viewer/validation/inputSanitizer.ts', import.meta.url),
  'utf8'
);
const annotationSource = readFileSync(
  new URL('../src/viewer/validation/annotationValidator.ts', import.meta.url),
  'utf8'
);
const filePathSource = readFileSync(
  new URL('../src/viewer/validation/filePathValidator.ts', import.meta.url),
  'utf8'
);
const recoverySource = readFileSync(
  new URL('../src/viewer/recovery/errorRecoveryStrategies.ts', import.meta.url),
  'utf8'
);
const healthSource = readFileSync(
  new URL('../src/viewer/recovery/sessionHealthMonitor.ts', import.meta.url),
  'utf8'
);
const guardsSource = readFileSync(
  new URL('../src/viewer/validation/runtimeTypeGuards.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// sanitizePageNumber handles all bad inputs
// ---------------------------------------------------------------------------

describe('sanitizePageNumber boundary stability', () => {
  it('falls back to 1 for non-finite values', () => {
    const fn = sanitizerSource.indexOf('export function sanitizePageNumber');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('Number.isFinite');
    expect(body).toContain('return 1');
  });

  it('clamps with Math.min and Math.max', () => {
    const fn = sanitizerSource.indexOf('export function sanitizePageNumber');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('Math.min');
    expect(body).toContain('Math.max');
  });
});

// ---------------------------------------------------------------------------
// sanitizeZoomLevel handles all bad inputs
// ---------------------------------------------------------------------------

describe('sanitizeZoomLevel boundary stability', () => {
  it('returns DEFAULT_ZOOM for non-finite input', () => {
    const fn = sanitizerSource.indexOf('export function sanitizeZoomLevel');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('!Number.isFinite(n)');
    expect(body).toContain('return DEFAULT_ZOOM');
  });
});

// ---------------------------------------------------------------------------
// validateAnnotation rejects nulls and partial objects
// ---------------------------------------------------------------------------

describe('validateAnnotation robustness', () => {
  it('rejects null/non-object early', () => {
    const fn = annotationSource.indexOf('export function validateAnnotation');
    const body = annotationSource.slice(fn, annotationSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('typeof annotation !== \'object\'');
    expect(body).toContain('valid: false');
  });

  it('collects all errors before returning', () => {
    const fn = annotationSource.indexOf('export function validateAnnotation');
    const body = annotationSource.slice(fn, annotationSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('errors.push(');
    expect(body).toContain('errors.length === 0');
  });
});

// ---------------------------------------------------------------------------
// validateFilePath rejects empty and too-long paths
// ---------------------------------------------------------------------------

describe('validateFilePath boundary stability', () => {
  it('rejects empty path', () => {
    const fn = filePathSource.indexOf('export function validateFilePath');
    const body = filePathSource.slice(fn, filePathSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("normalizedPath === ''");
  });

  it('rejects path exceeding MAX_PATH_LENGTH', () => {
    const fn = filePathSource.indexOf('export function validateFilePath');
    const body = filePathSource.slice(fn, filePathSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('MAX_PATH_LENGTH');
  });
});

// ---------------------------------------------------------------------------
// isRetryableError matches on lowercase
// ---------------------------------------------------------------------------

describe('isRetryableError case-insensitive stability', () => {
  it('converts error to lowercase before matching', () => {
    const fn = recoverySource.indexOf('export function isRetryableError');
    const body = recoverySource.slice(fn, recoverySource.indexOf('\n}', fn) + 2);
    expect(body).toContain('toLowerCase()');
  });
});

// ---------------------------------------------------------------------------
// buildHealthReport stability
// ---------------------------------------------------------------------------

describe('buildHealthReport stability', () => {
  it('filters failed checks first', () => {
    const fn = healthSource.indexOf('export function buildHealthReport');
    const body = healthSource.slice(fn, healthSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('!c.passed');
  });

  it('adds issueCount from failed array length', () => {
    const fn = healthSource.indexOf('export function buildHealthReport');
    const body = healthSource.slice(fn, healthSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('failed.length');
  });
});

// ---------------------------------------------------------------------------
// isAnnotationLike defensive checks
// ---------------------------------------------------------------------------

describe('isAnnotationLike robustness', () => {
  it('calls isObject first', () => {
    const fn = guardsSource.indexOf('export function isAnnotationLike');
    const body = guardsSource.slice(fn, guardsSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('isObject(v)');
  });

  it('checks isArray for rect', () => {
    const fn = guardsSource.indexOf('export function isAnnotationLike');
    const body = guardsSource.slice(fn, guardsSource.indexOf('\n}', fn) + 2);
    expect(body).toContain("isArray(v['rect'])");
  });
});

// ---------------------------------------------------------------------------
// assertString throws proper TypeError
// ---------------------------------------------------------------------------

describe('assertString throws stability', () => {
  it('throws TypeError with descriptive message', () => {
    const fn = guardsSource.indexOf('export function assertString');
    const body = guardsSource.slice(fn, guardsSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('TypeError');
    expect(body).toContain('fieldName');
  });
});
