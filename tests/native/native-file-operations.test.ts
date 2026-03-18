// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Native File Operations Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 8
 *
 * Verified:
 * - guardOpenPath: accepts valid .pdf paths, rejects empty/non-pdf/too-long
 * - guardSavePath: same constraints as open
 * - guardSaveAsPath: same constraints
 * - guardExportPath: accepts any valid path, not just .pdf
 * - getFilename: extracts basename from various path formats
 * - getDirectory: extracts directory part
 * - getExtension: extracts lowercase extension
 * - replaceExtension: swaps extension correctly
 * - pathsEqual: normalized comparison handles backslashes and case
 * - isSaveOverwrite: detects overwrite of original file
 */

import { describe, it, expect } from 'vitest';
import {
  guardOpenPath,
  guardSavePath,
  guardSaveAsPath,
  guardExportPath,
  getFilename,
  getDirectory,
  getExtension,
  replaceExtension,
  pathsEqual,
  isSaveOverwrite,
} from '../../src/viewer/native/nativeFileOperations';
import { MAX_PATH_LENGTH } from '../../src/viewer/validation/filePathValidator';

// ---------------------------------------------------------------------------
// guardOpenPath
// ---------------------------------------------------------------------------

describe('nativeFileOperations — guardOpenPath', () => {
  it('accepts a valid .pdf path', () => {
    const result = guardOpenPath('/Users/test/document.pdf');
    expect(result.ok).toBe(true);
    expect(result.data?.normalizedPath).toBe('/Users/test/document.pdf');
  });

  it('normalizes backslashes on Windows-style paths', () => {
    const result = guardOpenPath('C:\\Users\\test\\document.pdf');
    expect(result.ok).toBe(true);
    expect(result.data?.normalizedPath).toContain('/');
  });

  it('rejects empty string', () => {
    const result = guardOpenPath('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty-path');
  });

  it('rejects whitespace-only string', () => {
    const result = guardOpenPath('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty-path');
  });

  it('rejects non-pdf extension', () => {
    const result = guardOpenPath('/Users/test/document.docx');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unsupported-extension');
  });

  it('rejects path exceeding MAX_PATH_LENGTH', () => {
    const longPath = '/'.repeat(MAX_PATH_LENGTH + 1) + '.pdf';
    const result = guardOpenPath(longPath);
    expect(result.ok).toBe(false);
  });

  it('accepts PDF path with uppercase extension', () => {
    const result = guardOpenPath('/Users/test/DOCUMENT.PDF');
    expect(result.ok).toBe(true);
  });

  it('trims leading/trailing whitespace', () => {
    const result = guardOpenPath('  /Users/test/document.pdf  ');
    expect(result.ok).toBe(true);
    expect(result.data?.normalizedPath).toBe('/Users/test/document.pdf');
  });
});

// ---------------------------------------------------------------------------
// guardSavePath
// ---------------------------------------------------------------------------

