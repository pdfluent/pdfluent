// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Core Document Metadata
// ---------------------------------------------------------------------------

/**
 * Standard PDF document metadata following ISO 32000 specification.
 *
 * This includes both the standard Info dictionary entries and
 * XMP metadata for modern PDF documents.
 */
export interface DocumentMetadata {
  // -------------------------------------------------------------------------
  // Standard Info Dictionary Entries (PDF 1.0-1.7)
  // -------------------------------------------------------------------------

  /** Document title */
  readonly title: string;

  /** Document author */
  readonly author: string;

  /** Document subject */
  readonly subject: string;

  /** Document keywords (comma-separated in PDF, array here) */
  readonly keywords: string[];

  /** Application that created the document */
  readonly creator: string;

  /** Application that produced the PDF */
  readonly producer: string;

  /** Document creation date */
  readonly creationDate: Date;

  /** Document modification date */
  readonly modificationDate: Date;

  /** Whether the document has been trapped */
  readonly trapped: boolean;

  // -------------------------------------------------------------------------
  // XMP Metadata (PDF 1.4+)
  // -------------------------------------------------------------------------

  /** Dublin Core metadata */
  readonly xmp?: XmpMetadata;

  /** PDF/A specific metadata */
  readonly pdfa?: PdfaMetadata;

  /** PDF/UA specific metadata */
  readonly pdfua?: PdfuaMetadata;

  /** PDF/X specific metadata */
  readonly pdfx?: PdfxMetadata;

  // -------------------------------------------------------------------------
  // XFA-specific Metadata
  // -------------------------------------------------------------------------

  /** Whether document contains XFA forms */
  readonly hasXfa: boolean;

  /** XFA form type if present */
  readonly xfaFormType?: XfaFormType;

  /** XFA rendering support status */
  readonly xfaRenderingSupported: boolean;

  /** XFA-specific notice or warning */
  readonly xfaNotice?: string;

  // -------------------------------------------------------------------------
  // Technical Metadata
  // -------------------------------------------------------------------------

  /** PDF version (e.g., "1.7", "2.0") */
  readonly pdfVersion: string;

  /** Whether the PDF is linearized (optimized for web) */
  readonly linearized: boolean;

  /** Whether the PDF is encrypted */
  readonly encrypted: boolean;

  /** Encryption method if encrypted */
  readonly encryptionMethod?: EncryptionMethod;

  /** Number of incremental updates */
  readonly incrementalUpdates: number;

  /** Document ID (first part of file identifier) */
  readonly documentId: string;

  /** Whether the document contains JavaScript */
  readonly hasJavaScript: boolean;

  /** Whether the document contains embedded files */
  readonly hasEmbeddedFiles: boolean;

  /** Whether the document contains multimedia */
  readonly hasMultimedia: boolean;

  // -------------------------------------------------------------------------
  // Compliance Information
  // -------------------------------------------------------------------------

  /** PDF/A compliance level if any */
  readonly pdfaCompliance?: PdfaComplianceLevel;

  /** PDF/UA compliance status */
  readonly pdfuaCompliant: boolean;

  /** PDF/X compliance level if any */
  readonly pdfxCompliance?: PdfxComplianceLevel;

  // -------------------------------------------------------------------------
  // Custom Metadata
  // -------------------------------------------------------------------------

  /** Custom metadata entries */
  readonly custom: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// XMP Metadata Types
// ---------------------------------------------------------------------------

export interface XmpMetadata {
  /** Dublin Core metadata */
  readonly dc?: {
    readonly title?: XmpLangAlt;
    readonly creator?: string[];
    readonly description?: XmpLangAlt;
    readonly subject?: string[];
    readonly publisher?: string[];
    readonly contributor?: string[];
    readonly date?: Date[];
    readonly type?: string[];
    readonly format?: string;
    readonly identifier?: string;
    readonly source?: string;
    readonly language?: string[];
    readonly relation?: string[];
    readonly coverage?: string;
    readonly rights?: XmpLangAlt;
  };

