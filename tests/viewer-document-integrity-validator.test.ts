// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Document Integrity Validator Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 2
 *
 * Verified:
 * - validateDocumentIntegrity: clean report for a valid document
 * - checkPageCount: critical for 0 pages, warning for overflow
 * - checkPdfVersion: warning for unknown version, clean for known
 * - checkMetadata: warning for corrupt metadata
 * - checkXrefCompleteness: warning for incomplete xref
 * - checkAnnotationCount: warning for negative count
 * - checkFileSize: critical for 0 bytes, warning for 2 GB+
 * - checkEncryptionConsistency: info for encrypted + edit-locked
 * - checkEditLock: warning when locked
 * - isDocumentSafeToOpen / isDocumentSafeToEdit helpers
 * - Multiple issues aggregate correctly
 * - File size critical short-circuits further checks
 */

import { describe, it, expect } from 'vitest';
import {
  validateDocumentIntegrity,
  checkPageCount,
  checkPdfVersion,
  checkMetadata,
  checkXrefCompleteness,
  checkAnnotationCount,
  checkFileSize,
  checkEncryptionConsistency,
  checkEditLock,
  isDocumentSafeToOpen,
  isDocumentSafeToEdit,
  MAX_PAGE_COUNT,
  MAX_FILE_SIZE_BYTES,
  KNOWN_PDF_VERSIONS,
} from '../src/viewer/integrity/documentIntegrityValidator';
import type { DocumentDescriptor } from '../src/viewer/integrity/documentIntegrityValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<DocumentDescriptor> = {}): DocumentDescriptor {
  return {
    pageCount: 5,
    pdfVersion: '1.7',
    title: 'Test Document',
    author: 'Test Author',
    annotationCount: 3,
    fileSizeBytes: 1024 * 100, // 100 KB
    encrypted: false,
    xrefComplete: true,
    editLocked: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Clean document
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — clean document', () => {
  it('returns clean report for a valid document', () => {
    const report = validateDocumentIntegrity(makeDoc());
    expect(report.clean).toBe(true);
    expect(report.hasCritical).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkPageCount
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkPageCount', () => {
  it('returns null for valid page count', () => {
    expect(checkPageCount(1)).toBeNull();
    expect(checkPageCount(100)).toBeNull();
    expect(checkPageCount(MAX_PAGE_COUNT)).toBeNull();
  });

  it('returns critical for 0 pages', () => {
    const issue = checkPageCount(0);
    expect(issue).not.toBeNull();
    expect(issue!.severity).toBe('critical');
    expect(issue!.code).toBe('no-pages');
  });

  it('returns critical for negative page count', () => {
    const issue = checkPageCount(-1);
    expect(issue!.severity).toBe('critical');
  });

  it('returns warning for page count above MAX_PAGE_COUNT', () => {
    const issue = checkPageCount(MAX_PAGE_COUNT + 1);
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('page-count-overflow');
  });
});

// ---------------------------------------------------------------------------
// checkPdfVersion
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkPdfVersion', () => {
  it('returns null for all known PDF versions', () => {
    for (const version of KNOWN_PDF_VERSIONS) {
      expect(checkPdfVersion(version)).toBeNull();
    }
  });

  it('returns warning for unknown version', () => {
    const issue = checkPdfVersion('3.0');
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('invalid-pdf-version');
  });

  it('returns warning for empty version string', () => {
    const issue = checkPdfVersion('');
    expect(issue!.severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// checkMetadata
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkMetadata', () => {
  it('returns null for valid metadata strings', () => {
    expect(checkMetadata('Title', 'Author')).toBeNull();
    expect(checkMetadata('', '')).toBeNull(); // empty strings are valid
  });

  it('returns warning when title is not a string', () => {
    // @ts-expect-error — testing runtime guard
    const issue = checkMetadata(null, 'Author');
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('corrupt-metadata');
  });

  it('returns warning when author is not a string', () => {
    // @ts-expect-error — testing runtime guard
    const issue = checkMetadata('Title', undefined);
    expect(issue!.severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// checkXrefCompleteness
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkXrefCompleteness', () => {
  it('returns null when xref is complete', () => {
    expect(checkXrefCompleteness(true)).toBeNull();
  });

  it('returns warning when xref is incomplete', () => {
    const issue = checkXrefCompleteness(false);
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('xref-gap-detected');
  });
});

// ---------------------------------------------------------------------------
// checkAnnotationCount
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkAnnotationCount', () => {
  it('returns null for 0 or positive count', () => {
    expect(checkAnnotationCount(0)).toBeNull();
    expect(checkAnnotationCount(100)).toBeNull();
  });

  it('returns warning for negative count', () => {
    const issue = checkAnnotationCount(-1);
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('annotation-count-negative');
  });
});

// ---------------------------------------------------------------------------
// checkFileSize
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkFileSize', () => {
  it('returns null for valid file sizes', () => {
    expect(checkFileSize(1024)).toBeNull();
    expect(checkFileSize(MAX_FILE_SIZE_BYTES)).toBeNull();
  });

  it('returns critical for 0 bytes', () => {
    const issue = checkFileSize(0);
    expect(issue!.severity).toBe('critical');
    expect(issue!.code).toBe('file-size-zero');
  });

  it('returns critical for negative bytes', () => {
    const issue = checkFileSize(-1);
    expect(issue!.severity).toBe('critical');
  });

  it('returns warning for size exceeding MAX_FILE_SIZE_BYTES', () => {
    const issue = checkFileSize(MAX_FILE_SIZE_BYTES + 1);
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('file-size-overflow');
  });
});

// ---------------------------------------------------------------------------
// checkEncryptionConsistency
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkEncryptionConsistency', () => {
  it('returns null when not encrypted', () => {
    expect(checkEncryptionConsistency(false, false)).toBeNull();
    expect(checkEncryptionConsistency(false, true)).toBeNull();
  });

  it('returns null when encrypted but not edit-locked (normal encryption)', () => {
    expect(checkEncryptionConsistency(true, false)).toBeNull();
  });

  it('returns info when encrypted AND edit-locked', () => {
    const issue = checkEncryptionConsistency(true, true);
    expect(issue!.severity).toBe('info');
    expect(issue!.code).toBe('encryption-inconsistency');
  });
});

