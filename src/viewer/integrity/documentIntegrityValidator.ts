// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import i18n from '../../i18n';

/**
 * Document Integrity Validator — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 2
 *
 * Pre-flight and post-save validation of document structural integrity.
 * Validates that a document is safe to open, edit, and save without
 * data loss or corruption.
 *
 * Checks:
 *   - pageCount: at least 1 page, below overflow threshold
 *   - metadata: title/author fields are strings (not null/undefined)
 *   - version: PDF version string is valid
 *   - permissions: encryption/restriction flags are internally consistent
 *   - crossReference: xref table coverage is complete (no missing objects)
 *   - annotations: annotation count is non-negative
 *   - fileSize: file size is within sane bounds
 *
 * Severity levels:
 *   'critical' — document cannot safely be used (abort operation)
 *   'warning'  — document has issues but is still usable
 *   'info'     — informational note only
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntegritySeverity = 'critical' | 'warning' | 'info';

export type IntegrityCode =
  | 'no-pages'
  | 'page-count-overflow'
  | 'invalid-pdf-version'
  | 'missing-metadata-title'
  | 'corrupt-metadata'
  | 'encryption-inconsistency'
  | 'xref-gap-detected'
  | 'annotation-count-negative'
  | 'file-size-zero'
  | 'file-size-overflow'
  | 'edit-locked';

export interface IntegrityIssue {
  readonly severity: IntegritySeverity;
  readonly code: IntegrityCode;
  readonly message: string;
  /** Page index (0-based) if the issue is page-specific. */
  readonly pageIndex?: number;
}

export interface IntegrityReport {
  readonly issues: IntegrityIssue[];
  readonly hasCritical: boolean;
  readonly hasWarnings: boolean;
  readonly clean: boolean;
}

// ---------------------------------------------------------------------------
// Document descriptor (input)
// ---------------------------------------------------------------------------

export interface DocumentDescriptor {
  /** Number of pages in the document. */
  readonly pageCount: number;
  /** PDF version string, e.g. '1.7' or '2.0'. */
  readonly pdfVersion: string;
  /** Document title (may be empty string, not null/undefined). */
  readonly title: string;
  /** Document author (may be empty string). */
  readonly author: string;
  /** Number of annotations across all pages. */
  readonly annotationCount: number;
  /** File size in bytes. */
  readonly fileSizeBytes: number;
  /** Whether the document is encrypted (read-only for editing). */
  readonly encrypted: boolean;
  /** Whether all cross-reference entries are accounted for. */
  readonly xrefComplete: boolean;
  /** Whether the document has any edit restrictions applied. */
  readonly editLocked: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum page count before overflow warning. */
export const MAX_PAGE_COUNT = 100_000;

/** Maximum sane file size in bytes (2 GB). */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/** Known valid PDF version strings. */
export const KNOWN_PDF_VERSIONS = ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '2.0'];

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Validate page count: must be >= 1 and below overflow threshold.
 */
export function checkPageCount(pageCount: number): IntegrityIssue | null {
  if (pageCount < 1) {
    return {
      severity: 'critical',
      code: 'no-pages',
      message: 'Document heeft geen pagina\'s. Het bestand is mogelijk corrupt.',
    };
  }
  if (pageCount > MAX_PAGE_COUNT) {
    return {
      severity: 'warning',
      code: 'page-count-overflow',
      message: `Document heeft meer dan ${MAX_PAGE_COUNT} pagina's. Prestatieproblemen mogelijk.`,
    };
  }
  return null;
}

/**
 * Validate PDF version string against known valid values.
 */
export function checkPdfVersion(pdfVersion: string): IntegrityIssue | null {
  if (!KNOWN_PDF_VERSIONS.includes(pdfVersion)) {
    return {
      severity: 'warning',
      code: 'invalid-pdf-version',
      message: `Onbekende PDF-versie '${pdfVersion}'. Compatibiliteit niet gegarandeerd.`,
    };
  }
  return null;
}

/**
 * Check metadata fields: title and author must be strings.
 */
export function checkMetadata(title: string, author: string): IntegrityIssue | null {
  if (typeof title !== 'string' || typeof author !== 'string') {
    return {
      severity: 'warning',
      code: 'corrupt-metadata',
      message: 'Document-metadata is onleesbaar of corrupt.',
    };
  }
  return null;
}

/**
 * Check whether the xref table is complete (no gaps).
 */
