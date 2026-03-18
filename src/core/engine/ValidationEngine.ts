// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Validation Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument } from '../document';
import type { ValidationOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Validation Engine - Handles PDF standards compliance and document validation
 */
export interface ValidationEngine {
  // -------------------------------------------------------------------------
  // PDF/A Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document against PDF/A standard
   */
  validatePdfA(
    document: PdfDocument,
    level: '1a' | '1b' | '2a' | '2b' | '2u' | '3a' | '3b' | '3u',
    options?: ValidationOptions
  ): AsyncEngineResult<{
    isValid: boolean;
    complianceLevel: string;
    errors: Array<{
      code: string;
      description: string;
      severity: 'error' | 'warning' | 'info';
      location?: string;
      objectRef?: string;
    }>;
    warnings: Array<{
      code: string;
      description: string;
      location?: string;
      objectRef?: string;
    }>;
    validationDate: Date;
    validator: string;
  }>;

  /**
   * Check PDF/A compliance without full validation
   */
  checkPdfACompliance(
    document: PdfDocument
  ): EngineResult<{
    claimedCompliance?: string;
    actualCompliance?: string;
    likelyCompliant: boolean;
    issues: string[];
  }>;

  /**
   * Fix PDF/A compliance issues
   */
  fixPdfACompliance(
    document: PdfDocument,
    targetLevel: '1a' | '1b' | '2a' | '2b' | '2u' | '3a' | '3b' | '3u',
    options?: ValidationOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // PDF/UA Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document against PDF/UA standard
   */
  validatePdfUa(
    document: PdfDocument,
    options?: ValidationOptions
  ): AsyncEngineResult<{
    isValid: boolean;
    errors: Array<{
      successCriterion?: string;
      description: string;
      severity: 'error' | 'warning';
      page?: number;
      objectRef?: string;
    }>;
    warnings: Array<{
      successCriterion?: string;
      description: string;
      page?: number;
      objectRef?: string;
    }>;
    validationDate: Date;
    validator: string;
  }>;

  /**
   * Check document accessibility
   */
  checkAccessibility(
    document: PdfDocument
  ): EngineResult<{
    hasTags: boolean;
    hasLanguage: boolean;
    hasTitle: boolean;
    hasBookmarks: boolean;
    hasAltText: boolean;
    isLinearized: boolean;
    readingOrder: boolean;
    colorContrast: boolean;
    issues: string[];
  }>;

  /**
   * Fix PDF/UA compliance issues
   */
  fixPdfUaCompliance(
    document: PdfDocument,
    options?: ValidationOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // PDF/X Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document against PDF/X standard
   */
  validatePdfX(
    document: PdfDocument,
    version: '1a' | '3' | '4' | '5',
    options?: ValidationOptions
  ): AsyncEngineResult<{
    isValid: boolean;
    errors: Array<{
      code: string;
      description: string;
      colorSpace?: string;
      trapping?: string;
      page?: number;
    }>;
    warnings: Array<{
      code: string;
      description: string;
      colorSpace?: string;
      trapping?: string;
      page?: number;
    }>;
    validationDate: Date;
    validator: string;
  }>;

  /**
   * Check print readiness
   */
  checkPrintReadiness(
    document: PdfDocument
  ): EngineResult<{
    isPrintReady: boolean;
    colorSpaces: string[];
    hasTrapping: boolean;
    hasBleed: boolean;
    hasCropMarks: boolean;
    resolution: number;
    issues: string[];
  }>;

  // -------------------------------------------------------------------------
  // Document Structure Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document structure
   */
  validateDocumentStructure(
    document: PdfDocument,
    options?: ValidationOptions
  ): AsyncEngineResult<{
    isValid: boolean;
    errors: Array<{
      code: string;
      description: string;
      severity: 'error' | 'warning' | 'info';
      location?: string;
    }>;
    warnings: Array<{
      code: string;
      description: string;
      location?: string;
    }>;
    structure: {
      hasValidHeader: boolean;
      hasValidTrailer: boolean;
      hasValidXref: boolean;
      objectCount: number;
      streamCount: number;
      pageCount: number;
    };
  }>;

  /**
   * Validate cross-reference table
   */
  validateXrefTable(
    document: PdfDocument
  ): AsyncEngineResult<{
    isValid: boolean;
    entries: number;
    freeEntries: number;
    usedEntries: number;
    issues: string[];
  }>;

  /**
   * Validate object streams
   */
  validateObjectStreams(
    document: PdfDocument
  ): AsyncEngineResult<{
    isValid: boolean;
    streamCount: number;
    objectCount: number;
    compressionRatio: number;
    issues: string[];
  }>;

  // -------------------------------------------------------------------------
  // Font Validation
  // -------------------------------------------------------------------------

  /**
   * Validate embedded fonts
   */
  validateFonts(
    document: PdfDocument
  ): AsyncEngineResult<{
    isValid: boolean;
    fonts: Array<{
      name: string;
      type: string;
      embedded: boolean;
      subset: boolean;
      valid: boolean;
      issues: string[];
    }>;
    issues: string[];
  }>;

  /**
   * Check font embedding requirements
   */
  checkFontEmbedding(
    document: PdfDocument
  ): AsyncEngineResult<{
    allFontsEmbedded: boolean;
    missingFonts: string[];
    subsetFonts: string[];
    systemFonts: string[];
  }>;

  // -------------------------------------------------------------------------
  // Color Validation
  // -------------------------------------------------------------------------

  /**
   * Validate color spaces
   */
  validateColorSpaces(
    document: PdfDocument
  ): AsyncEngineResult<{
    isValid: boolean;
    colorSpaces: Array<{
      name: string;
      type: string;
      deviceDependent: boolean;
      issues: string[];
    }>;
    issues: string[];
  }>;

  /**
   * Check color separation
   */
  checkColorSeparation(
    document: PdfDocument
  ): AsyncEngineResult<{
    hasSpotColors: boolean;
    hasProcessColors: boolean;
    spotColors: string[];
    processColors: string[];
    issues: string[];
  }>;

  // -------------------------------------------------------------------------
  // Image Validation
  // -------------------------------------------------------------------------

  /**
   * Validate images
   */
  validateImages(
    document: PdfDocument
  ): AsyncEngineResult<{
    isValid: boolean;
    images: Array<{
      format: string;
      width: number;
      height: number;
      dpi: number;
      colorSpace: string;
      compressed: boolean;
      issues: string[];
    }>;
    issues: string[];
  }>;

  /**
   * Check image resolution
   */
  checkImageResolution(
    document: PdfDocument,
    minDpi?: number
  ): AsyncEngineResult<{
    allAboveMinDpi: boolean;
    lowResolutionImages: Array<{
      pageIndex: number;
      imageIndex: number;
      dpi: number;
      width: number;
      height: number;
    }>;
  }>;

  // -------------------------------------------------------------------------
  // Metadata Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document metadata
   */
  validateMetadata(
    document: PdfDocument
  ): EngineResult<{
    isValid: boolean;
    metadata: Record<string, unknown>;
    missing: string[];
    invalid: Array<{
      field: string;
      issue: string;
    }>;
    issues: string[];
  }>;

  /**
   * Validate XMP metadata
   */
  validateXmpMetadata(
    document: PdfDocument
  ): EngineResult<{
    isValid: boolean;
    hasXmp: boolean;
    schemaCount: number;
    issues: string[];
  }>;

  // -------------------------------------------------------------------------
  // Security Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document security
   */
  validateSecurity(
    document: PdfDocument
  ): EngineResult<{
    isEncrypted: boolean;
    encryptionMethod?: string;
    permissions: Record<string, boolean>;
    vulnerabilities: string[];
    recommendations: string[];
  }>;

  /**
   * Check for malicious content
   */
  checkForMaliciousContent(
    document: PdfDocument
  ): EngineResult<{
    hasJavaScript: boolean;
    hasEmbeddedFiles: boolean;
    hasLaunchActions: boolean;
    hasURIactions: boolean;
    risks: string[];
    severity: 'low' | 'medium' | 'high';
  }>;

  // -------------------------------------------------------------------------
  // Performance Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document performance
   */
  validatePerformance(
    document: PdfDocument
  ): AsyncEngineResult<{
    fileSize: number;
    compressionRatio: number;
    linearized: boolean;
    loadTime: number;
    renderTime: number;
    issues: string[];
    recommendations: string[];
  }>;

  /**
   * Benchmark document operations
   */
  benchmarkDocument(
    document: PdfDocument,
    operations: Array<{
      type: string;
      parameters: Record<string, unknown>;
    }>
  ): AsyncEngineResult<Array<{
    operationType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>>;

  // -------------------------------------------------------------------------
  // Report Generation
  // -------------------------------------------------------------------------

  /**
   * Generate validation report
   */
  generateValidationReport(
    document: PdfDocument,
    validationTypes: string[]
  ): EngineResult<{
    summary: {
      documentName: string;
      fileSize: number;
      pageCount: number;
      validationDate: Date;
      overallStatus: 'pass' | 'fail' | 'warning';
    };
    validations: Array<{
      type: string;
      status: 'pass' | 'fail' | 'warning';
      errors: number;
      warnings: number;
      details: Record<string, unknown>;
    }>;
    recommendations: string[];
  }>;
}
