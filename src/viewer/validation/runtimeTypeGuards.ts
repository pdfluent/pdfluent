// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Runtime Type Guards
//
// Type predicates for data arriving from Tauri invoke responses, JSON
// imports, and other external sources.  Use these at system boundaries
// before casting unknown values to typed interfaces.
// ---------------------------------------------------------------------------

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number';
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Domain-specific duck-type checks
// ---------------------------------------------------------------------------

/**
 * Return true when the value looks like an Annotation:
 * has non-empty string id, string type, integer page ≥ 1, and array rect.
 */
export function isAnnotationLike(v: unknown): boolean {
  if (!isObject(v)) return false;
  return (
    isNonEmptyString(v['id']) &&
    isString(v['type']) &&
    isFiniteNumber(v['page']) &&
    isArray(v['rect'])
  );
}

/**
 * Return true when the value looks like a Reply:
 * has non-empty string id and string text.
 */
export function isReplyLike(v: unknown): boolean {
  if (!isObject(v)) return false;
  return isNonEmptyString(v['id']) && isString(v['text']);
}

/**
 * Return true when the value looks like a FormField:
 * has non-empty string id and string type.
 */
export function isFormFieldLike(v: unknown): boolean {
  if (!isObject(v)) return false;
  return isNonEmptyString(v['id']) && isString(v['type']);
}

/**
 * Return true when the value looks like a DocumentEvent:
 * has non-empty string id, string type, and string timestamp.
 */
export function isDocumentEventLike(v: unknown): boolean {
  if (!isObject(v)) return false;
  return (
    isNonEmptyString(v['id']) &&
    isString(v['type']) &&
    isString(v['timestamp'])
  );
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

/**
 * Assert that a value is a string, throwing a descriptive TypeError if not.
 * Useful in code paths where a missing string is a programming error.
 */
export function assertString(v: unknown, fieldName: string): string {
  if (typeof v !== 'string') {
    throw new TypeError(`Expected string for ${fieldName}, got ${typeof v}`);
  }
  return v;
}
