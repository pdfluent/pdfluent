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
// inputSanitizer — all public exports
// ---------------------------------------------------------------------------

describe('inputSanitizer readiness', () => {
  it('exports MIN_ZOOM', () => { expect(sanitizerSource).toContain('export const MIN_ZOOM'); });
  it('exports MAX_ZOOM', () => { expect(sanitizerSource).toContain('export const MAX_ZOOM'); });
  it('exports DEFAULT_ZOOM', () => { expect(sanitizerSource).toContain('export const DEFAULT_ZOOM'); });
  it('exports TEXT_MAX_LENGTH', () => { expect(sanitizerSource).toContain('export const TEXT_MAX_LENGTH'); });
  it('exports sanitizeText', () => { expect(sanitizerSource).toContain('export function sanitizeText('); });
  it('exports sanitizeFilePath', () => { expect(sanitizerSource).toContain('export function sanitizeFilePath('); });
  it('exports sanitizePageNumber', () => { expect(sanitizerSource).toContain('export function sanitizePageNumber('); });
  it('exports sanitizeZoomLevel', () => { expect(sanitizerSource).toContain('export function sanitizeZoomLevel('); });
  it('exports isValidPageNumber', () => { expect(sanitizerSource).toContain('export function isValidPageNumber('); });
  it('exports isValidZoom', () => { expect(sanitizerSource).toContain('export function isValidZoom('); });
});

// ---------------------------------------------------------------------------
// annotationValidator — all public exports
// ---------------------------------------------------------------------------

describe('annotationValidator readiness', () => {
  it('exports AnnotationValidationResult', () => {
    expect(annotationSource).toContain('export interface AnnotationValidationResult');
  });

  it('exports validateAnnotation', () => {
    expect(annotationSource).toContain('export function validateAnnotation(');
  });

  it('exports validateAnnotationBatch', () => {
    expect(annotationSource).toContain('export function validateAnnotationBatch(');
  });

  it('exports sanitizeAnnotationText', () => {
    expect(annotationSource).toContain('export function sanitizeAnnotationText(');
  });

  it('exports isValidRect', () => {
    expect(annotationSource).toContain('export function isValidRect(');
  });
});

// ---------------------------------------------------------------------------
// formFieldValidator — all public exports
// ---------------------------------------------------------------------------

describe('formFieldValidator readiness', () => {
  it('exports FORM_FIELD_TEXT_MAX_LENGTH', () => {
    expect(formSource).toContain('export const FORM_FIELD_TEXT_MAX_LENGTH');
  });

  it('exports SUPPORTED_FIELD_TYPES', () => {
    expect(formSource).toContain('export const SUPPORTED_FIELD_TYPES');
  });

  it('exports FormFieldValidationResult', () => {
    expect(formSource).toContain('export interface FormFieldValidationResult');
  });

  it('exports isKnownFieldType', () => {
    expect(formSource).toContain('export function isKnownFieldType(');
  });

  it('exports validateFormFieldValue', () => {
    expect(formSource).toContain('export function validateFormFieldValue(');
  });

  it('exports sanitizeFormFieldValue', () => {
    expect(formSource).toContain('export function sanitizeFormFieldValue(');
  });
});

// ---------------------------------------------------------------------------
// filePathValidator — all public exports
// ---------------------------------------------------------------------------

describe('filePathValidator readiness', () => {
  it('exports MAX_PATH_LENGTH', () => {
    expect(fileSource).toContain('export const MAX_PATH_LENGTH');
  });

  it('exports SUPPORTED_PDF_EXTENSIONS', () => {
    expect(fileSource).toContain('export const SUPPORTED_PDF_EXTENSIONS');
  });

  it('exports SUPPORTED_BUNDLE_EXTENSIONS', () => {
    expect(fileSource).toContain('export const SUPPORTED_BUNDLE_EXTENSIONS');
  });

  it('exports FilePathValidationResult', () => {
    expect(fileSource).toContain('export interface FilePathValidationResult');
  });

  it('exports normalizeFilePath', () => {
    expect(fileSource).toContain('export function normalizeFilePath(');
  });

  it('exports validateFilePath', () => {
    expect(fileSource).toContain('export function validateFilePath(');
  });

  it('exports isPdfPath', () => {
    expect(fileSource).toContain('export function isPdfPath(');
  });

  it('exports isBundlePath', () => {
    expect(fileSource).toContain('export function isBundlePath(');
  });

  it('exports validatePdfPath', () => {
    expect(fileSource).toContain('export function validatePdfPath(');
  });
});