  /** PDF specific metadata */
  readonly pdf?: {
    readonly keywords?: string;
    readonly pdfVersion?: string;
    readonly producer?: string;
  };

  /** XMP basic schema */
  readonly xmp?: {
    readonly createDate?: Date;
    readonly modifyDate?: Date;
    readonly metadataDate?: Date;
    readonly creatorTool?: string;
    readonly identifier?: string[];
  };

  /** XMP rights management */
  readonly xmpRights?: {
    readonly marked?: boolean;
    readonly webStatement?: string;
    readonly usageTerms?: XmpLangAlt;
  };

  /** Adobe PDF schema */
  readonly pdfx?: {
    readonly gtsPdfxVersion?: string;
    readonly gtsPdfxConformance?: string;
  };
}

/** XMP language alternative (multiple language versions) */
export interface XmpLangAlt {
  readonly 'x-default': string;
  readonly [language: string]: string;
}

// ---------------------------------------------------------------------------
// PDF/A Metadata
// ---------------------------------------------------------------------------

export interface PdfaMetadata {
  /** PDF/A part (1, 2, or 3) */
  readonly part: 1 | 2 | 3;

  /** PDF/A conformance level (A, B, or U) */
  readonly conformance: 'A' | 'B' | 'U';

  /** PDF/A version string */
  readonly version: string;

  /** Whether the document claims PDF/A compliance */
  readonly claimed: boolean;

  /** Actual validation results */
  readonly validation?: PdfaValidationResult;
}

export type PdfaComplianceLevel = `${1 | 2 | 3}${'A' | 'B' | 'U'}`;

export interface PdfaValidationResult {
  /** Whether the document is valid PDF/A */
  readonly isValid: boolean;

  /** Validation date */
  readonly validationDate: Date;

  /** Validator used */
  readonly validator: string;

  /** Validation errors if any */
  readonly errors: PdfaValidationError[];

  /** Compliance level achieved */
  readonly achievedCompliance?: PdfaComplianceLevel;
}

export interface PdfaValidationError {
  /** Error code */
  readonly code: string;

  /** Error description */
  readonly description: string;

  /** Error severity */
  readonly severity: 'error' | 'warning' | 'info';

  /** Location in document */
  readonly location?: string;

  /** Object reference */
  readonly objectRef?: string;
}

// ---------------------------------------------------------------------------
// PDF/UA Metadata
// ---------------------------------------------------------------------------

export interface PdfuaMetadata {
  /** Whether document claims PDF/UA compliance */
  readonly claimed: boolean;

  /** Validation results */
  readonly validation?: PdfuaValidationResult;
}

export interface PdfuaValidationResult {
  /** Whether the document is valid PDF/UA */
  readonly isValid: boolean;

  /** Validation date */
  readonly validationDate: Date;

  /** Validator used */
  readonly validator: string;

  /** Accessibility errors */
  readonly errors: PdfuaValidationError[];
}

export interface PdfuaValidationError {
  /** WCAG success criterion */
  readonly successCriterion?: string;

  /** Error description */
  readonly description: string;

  /** Error severity */
  readonly severity: 'error' | 'warning';

  /** Page number */
  readonly page?: number;

  /** Object reference */
  readonly objectRef?: string;
}

// ---------------------------------------------------------------------------
// PDF/X Metadata
// ---------------------------------------------------------------------------

export interface PdfxMetadata {
  /** PDF/X version */
  readonly version: PdfxVersion;

  /** Whether document claims PDF/X compliance */
  readonly claimed: boolean;

  /** Validation results */
  readonly validation?: PdfxValidationResult;
}

export type PdfxVersion = '1a' | '3' | '4' | '5';

export type PdfxComplianceLevel = `PDF/X-${PdfxVersion}`;

export interface PdfxValidationResult {
  /** Whether the document is valid PDF/X */
  readonly isValid: boolean;

  /** Validation date */
  readonly validationDate: Date;

