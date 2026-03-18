// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// File Path Validator
//
// Validates and normalises file paths before they are passed to Tauri
// invoke calls or used in the UI.  Guards against empty paths, excessive
// length, and unsupported extensions.
// ---------------------------------------------------------------------------

import i18n from '../../i18n';

/** Maximum accepted file path length (characters). */
export const MAX_PATH_LENGTH = 4096;

/** File extensions accepted as PDF documents. */
export const SUPPORTED_PDF_EXTENSIONS = ['.pdf'] as const;

/** File extensions accepted as review bundles. */
export const SUPPORTED_BUNDLE_EXTENSIONS = ['.reviewbundle', '.json'] as const;

export interface FilePathValidationResult {
  /** True when the path passes all checks. */
  valid: boolean;
  /** Human-readable error (only present when valid is false). */
  error?: string;
  /** Normalized path (populated even when valid is false). */
  normalizedPath: string;
}

/**
 * Normalise a file path: trim and replace backslashes with forward slashes.
 */
export function normalizeFilePath(path: string): string {
  return path.trim().replace(/\\/g, '/');
}

/**
 * Validate a generic file path (non-empty, within MAX_PATH_LENGTH).
 */
export function validateFilePath(path: string): FilePathValidationResult {
  const normalizedPath = normalizeFilePath(path);
  if (normalizedPath === '') {
    return { valid: false, error: i18n.t('annotationValidation.filePathEmpty'), normalizedPath };
  }
  if (normalizedPath.length > MAX_PATH_LENGTH) {
    return {
      valid: false,
      error: i18n.t('annotationValidation.filePathTooLong', { max: MAX_PATH_LENGTH }),
      normalizedPath,
    };
  }
  return { valid: true, normalizedPath };
}

/**
 * Return true when the path ends with `.pdf` (case-insensitive).
 */
export function isPdfPath(path: string): boolean {
  return normalizeFilePath(path).toLowerCase().endsWith('.pdf');
}

/**
 * Return true when the path ends with `.reviewbundle` or `.json`.
 */
export function isBundlePath(path: string): boolean {
  const lower = normalizeFilePath(path).toLowerCase();
  return (SUPPORTED_BUNDLE_EXTENSIONS as readonly string[]).some(ext => lower.endsWith(ext));
}

/**
 * Validate a path and additionally verify it ends with the `.pdf` extension.
 */
export function validatePdfPath(path: string): FilePathValidationResult {
  const base = validateFilePath(path);
  if (!base.valid) return base;
  if (!isPdfPath(base.normalizedPath)) {
    return {
      valid: false,
      error: i18n.t('annotationValidation.fileMustBePdf'),
      normalizedPath: base.normalizedPath,
    };
  }
  return base;
}