// ---------------------------------------------------------------------------
// errorRecoveryStrategies — all public exports
// ---------------------------------------------------------------------------

describe('errorRecoveryStrategies readiness', () => {
  it('exports RecoveryStrategy type', () => {
    expect(recoverySource).toContain('export type RecoveryStrategy');
  });

  it('exports RecoveryAction interface', () => {
    expect(recoverySource).toContain('export interface RecoveryAction');
  });

  it('exports isRetryableError', () => {
    expect(recoverySource).toContain('export function isRetryableError(');
  });

  it('exports getDocumentLoadRecovery', () => {
    expect(recoverySource).toContain('export function getDocumentLoadRecovery(');
  });

  it('exports getAnnotationLoadRecovery', () => {
    expect(recoverySource).toContain('export function getAnnotationLoadRecovery(');
  });

  it('exports getTauriInvokeRecovery', () => {
    expect(recoverySource).toContain('export function getTauriInvokeRecovery(');
  });

  it('exports getAiRequestRecovery', () => {
    expect(recoverySource).toContain('export function getAiRequestRecovery(');
  });
});

// ---------------------------------------------------------------------------
// sessionHealthMonitor — all public exports
// ---------------------------------------------------------------------------

describe('sessionHealthMonitor readiness', () => {
  it('exports SessionHealthStatus type', () => {
    expect(healthSource).toContain('export type SessionHealthStatus');
  });

  it('exports SessionHealthCheck interface', () => {
    expect(healthSource).toContain('export interface SessionHealthCheck');
  });

  it('exports SessionHealthReport interface', () => {
    expect(healthSource).toContain('export interface SessionHealthReport');
  });

  it('exports HEALTH_REPORT_INTERVAL_MS', () => {
    expect(healthSource).toContain('export const HEALTH_REPORT_INTERVAL_MS');
  });

  it('exports checkDocumentLoaded', () => {
    expect(healthSource).toContain('export function checkDocumentLoaded(');
  });

  it('exports checkPageBounds', () => {
    expect(healthSource).toContain('export function checkPageBounds(');
  });

  it('exports checkAnnotationCount', () => {
    expect(healthSource).toContain('export function checkAnnotationCount(');
  });

  it('exports buildHealthReport', () => {
    expect(healthSource).toContain('export function buildHealthReport(');
  });

  it('exports isSessionHealthy', () => {
    expect(healthSource).toContain('export function isSessionHealthy(');
  });
});

// ---------------------------------------------------------------------------
// runtimeTypeGuards — all public exports
// ---------------------------------------------------------------------------

describe('runtimeTypeGuards readiness', () => {
  it('exports isString', () => { expect(guardsSource).toContain('export function isString('); });
  it('exports isNonEmptyString', () => { expect(guardsSource).toContain('export function isNonEmptyString('); });
  it('exports isNumber', () => { expect(guardsSource).toContain('export function isNumber('); });
  it('exports isFiniteNumber', () => { expect(guardsSource).toContain('export function isFiniteNumber('); });
  it('exports isObject', () => { expect(guardsSource).toContain('export function isObject('); });
  it('exports isArray', () => { expect(guardsSource).toContain('export function isArray('); });
  it('exports isAnnotationLike', () => { expect(guardsSource).toContain('export function isAnnotationLike('); });
  it('exports isReplyLike', () => { expect(guardsSource).toContain('export function isReplyLike('); });
  it('exports isFormFieldLike', () => { expect(guardsSource).toContain('export function isFormFieldLike('); });
  it('exports isDocumentEventLike', () => { expect(guardsSource).toContain('export function isDocumentEventLike('); });
  it('exports assertString', () => { expect(guardsSource).toContain('export function assertString('); });
});
