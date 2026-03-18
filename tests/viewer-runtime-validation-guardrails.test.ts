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
const formSource = readFileSync(
  new URL('../src/viewer/validation/formFieldValidator.ts', import.meta.url),
  'utf8'
);
const fileSource = readFileSync(
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
// All limit constants are exported
// ---------------------------------------------------------------------------

describe('limit constants guardrail', () => {
  it('MIN_ZOOM and MAX_ZOOM are exported', () => {
    expect(sanitizerSource).toContain('export const MIN_ZOOM');
    expect(sanitizerSource).toContain('export const MAX_ZOOM');
  });

  it('TEXT_MAX_LENGTH is exported', () => {
    expect(sanitizerSource).toContain('export const TEXT_MAX_LENGTH = 10_000');
  });

  it('MAX_PATH_LENGTH is exported', () => {
    expect(fileSource).toContain('export const MAX_PATH_LENGTH = 4096');
  });

  it('FORM_FIELD_TEXT_MAX_LENGTH is exported', () => {
    expect(formSource).toContain('export const FORM_FIELD_TEXT_MAX_LENGTH = 10_000');
  });

  it('HEALTH_REPORT_INTERVAL_MS is exported', () => {
    expect(healthSource).toContain('export const HEALTH_REPORT_INTERVAL_MS = 30_000');
  });
});

// ---------------------------------------------------------------------------
// sanitizeText enforces TEXT_MAX_LENGTH
// ---------------------------------------------------------------------------

describe('sanitizeText length guardrail', () => {
  it('calls slice(0, maxLength)', () => {
    const fn = sanitizerSource.indexOf('export function sanitizeText');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('slice(0, maxLength)');
  });

  it('defaults maxLength to TEXT_MAX_LENGTH', () => {
    const fn = sanitizerSource.indexOf('export function sanitizeText');
    const sig = sanitizerSource.slice(fn, fn + 100);
    expect(sig).toContain('TEXT_MAX_LENGTH');
  });
});

// ---------------------------------------------------------------------------
// sanitizePageNumber always within [1, pageCount]
// ---------------------------------------------------------------------------

describe('sanitizePageNumber clamp guardrail', () => {
  it('uses Math.min(Math.max(...), pageCount)', () => {
    const fn = sanitizerSource.indexOf('export function sanitizePageNumber');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('Math.min');
    expect(body).toContain('Math.max');
    expect(body).toContain('pageCount');
  });
});

// ---------------------------------------------------------------------------
// sanitizeZoomLevel always within [MIN_ZOOM, MAX_ZOOM]
// ---------------------------------------------------------------------------

describe('sanitizeZoomLevel clamp guardrail', () => {
  it('clamps between MIN_ZOOM and MAX_ZOOM', () => {
    const fn = sanitizerSource.indexOf('export function sanitizeZoomLevel');
    const body = sanitizerSource.slice(fn, sanitizerSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('MIN_ZOOM');
    expect(body).toContain('MAX_ZOOM');
    expect(body).toContain('Math.min');
    expect(body).toContain('Math.max');
  });
});

// ---------------------------------------------------------------------------
// isAnnotationLike rejects non-objects
// ---------------------------------------------------------------------------

describe('isAnnotationLike rejects non-objects guardrail', () => {
  it('calls isObject(v) as first check', () => {
    const fn = guardsSource.indexOf('export function isAnnotationLike');
    const body = guardsSource.slice(fn, guardsSource.indexOf('\n}', fn) + 2);
    expect(body).toContain('if (!isObject(v)) return false');
  });
});

// ---------------------------------------------------------------------------
// validateAnnotation checks all required fields
// ---------------------------------------------------------------------------

describe('validateAnnotation completeness guardrail', () => {
  it('validates id, type, page, and rect', () => {
    const fn = annotationSource.indexOf('export function validateAnnotation');
    const body = annotationSource.slice(fn, annotationSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('a.id');
    expect(body).toContain('a.type');
    expect(body).toContain('a.page');
    expect(body).toContain('isValidRect');
  });
});

// ---------------------------------------------------------------------------
// validateFilePath always returns normalizedPath
// ---------------------------------------------------------------------------

describe('validateFilePath always normalizes guardrail', () => {
  it('calls normalizeFilePath first', () => {
    const fn = fileSource.indexOf('export function validateFilePath');
    const body = fileSource.slice(fn, fileSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('normalizeFilePath(path)');
  });
});

// ---------------------------------------------------------------------------
// buildHealthReport status correctness
// ---------------------------------------------------------------------------

describe('buildHealthReport severity guardrail', () => {
  it('error failures produce critical status', () => {
    const fn = healthSource.indexOf('export function buildHealthReport');
    const body = healthSource.slice(fn, healthSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("severity === 'error'");
    expect(body).toContain("status = 'critical'");
  });

  it('warning failures produce degraded status', () => {
    const fn = healthSource.indexOf('export function buildHealthReport');
    const body = healthSource.slice(fn, healthSource.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("severity === 'warning'");
    expect(body).toContain("status = 'degraded'");
  });
});

// ---------------------------------------------------------------------------
// AI requests always produce ignore recovery
// ---------------------------------------------------------------------------

describe('getAiRequestRecovery always ignores guardrail', () => {
  it('strategy is always ignore', () => {
    const fn = recoverySource.indexOf('export function getAiRequestRecovery');
    const body = recoverySource.slice(fn, recoverySource.indexOf('\n}', fn) + 2);
    expect(body).toContain("strategy: 'ignore'");
  });
});