  /** Validator used */
  readonly validator: string;

  /** Print-related errors */
  readonly errors: PdfxValidationError[];
}

export interface PdfxValidationError {
  /** Error code */
  readonly code: string;

  /** Error description */
  readonly description: string;

  /** Color space issue */
  readonly colorSpace?: string;

  /** Trapping issue */
  readonly trapping?: string;

  /** Page number */
  readonly page?: number;
}

// ---------------------------------------------------------------------------
// XFA Form Types
// ---------------------------------------------------------------------------

export type XfaFormType =
  | 'static'    // Static XFA form (rendered as part of PDF)
  | 'dynamic'   // Dynamic XFA form (requires runtime)
  | 'hybrid';   // Hybrid form (both AcroForm and XFA)

// ---------------------------------------------------------------------------
// Encryption Methods
// ---------------------------------------------------------------------------

export type EncryptionMethod =
  | 'none'
  | 'standard'      // Standard security handler (PDF 1.1-1.7)
  | 'public-key'    // Public-key security handler
  | 'aes-128'       // AES-128 encryption
  | 'aes-256'       // AES-256 encryption
  | 'custom';       // Custom security handler

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Create default document metadata
 */
export function createDefaultMetadata(): DocumentMetadata {
  const now = new Date();

  return {
    title: '',
    author: '',
    subject: '',
    keywords: [],
    creator: 'PDFluent',
    producer: 'PDFluent',
    creationDate: now,
    modificationDate: now,
    trapped: false,

    hasXfa: false,
    xfaRenderingSupported: false,

    pdfVersion: '1.7',
    linearized: false,
    encrypted: false,
    incrementalUpdates: 0,
    documentId: '',
    hasJavaScript: false,
    hasEmbeddedFiles: false,
    hasMultimedia: false,

    pdfuaCompliant: false,

    custom: {},
  };
}

/**
 * Extract metadata from PDF info dictionary
 */
export function extractFromInfoDict(infoDict: Record<string, unknown>): Partial<DocumentMetadata> {
  const result: Partial<DocumentMetadata> = {};
  const mutableResult: any = result;

  if (typeof infoDict.Title === 'string') {
    mutableResult.title = infoDict.Title;
  }
  if (typeof infoDict.Author === 'string') {
    mutableResult.author = infoDict.Author;
  }
  if (typeof infoDict.Subject === 'string') {
    mutableResult.subject = infoDict.Subject;
  }
  if (typeof infoDict.Keywords === 'string') {
    mutableResult.keywords = infoDict.Keywords.split(',').map(k => k.trim());
  }
  if (typeof infoDict.Creator === 'string') {
    mutableResult.creator = infoDict.Creator;
  }
  if (typeof infoDict.Producer === 'string') {
    mutableResult.producer = infoDict.Producer;
  }

  // Parse dates (PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm')
  if (typeof infoDict.CreationDate === 'string') {
    mutableResult.creationDate =parsePdfDate(infoDict.CreationDate);
  }
  if (typeof infoDict.ModDate === 'string') {
    mutableResult.modificationDate = parsePdfDate(infoDict.ModDate);
  }

  if (typeof infoDict.Trapped === 'string') {
    mutableResult.trapped = infoDict.Trapped.toLowerCase() === 'true';
  }

  return result;
}

/**
 * Parse PDF date string
 *
 * PDF dates format: D:YYYYMMDDHHmmSSOHH'mm'
 * Example: D:20250101120000+01'00'
 */
function parsePdfDate(pdfDate: string): Date {
  // Remove the leading 'D:' if present
  const dateStr = pdfDate.startsWith('D:') ? pdfDate.slice(2) : pdfDate;

  // Extract date components
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(dateStr.slice(6, 8), 10) || 1;
  const hour = parseInt(dateStr.slice(8, 10), 10) || 0;
  const minute = parseInt(dateStr.slice(10, 12), 10) || 0;
  const second = parseInt(dateStr.slice(12, 14), 10) || 0;

  // Create date (UTC)
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));

  // Handle timezone offset if present
  if (dateStr.length > 14) {
    const tzSign = dateStr.charAt(14);
    const tzHour = parseInt(dateStr.slice(15, 17), 10) || 0;
    const tzMinute = parseInt(dateStr.slice(18, 20), 10) || 0;

    if (tzSign === '+' || tzSign === '-') {
      const offsetMinutes = (tzHour * 60 + tzMinute) * (tzSign === '+' ? -1 : 1);
      date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
    }
  }

  return date;
}

