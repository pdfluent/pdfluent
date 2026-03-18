// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Native File Operations — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 8
 *
 * Validation layer for native file operations (open, save, save-as, export).
 * This module guards all path inputs before they reach the Tauri invoke layer.
 *
 * Design:
 *   - All operations validate their path inputs and return a typed result
 *   - No operation silently swallows an invalid path
 *   - Each operation returns { ok: true, ...data } | { ok: false, reason }
 *   - The actual Tauri calls are injected via a TauriInvoker interface so
 *     this module can be fully tested without a Tauri runtime
 */

import {
  validatePdfPath,
  validateFilePath,
  normalizeFilePath,
  isPdfPath,
  MAX_PATH_LENGTH,
} from '../validation/filePathValidator';
import i18n from '../../i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileOpError =
  | 'invalid-path'
  | 'path-too-long'
  | 'unsupported-extension'
  | 'empty-path'
  | 'save-path-differs-from-open'
  | 'overwrite-protected';

export interface FileOpResult<T = void> {
  readonly ok: boolean;
  readonly error?: FileOpError;
  readonly errorMessage?: string;
  readonly data?: T;
}

// ---------------------------------------------------------------------------
// Path guards
// ---------------------------------------------------------------------------

/**
 * Guard an open-document path.
 * Returns ok=true with the normalised path, or ok=false with the reason.
 */
export function guardOpenPath(path: string): FileOpResult<{ normalizedPath: string }> {
  if (!path || path.trim().length === 0) {
    return { ok: false, error: 'empty-path', errorMessage: i18n.t('errors.emptyPath') };
  }
  const result = validatePdfPath(path);
  if (!result.valid) {
    const error: FileOpError = result.normalizedPath.length > MAX_PATH_LENGTH
      ? 'path-too-long'
      : !isPdfPath(path) ? 'unsupported-extension' : 'invalid-path';
    return { ok: false, error, errorMessage: result.error };
  }
  return { ok: true, data: { normalizedPath: result.normalizedPath } };
}

/**
 * Guard a save-document path.
 * Like guardOpenPath but also ensures the path ends with .pdf.
 */
export function guardSavePath(path: string): FileOpResult<{ normalizedPath: string }> {
  return guardOpenPath(path); // same constraints for now
}

/**
 * Guard a save-as path (may differ from the original open path).
 * Validates that the path is a valid PDF path.
 */
export function guardSaveAsPath(path: string): FileOpResult<{ normalizedPath: string }> {
  return guardOpenPath(path);
}

/**
 * Guard an export path (any supported file type, not just PDF).
 */
export function guardExportPath(path: string): FileOpResult<{ normalizedPath: string }> {
  if (!path || path.trim().length === 0) {
    return { ok: false, error: 'empty-path', errorMessage: 'Exportpad is leeg.' };
  }
  const result = validateFilePath(path);
  if (!result.valid) {
    return { ok: false, error: 'invalid-path', errorMessage: result.error };
  }
  return { ok: true, data: { normalizedPath: result.normalizedPath } };
}

// ---------------------------------------------------------------------------
// Filename utilities (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Extract the filename (basename) from a file path.
 */
export function getFilename(path: string): string {
  const normalized = normalizeFilePath(path);
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? '';
}

/**
 * Extract the directory part from a file path.
 */
export function getDirectory(path: string): string {
  const normalized = normalizeFilePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return normalized.slice(0, lastSlash);
}

/**
 * Return the file extension (including the dot), lowercased.
 */
export function getExtension(path: string): string {
  const filename = getFilename(path);
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Build a save-as path by replacing the extension with a new one.
 * The new extension must include the leading dot.
 */
export function replaceExtension(path: string, newExtension: string): string {
  const dir = getDirectory(path);
  const filename = getFilename(path);
  const dot = filename.lastIndexOf('.');
  const base = dot === -1 ? filename : filename.slice(0, dot);
  const newFilename = `${base}${newExtension}`;
  return dir ? `${dir}/${newFilename}` : newFilename;
}

/**
 * Return true when two paths refer to the same file (normalized comparison).
 */
export function pathsEqual(a: string, b: string): boolean {
  return normalizeFilePath(a) === normalizeFilePath(b);
}

/**
 * Check whether a save path would overwrite the original open path.
 */
export function isSaveOverwrite(openPath: string, savePath: string): boolean {
  return pathsEqual(openPath, savePath);
}
