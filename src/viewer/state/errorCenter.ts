// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Error Center
//
// Centralised, in-memory error registry for the viewer.  Replaces silent
// failures with structured AppError entries that the UI can surface.
//
// Errors are appended via appendError() and displayed in a toast or panel.
// The registry is capped at ERROR_CENTER_MAX entries (oldest are evicted).
// ---------------------------------------------------------------------------

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface AppError {
  /** Auto-generated unique identifier. */
  readonly id: string;
  /** Visual severity — drives colour and icon in the UI. */
  readonly severity: ErrorSeverity;
  /** Short human-readable title. */
  readonly title: string;
  /** Detailed message with context for the user. */
  readonly message: string;
  /** Wall-clock time the error was registered. */
  readonly timestamp: Date;
  /**
   * Identifies which system produced the error.
   * Examples: 'ocr', 'export', 'redaction', 'document_load'
   */
  readonly source: string;
}

/** Maximum number of errors kept in the registry before oldest entries are evicted. */
export const ERROR_CENTER_MAX = 50;

/**
 * Build a new AppError with an auto-generated id and current timestamp.
 */
export function makeAppError(
  severity: ErrorSeverity,
  title: string,
  message: string,
  source: string,
): AppError {
  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    severity,
    title,
    message,
    timestamp: new Date(),
    source,
  };
}

/**
 * Append a new error to the registry.
 * When the registry exceeds ERROR_CENTER_MAX the oldest entries are evicted.
 */
export function appendError(errors: readonly AppError[], error: AppError): AppError[] {
  const next = [...errors, error];
  if (next.length > ERROR_CENTER_MAX) {
    return next.slice(next.length - ERROR_CENTER_MAX);
  }
  return next;
}

/**
 * Remove a single error by id.
 * Used when the user dismisses an individual notification.
 */
export function clearError(errors: readonly AppError[], id: string): AppError[] {
  return errors.filter(e => e.id !== id);
}

/**
 * Remove all errors from the registry.
 * Used when the user bulk-dismisses all notifications.
 */
export function clearAllErrors(_errors: readonly AppError[]): AppError[] {
  return [];
}

// ---------------------------------------------------------------------------
// Convenience factory helpers — avoids magic strings at the call site
// ---------------------------------------------------------------------------

export const makeOcrError = (message: string): AppError =>
  makeAppError('error', 'OCR mislukt', message, 'ocr');

export const makeExportError = (message: string): AppError =>
  makeAppError('error', 'Exporteren mislukt', message, 'export');

export const makeRedactionError = (message: string): AppError =>
  makeAppError('error', 'Redigeren mislukt', message, 'redaction');

export const makeDocumentLoadError = (message: string): AppError =>
  makeAppError('error', 'Document laden mislukt', message, 'document_load');

export const makeTextMutationError = (message: string): AppError =>
  makeAppError('error', 'Tekstbewerking mislukt', message, 'text_edit');

export const makeLayoutEditError = (message: string): AppError =>
  makeAppError('error', 'Layoutbewerking mislukt', message, 'layout_edit');

export const makeSaveError = (message: string): AppError =>
  makeAppError('error', 'Opslaan mislukt', message, 'save');

export const makeAnnotationError = (message: string): AppError =>
  makeAppError('error', 'Annotatie mislukt', message, 'annotation');

// ---------------------------------------------------------------------------
// Query helpers — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 4
// ---------------------------------------------------------------------------

/**
 * Return all errors with the given severity.
 */
export function getErrorsBySeverity(
  errors: readonly AppError[],
  severity: ErrorSeverity,
): AppError[] {
  return errors.filter(e => e.severity === severity);
}

/**
 * Return all errors from the given source.
 */
export function getErrorsBySource(
  errors: readonly AppError[],
  source: string,
): AppError[] {
  return errors.filter(e => e.source === source);
}

/**
 * True when any error-severity entry is present.
 */
export function hasErrors(errors: readonly AppError[]): boolean {
  return errors.some(e => e.severity === 'error');
}

/**
 * True when any warning-severity entry is present.
 */
export function hasWarnings(errors: readonly AppError[]): boolean {
  return errors.some(e => e.severity === 'warning');
}

export interface ErrorSummary {
  readonly total: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly sources: readonly string[];
}

/**
 * Return a summary of the error registry.
 */
export function getErrorSummary(errors: readonly AppError[]): ErrorSummary {
  return {
    total: errors.length,
    errorCount: errors.filter(e => e.severity === 'error').length,
    warningCount: errors.filter(e => e.severity === 'warning').length,
    infoCount: errors.filter(e => e.severity === 'info').length,
    sources: [...new Set(errors.map(e => e.source))],
  };
}

/**
 * Return the most recently appended error, or null if empty.
 */
export function getLatestError(errors: readonly AppError[]): AppError | null {
  return errors.length > 0 ? errors[errors.length - 1]! : null;
}

/**
 * Return the most recently appended error with error severity, or null.
 */
export function getLatestErrorBySeverity(
  errors: readonly AppError[],
  severity: ErrorSeverity,
): AppError | null {
  const filtered = errors.filter(e => e.severity === severity);
  return filtered.length > 0 ? filtered[filtered.length - 1]! : null;
}

/**
 * Deduplicate errors: remove consecutive entries with the same title+source.
 * Keeps the first occurrence of each consecutive duplicate.
 */
export function deduplicateErrors(errors: readonly AppError[]): AppError[] {
  const result: AppError[] = [];
  for (const error of errors) {
    const last = result[result.length - 1];
    if (last && last.title === error.title && last.source === error.source) {
      continue; // skip consecutive duplicate
    }
    result.push(error);
  }
  return result;
}

/**
 * Return true when the registry is at maximum capacity.
 */
export function isAtCapacity(errors: readonly AppError[]): boolean {
  return errors.length >= ERROR_CENTER_MAX;
}