// ---------------------------------------------------------------------------
// checkEditLock
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — checkEditLock', () => {
  it('returns null when not locked', () => {
    expect(checkEditLock(false)).toBeNull();
  });

  it('returns warning when edit-locked', () => {
    const issue = checkEditLock(true);
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('edit-locked');
  });
});

// ---------------------------------------------------------------------------
// File size critical short-circuits
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — file size critical short-circuits', () => {
  it('critical file size skips further checks', () => {
    const report = validateDocumentIntegrity(makeDoc({
      fileSizeBytes: 0,
      pageCount: 0, // would also be critical — but should not appear
    }));
    expect(report.hasCritical).toBe(true);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('file-size-zero');
  });
});

// ---------------------------------------------------------------------------
// Multiple issues
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — multiple issues', () => {
  it('reports xref + version + annotation issues together', () => {
    const report = validateDocumentIntegrity(makeDoc({
      xrefComplete: false,
      pdfVersion: '9.9',
      annotationCount: -5,
    }));
    expect(report.issues.some(i => i.code === 'xref-gap-detected')).toBe(true);
    expect(report.issues.some(i => i.code === 'invalid-pdf-version')).toBe(true);
    expect(report.issues.some(i => i.code === 'annotation-count-negative')).toBe(true);
    expect(report.hasWarnings).toBe(true);
    expect(report.hasCritical).toBe(false);
  });

  it('hasWarnings and hasCritical flags are consistent', () => {
    const report = validateDocumentIntegrity(makeDoc({ pageCount: 0 }));
    expect(report.hasCritical).toBe(true);
    expect(report.clean).toBe(false);
  });

  it('clean is false when any issue present', () => {
    const report = validateDocumentIntegrity(makeDoc({ editLocked: true }));
    expect(report.clean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDocumentSafeToOpen
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — isDocumentSafeToOpen', () => {
  it('returns true for valid document', () => {
    expect(isDocumentSafeToOpen(makeDoc())).toBe(true);
  });

  it('returns false when page count is 0', () => {
    expect(isDocumentSafeToOpen(makeDoc({ pageCount: 0 }))).toBe(false);
  });

  it('returns false when file size is 0', () => {
    expect(isDocumentSafeToOpen(makeDoc({ fileSizeBytes: 0 }))).toBe(false);
  });

  it('returns true for warnings-only document', () => {
    // xref incomplete is a warning, not critical
    expect(isDocumentSafeToOpen(makeDoc({ xrefComplete: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isDocumentSafeToEdit
// ---------------------------------------------------------------------------

describe('documentIntegrityValidator — isDocumentSafeToEdit', () => {
  it('returns true for a valid non-locked document', () => {
    expect(isDocumentSafeToEdit(makeDoc())).toBe(true);
  });

  it('returns false when edit-locked', () => {
    expect(isDocumentSafeToEdit(makeDoc({ editLocked: true }))).toBe(false);
  });

  it('returns false when encrypted', () => {
    expect(isDocumentSafeToEdit(makeDoc({ encrypted: true }))).toBe(false);
  });

  it('returns false when critical file size', () => {
    expect(isDocumentSafeToEdit(makeDoc({ fileSizeBytes: 0 }))).toBe(false);
  });
});
