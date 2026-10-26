// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What the Compress card says it did (#724): a copy leaves the open document
// alone, replacing it is undoable, and both name the before and after size.

/** Human-readable size, base 1024, one decimal above 1 KB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export type CompressMode = 'copy' | 'replace';

/** The `replaceOpen` flag sent to compress_pdf: only the explicit mode replaces. */
export function replacesOpenDocument(mode: CompressMode): boolean {
  return mode === 'replace';
}

export function compressToastKey(mode: CompressMode): string {
  return mode === 'replace'
    ? 'editorV3.toasts.compressedReplacedToast'
    : 'editorV3.toasts.compressedCopyToast';
}

export function compressToastParams(
  result: { bytes_before: number; bytes_after: number },
  name: string,
): { name: string; before: string; after: string } {
  return { name, before: formatBytes(result.bytes_before), after: formatBytes(result.bytes_after) };
}
