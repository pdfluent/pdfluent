// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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

import i18n from '../../i18n';

export type ErrorSeverity = 'error' | 'warning' | 'info';

/** Machine-readable error taxonomy categories.
 *  See benchmarks/ERROR_TAXONOMY.md for full documentation.
 */
export type ErrorTaxonomy =
  | 'parser_crash.missing_trailer'
  | 'parser_crash.bad_xref'
  | 'parser_crash.invalid_object'
  | 'parser_crash.unsupported_version'
  | 'parser_crash.encrypted_no_password'
  | 'render_crash.font_not_found'
  | 'render_crash.invalid_geometry'
  | 'render_crash.limit_exceeded'
  | 'render_crash.unsupported_blend'
  | 'flatten_crash.xfa_not_found'
  | 'flatten_crash.unsupported_script'
  | 'flatten_crash.layout_overflow'
  | 'tauri_runtime_failure.ipc_timeout'
  | 'tauri_runtime_failure.fs_permission'
  | 'tauri_runtime_failure.plugin_crash'
  | 'tauri_runtime_failure.license_unavailable'
  | 'unsupported_feature.browser_save'
  | 'unsupported_feature.tier_gated'
  | 'unsupported_feature.not_compiled'
  | 'environment_failure.disk_full'
  | 'environment_failure.memory_exhausted'
  | 'environment_failure.missing_font'
  | 'environment_failure.ocr_model_missing'
  | 'artifact_failure.resource_missing'
  | 'artifact_failure.font_cache_missing'
  | 'artifact_failure.dts_drift'
  | 'validation_failure.pdfa_noncompliant'
  | 'validation_failure.signature_invalid'
  | 'validation_failure.pdfua_noncompliant'
  | 'package_failure.version_mismatch'
  | 'package_failure.license_incoherent'
  | 'package_failure.missing_dependency'
  | 'unknown';

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
  /**
   * Machine-readable taxonomy classification.
   * Used for support bundles, log pipelines, and CI gates.
   */
  readonly taxonomy: ErrorTaxonomy;
  /**
   * Whether the error is potentially recoverable (retry may succeed).
   */
  readonly recoverable: boolean;
  /**
   * Stable error code for programmatic dispatch.
   * Examples: 'INVALID_PDF', 'RENDER_ERROR', 'LIMIT_EXCEEDED'
   */
  readonly code: string;
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
  taxonomy: ErrorTaxonomy = 'unknown',
  recoverable: boolean = false,
  code: string = 'UNKNOWN',
): AppError {
  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    severity,
    title,
    message,
    timestamp: new Date(),
    source,
    taxonomy,
    recoverable,
    code,
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
  makeAppError('error', i18n.t('errors.ocrFailed'), message, 'ocr', 'environment_failure.ocr_model_missing', false, 'OCR_MODEL_MISSING');

export const makeExportError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.exportFailed'), message, 'export', 'unsupported_feature.browser_save', false, 'UNSUPPORTED_ON_BROWSER');

export const makeRedactionError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.redactionFailed'), message, 'redaction', 'tauri_runtime_failure.plugin_crash', false, 'REDACT_FAILED');

export const makeDocumentLoadError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.loadFailed'), message, 'document_load', 'parser_crash.invalid_object', false, 'CORRUPT_PDF');

export const makeTextMutationError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.textEditFailed'), message, 'text_edit', 'tauri_runtime_failure.fs_permission', false, 'PERMISSION_DENIED');

export const makeLayoutEditError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.layoutEditFailed'), message, 'layout_edit', 'tauri_runtime_failure.fs_permission', false, 'PERMISSION_DENIED');

export const makeSaveError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.saveFailed'), message, 'save', 'environment_failure.disk_full', true, 'IO_ERROR');

export const makeAnnotationError = (message: string): AppError =>
  makeAppError('error', i18n.t('errors.annotationFailed'), message, 'annotation', 'tauri_runtime_failure.fs_permission', false, 'PERMISSION_DENIED');

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
  /** Unique taxonomy categories present in the registry. */
  readonly taxonomies: readonly string[];
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
    taxonomies: [...new Set(errors.map(e => e.taxonomy))],
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
