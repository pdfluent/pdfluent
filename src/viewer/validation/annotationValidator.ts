// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Annotation Validator
//
// Validates annotation objects at the load boundary (engine responses,
// bundle imports).  Rejects structurally invalid annotations early so the
// rest of the app can assume well-formed data.
// ---------------------------------------------------------------------------

import { sanitizeText, TEXT_MAX_LENGTH } from './inputSanitizer';
import i18n from '../../i18n';

export interface AnnotationValidationResult {
  /** True when all checks passed. */
  valid: boolean;
  /** Human-readable error messages collected during validation. */
  errors: string[];
}

/**
 * Validate a single annotation object from an unknown source.
 * Checks: id (non-empty string), type (string), page (integer ≥ 1),
 * rect (array of 4 numbers with positive width and height).
 */
export function validateAnnotation(annotation: unknown): AnnotationValidationResult {
  const errors: string[] = [];

  if (!annotation || typeof annotation !== 'object') {
    return { valid: false, errors: [i18n.t('annotationValidation.notObject')] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = annotation as any;

  if (typeof a.id !== 'string' || a.id.trim() === '') {
    errors.push(i18n.t('annotationValidation.missingId'));
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push(i18n.t('annotationValidation.missingType'));
  }
  if (!Number.isInteger(a.page) || a.page < 1) {
    errors.push(i18n.t('annotationValidation.invalidPage'));
  }
  if (!isValidRect(a.rect)) {
    errors.push(i18n.t('annotationValidation.invalidRect'));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate every annotation in a batch.
 * Returns a single combined result; any individual failure makes the batch invalid.
 */
export function validateAnnotationBatch(annotations: unknown[]): AnnotationValidationResult {
  if (!Array.isArray(annotations)) {
    return { valid: false, errors: [i18n.t('annotationValidation.notArray')] };
  }
  const allErrors: string[] = [];
  for (let i = 0; i < annotations.length; i++) {
    const result = validateAnnotation(annotations[i]);
    if (!result.valid) {
      allErrors.push(...result.errors.map(e => `[${i}] ${e}`));
    }
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

/**
 * Sanitize free-text content of an annotation (comment body, note text).
 * Trims and limits to TEXT_MAX_LENGTH characters.
 */
export function sanitizeAnnotationText(text: string): string {
  return sanitizeText(text, TEXT_MAX_LENGTH);
}

/**
 * Return true when rect is an array of exactly 4 finite numbers
 * where width (index 2) and height (index 3) are both > 0.
 */
export function isValidRect(rect: unknown): boolean {
  if (!Array.isArray(rect) || rect.length !== 4) return false;
  if (!rect.every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  return rect[2] > 0 && rect[3] > 0;
}