/**
 * Merge multiple metadata sources
 */
export function mergeMetadata(
  sources: Partial<DocumentMetadata>[]
): DocumentMetadata {
  const base = createDefaultMetadata();

  return sources.reduce((result: DocumentMetadata, source: Partial<DocumentMetadata>): DocumentMetadata => {
    // Build the merged metadata with explicit type handling
    const merged: DocumentMetadata = {
      // Core metadata properties
      title: source.title !== undefined ? source.title : result.title,
      author: source.author !== undefined ? source.author : result.author,
      subject: source.subject !== undefined ? source.subject : result.subject,
      keywords: source.keywords !== undefined ? source.keywords : result.keywords,
      creator: source.creator !== undefined ? source.creator : result.creator,
      producer: source.producer !== undefined ? source.producer : result.producer,
      creationDate: source.creationDate instanceof Date ? source.creationDate : result.creationDate,
      modificationDate: source.modificationDate instanceof Date ? source.modificationDate : result.modificationDate,
      trapped: source.trapped !== undefined ? source.trapped : result.trapped,

      // XMP metadata
      xmp: source.xmp !== undefined ? source.xmp : result.xmp,
      pdfa: source.pdfa !== undefined ? source.pdfa : result.pdfa,
      pdfua: source.pdfua !== undefined ? source.pdfua : result.pdfua,
      pdfx: source.pdfx !== undefined ? source.pdfx : result.pdfx,

      // XFA-specific metadata
      hasXfa: source.hasXfa !== undefined ? source.hasXfa : result.hasXfa,
      xfaFormType: source.xfaFormType !== undefined ? source.xfaFormType : result.xfaFormType,
      xfaRenderingSupported: source.xfaRenderingSupported !== undefined ? source.xfaRenderingSupported : result.xfaRenderingSupported,
      xfaNotice: source.xfaNotice !== undefined ? source.xfaNotice : result.xfaNotice,

      // Technical metadata
      pdfVersion: source.pdfVersion !== undefined ? source.pdfVersion : result.pdfVersion,
      linearized: source.linearized !== undefined ? source.linearized : result.linearized,
      encrypted: source.encrypted !== undefined ? source.encrypted : result.encrypted,
      encryptionMethod: source.encryptionMethod !== undefined ? source.encryptionMethod : result.encryptionMethod,
      incrementalUpdates: source.incrementalUpdates !== undefined ? source.incrementalUpdates : result.incrementalUpdates,
      documentId: source.documentId !== undefined ? source.documentId : result.documentId,
      hasJavaScript: source.hasJavaScript !== undefined ? source.hasJavaScript : result.hasJavaScript,
      hasEmbeddedFiles: source.hasEmbeddedFiles !== undefined ? source.hasEmbeddedFiles : result.hasEmbeddedFiles,
      hasMultimedia: source.hasMultimedia !== undefined ? source.hasMultimedia : result.hasMultimedia,

      // Compliance information
      pdfaCompliance: source.pdfaCompliance !== undefined ? source.pdfaCompliance : result.pdfaCompliance,
      pdfuaCompliant: source.pdfuaCompliant !== undefined ? source.pdfuaCompliant : result.pdfuaCompliant,
      pdfxCompliance: source.pdfxCompliance !== undefined ? source.pdfxCompliance : result.pdfxCompliance,

      // Custom metadata
      custom: { ...result.custom, ...(source.custom ?? {}) },
    };
    return merged;
  }, base);
}