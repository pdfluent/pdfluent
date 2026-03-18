// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Input Sanitizer
//
// Central sanitization for all user-facing inputs.
// Every value crossing a system boundary (text input, page navigation,
// zoom control, file path) passes through these functions so downstream
// code can assume values are always in range.
// ---------------------------------------------------------------------------

/** Minimum allowed zoom level (10 %). */
export const MIN_ZOOM = 0.1;

/** Maximum allowed zoom level (1000 %). */
export const MAX_ZOOM = 10.0;

/** Default zoom level returned when the input is invalid. */
export const DEFAULT_ZOOM = 1.0;

/** Maximum number of characters accepted from any free-text input. */
export const TEXT_MAX_LENGTH = 10_000;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Trim, collapse internal whitespace, and limit text to maxLength characters.
 * Safe for annotation bodies, reviewer names, and any other text field.
 */
export function sanitizeText(text: string, maxLength: number = TEXT_MAX_LENGTH): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/**
 * Trim and normalise a file path string (forward slashes only).
 * Does NOT validate the path — call validateFilePath for that.
 */
export function sanitizeFilePath(path: string): string {
  return path.trim().replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Page numbers
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown value to a valid page number within [1, pageCount].
 * Returns 1 on any invalid input (NaN, Infinity, out-of-range, non-number).
 */
export function sanitizePageNumber(value: unknown, pageCount: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || pageCount < 1) return 1;
  return Math.min(Math.max(Math.round(n), 1), pageCount);
}

/**
 * Return true when the page number is a valid integer within [1, pageCount].
 */
export function isValidPageNumber(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

// ---------------------------------------------------------------------------
// Zoom levels
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown value to a valid zoom level within [MIN_ZOOM, MAX_ZOOM].
 * Returns DEFAULT_ZOOM on any invalid input.
 */
export function sanitizeZoomLevel(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return Math.min(Math.max(n, MIN_ZOOM), MAX_ZOOM);
}

/**
 * Return true when the zoom level is within [MIN_ZOOM, MAX_ZOOM].
 */
export function isValidZoom(zoom: number): boolean {
  return zoom >= MIN_ZOOM && zoom <= MAX_ZOOM;
}