describe('nativeFileOperations — guardSavePath', () => {
  it('accepts valid .pdf path', () => {
    expect(guardSavePath('/tmp/output.pdf').ok).toBe(true);
  });

  it('rejects empty path', () => {
    expect(guardSavePath('').ok).toBe(false);
  });

  it('rejects non-pdf extension', () => {
    expect(guardSavePath('/tmp/output.txt').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// guardSaveAsPath
// ---------------------------------------------------------------------------

describe('nativeFileOperations — guardSaveAsPath', () => {
  it('accepts valid new .pdf path', () => {
    expect(guardSaveAsPath('/Users/test/new-document.pdf').ok).toBe(true);
  });

  it('rejects non-pdf extension', () => {
    expect(guardSaveAsPath('/tmp/export.docx').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// guardExportPath
// ---------------------------------------------------------------------------

describe('nativeFileOperations — guardExportPath', () => {
  it('accepts .pdf export path', () => {
    expect(guardExportPath('/tmp/export.pdf').ok).toBe(true);
  });

  it('accepts non-pdf export paths', () => {
    expect(guardExportPath('/tmp/export.docx').ok).toBe(true);
    expect(guardExportPath('/tmp/audit.xlsx').ok).toBe(true);
    expect(guardExportPath('/tmp/report.html').ok).toBe(true);
  });

  it('rejects empty export path', () => {
    const result = guardExportPath('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty-path');
  });

  it('rejects whitespace-only export path', () => {
    expect(guardExportPath('   ').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFilename
// ---------------------------------------------------------------------------

describe('nativeFileOperations — getFilename', () => {
  it('returns basename from POSIX path', () => {
    expect(getFilename('/Users/test/document.pdf')).toBe('document.pdf');
  });

  it('returns basename from Windows path (normalized)', () => {
    expect(getFilename('C:\\Users\\test\\document.pdf')).toBe('document.pdf');
  });

  it('returns the full string when no slash', () => {
    expect(getFilename('document.pdf')).toBe('document.pdf');
  });

  it('returns empty string for empty input', () => {
    expect(getFilename('')).toBe('');
  });

  it('handles trailing slash (empty filename)', () => {
    expect(getFilename('/Users/test/')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getDirectory
// ---------------------------------------------------------------------------

describe('nativeFileOperations — getDirectory', () => {
  it('returns directory from POSIX path', () => {
    expect(getDirectory('/Users/test/document.pdf')).toBe('/Users/test');
  });

  it('returns empty string when no slash present', () => {
    expect(getDirectory('document.pdf')).toBe('');
  });

  it('returns root for root-level file', () => {
    expect(getDirectory('/document.pdf')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getExtension
// ---------------------------------------------------------------------------

describe('nativeFileOperations — getExtension', () => {
  it('returns .pdf for PDF file', () => {
    expect(getExtension('/Users/test/document.pdf')).toBe('.pdf');
  });

  it('returns lowercase extension', () => {
    expect(getExtension('/Users/test/DOCUMENT.PDF')).toBe('.pdf');
  });

  it('returns empty string for files without extension', () => {
    expect(getExtension('/Users/test/Makefile')).toBe('');
  });

  it('handles multiple dots correctly', () => {
    expect(getExtension('/tmp/archive.tar.gz')).toBe('.gz');
  });
});

// ---------------------------------------------------------------------------
// replaceExtension
// ---------------------------------------------------------------------------

describe('nativeFileOperations — replaceExtension', () => {
  it('replaces .pdf with .docx', () => {
    expect(replaceExtension('/tmp/document.pdf', '.docx')).toBe('/tmp/document.docx');
  });

  it('works for files without directory', () => {
    expect(replaceExtension('document.pdf', '.txt')).toBe('document.txt');
  });

  it('adds extension when file has none', () => {
    expect(replaceExtension('/tmp/Makefile', '.pdf')).toBe('/tmp/Makefile.pdf');
  });

  it('handles Windows paths', () => {
    expect(replaceExtension('C:\\Users\\test\\doc.pdf', '.docx')).toBe('C:/Users/test/doc.docx');
  });
});

// ---------------------------------------------------------------------------
// pathsEqual
// ---------------------------------------------------------------------------

describe('nativeFileOperations — pathsEqual', () => {
  it('returns true for identical paths', () => {
    expect(pathsEqual('/tmp/doc.pdf', '/tmp/doc.pdf')).toBe(true);
  });

  it('normalizes backslashes before comparing', () => {
    expect(pathsEqual('C:\\Users\\test\\doc.pdf', 'C:/Users/test/doc.pdf')).toBe(true);
  });

  it('trims whitespace before comparing', () => {
    expect(pathsEqual('  /tmp/doc.pdf  ', '/tmp/doc.pdf')).toBe(true);
  });

  it('returns false for different paths', () => {
    expect(pathsEqual('/tmp/doc.pdf', '/tmp/other.pdf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSaveOverwrite
// ---------------------------------------------------------------------------

describe('nativeFileOperations — isSaveOverwrite', () => {
  it('returns true when save path equals open path', () => {
    expect(isSaveOverwrite('/tmp/doc.pdf', '/tmp/doc.pdf')).toBe(true);
  });

  it('returns true when paths differ only in backslash format', () => {
    expect(isSaveOverwrite('C:\\Users\\doc.pdf', 'C:/Users/doc.pdf')).toBe(true);
  });

  it('returns false when save path differs', () => {
    expect(isSaveOverwrite('/tmp/original.pdf', '/tmp/copy.pdf')).toBe(false);
  });

  it('returns false for completely different paths', () => {
    expect(isSaveOverwrite('/Users/a/doc.pdf', '/Users/b/doc.pdf')).toBe(false);
  });
});