export function checkXrefCompleteness(xrefComplete: boolean): IntegrityIssue | null {
  if (!xrefComplete) {
    return {
      severity: 'warning',
      code: 'xref-gap-detected',
      message: 'Cross-referentietabel is incompleet. Sommige objecten zijn mogelijk onbereikbaar.',
    };
  }
  return null;
}

/**
 * Check annotation count is non-negative.
 */
export function checkAnnotationCount(annotationCount: number): IntegrityIssue | null {
  if (annotationCount < 0) {
    return {
      severity: 'warning',
      code: 'annotation-count-negative',
      message: 'Negatief aantal annotaties gedetecteerd. Metadata mogelijk corrupt.',
    };
  }
  return null;
}

/**
 * Check file size is within sane bounds.
 */
export function checkFileSize(fileSizeBytes: number): IntegrityIssue | null {
  if (fileSizeBytes <= 0) {
    return {
      severity: 'critical',
      code: 'file-size-zero',
      message: i18n.t('integrity.fileSizeZero'),
    };
  }
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      severity: 'warning',
      code: 'file-size-overflow',
      message: i18n.t('integrity.fileSizeOverflow'),
    };
  }
  return null;
}

/**
 * Check encryption / edit-locked consistency.
 * An encrypted document that also claims to be edit-locked is flagged as
 * an inconsistency (encryption already implies restrictions).
 */
export function checkEncryptionConsistency(
  encrypted: boolean,
  editLocked: boolean,
): IntegrityIssue | null {
  if (encrypted && editLocked) {
    return {
      severity: 'info',
      code: 'encryption-inconsistency',
      message: 'Document is versleuteld én bewerkingsvergrendeld. Bewerkingen zijn geblokkeerd.',
    };
  }
  return null;
}

/**
 * Check edit lock — if set, editing must be blocked.
 */
export function checkEditLock(editLocked: boolean): IntegrityIssue | null {
  if (editLocked) {
    return {
      severity: 'warning',
      code: 'edit-locked',
      message: 'Document is beveiligd tegen bewerking. Wijzigingen zijn niet mogelijk.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

function makeReport(issues: IntegrityIssue[]): IntegrityReport {
  return {
    issues,
    hasCritical: issues.some(i => i.severity === 'critical'),
    hasWarnings: issues.some(i => i.severity === 'warning'),
    clean: issues.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Full validation
// ---------------------------------------------------------------------------

/**
 * Run all integrity checks for a document descriptor.
 * Returns an IntegrityReport with all discovered issues.
 */
export function validateDocumentIntegrity(doc: DocumentDescriptor): IntegrityReport {
  const issues: IntegrityIssue[] = [];

  const fileIssue = checkFileSize(doc.fileSizeBytes);
  if (fileIssue) issues.push(fileIssue);

  // If file size is critical, skip further checks (unreadable document)
  if (fileIssue?.severity === 'critical') {
    return makeReport(issues);
  }

  const pageIssue = checkPageCount(doc.pageCount);
  if (pageIssue) issues.push(pageIssue);

  const versionIssue = checkPdfVersion(doc.pdfVersion);
  if (versionIssue) issues.push(versionIssue);

  const metaIssue = checkMetadata(doc.title, doc.author);
  if (metaIssue) issues.push(metaIssue);

  const xrefIssue = checkXrefCompleteness(doc.xrefComplete);
  if (xrefIssue) issues.push(xrefIssue);

  const annotIssue = checkAnnotationCount(doc.annotationCount);
  if (annotIssue) issues.push(annotIssue);

  const encryptIssue = checkEncryptionConsistency(doc.encrypted, doc.editLocked);
  if (encryptIssue) issues.push(encryptIssue);

  const lockIssue = checkEditLock(doc.editLocked);
  if (lockIssue) issues.push(lockIssue);

  return makeReport(issues);
}

/**
 * Quick check: is the document safe to open for viewing?
 * Returns true only when no critical issues are found.
 */
export function isDocumentSafeToOpen(doc: DocumentDescriptor): boolean {
  const report = validateDocumentIntegrity(doc);
  return !report.hasCritical;
}

/**
 * Quick check: is the document safe to edit?
 * Returns true only when no critical issues AND the document is not edit-locked.
 */
export function isDocumentSafeToEdit(doc: DocumentDescriptor): boolean {
  if (doc.editLocked || doc.encrypted) return false;
  const report = validateDocumentIntegrity(doc);
  return !report.hasCritical;
}
