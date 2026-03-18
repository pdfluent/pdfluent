// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Export Utilities
//
// Shared helpers for consistent export file naming and timestamp formatting
// across all export surfaces: review summary, audit report, snapshot diffs.
// ---------------------------------------------------------------------------

export type ExportType = 'review_summary' | 'audit_report' | 'snapshot_diff';
export type FileExtension = 'json' | 'md' | 'html' | 'pdf';

/**
 * Build a timestamp suffix in the format `YYYYMMDD_HHmmss`.
 * Example: 2026-03-17T10:20:42Z → "20260317_102042"
 */
export function buildTimestampSuffix(date: Date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Sanitise a document title for use as part of a file name.
 * Replaces spaces and special characters with underscores, collapses runs.
 */
export function sanitiseTitle(title: string): string {
  return title
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'document';
}

/**
 * Build a fully-qualified export file name.
 *
 * Pattern: `{sanitisedTitle}_{exportType}_{timestampSuffix}.{ext}`
 * Example: `jaarverslag_review_summary_20260317_102042.md`
 */
export function buildExportFilename(
  baseTitle: string,
  exportType: ExportType,
  extension: FileExtension,
  date: Date = new Date(),
): string {
  const safeTitle = sanitiseTitle(baseTitle);
  const typePart = exportType.replace(/_/g, '_');
  const suffix = buildTimestampSuffix(date);
  return `${safeTitle}_${typePart}_${suffix}.${extension}`;
}

/**
 * Choose the file extension that corresponds to an export format string.
 */
export function formatToExtension(format: 'json' | 'markdown' | 'html' | 'pdf'): FileExtension {
  switch (format) {
    case 'json': return 'json';
    case 'html': return 'html';
    case 'pdf': return 'pdf';
    default: return 'md';
  }
}

/**
 * Suggest an export directory path based on the original document path.
 * When the document has a known path, exports land in the same directory.
 * Falls back to an empty string (let the OS dialog default) when unknown.
 */
export function suggestExportDirectory(currentFilePath: string | null): string {
  if (!currentFilePath) return '';
  const sep = currentFilePath.includes('/') ? '/' : '\\';
  const parts = currentFilePath.split(sep);
  parts.pop(); // remove file name
  return parts.join(sep);
}
