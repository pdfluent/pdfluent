// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument } from '../../document';
import type { EngineResult, AsyncEngineResult } from '../types';

function notImpl<T>(msg: string): AsyncEngineResult<T> {
  return Promise.resolve({ success: false, error: { code: 'not-implemented' as const, message: msg } });
}

export class MockValidationEngine {
  // Async validations

  validatePdfA(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({
      success: true,
      value: {
        isValid: true,
        complianceLevel: 'PDF/A-1b',
        errors: [],
        warnings: [],
        validationDate: new Date(),
        validator: 'Mock Validator'
      }
    });
  }

  fixPdfACompliance(): AsyncEngineResult<PdfDocument> {
    return notImpl('fixPdfACompliance not implemented in MockValidationEngine');
  }

  validatePdfUa(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({
      success: true,
      value: {
        isValid: true,
        errors: [],
        warnings: [],
        validationDate: new Date(),
        validator: 'Mock Validator'
      }
    });
  }

  fixPdfUaCompliance(): AsyncEngineResult<PdfDocument> {
    return notImpl('fixPdfUaCompliance not implemented in MockValidationEngine');
  }

  validatePdfX(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({
      success: true,
      value: {
        isValid: true,
        errors: [],
        warnings: [],
        validationDate: new Date(),
        validator: 'Mock Validator'
      }
    });
  }

  validateDocumentStructure(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({
      success: true,
      value: {
        isValid: true,
        errors: [],
        warnings: [],
        structure: {
          hasValidHeader: true,
          hasValidTrailer: true,
          hasValidXref: true,
          objectCount: 100,
          streamCount: 20,
          pageCount: 3
        }
      }
    });
  }

  validateXrefTable(): AsyncEngineResult<{
    isValid: boolean;
    entries: number;
    freeEntries: number;
    usedEntries: number;
    issues: string[];
  }> {
    return Promise.resolve({
      success: true,
      value: { isValid: true, entries: 100, freeEntries: 10, usedEntries: 90, issues: [] }
    });
  }

  validateObjectStreams(): AsyncEngineResult<{
    isValid: boolean;
    streamCount: number;
    objectCount: number;
    compressionRatio: number;
    issues: string[];
  }> {
    return Promise.resolve({
      success: true,
      value: { isValid: true, streamCount: 20, objectCount: 100, compressionRatio: 0.5, issues: [] }
    });
  }

  validateFonts(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({ success: true, value: { isValid: true, fonts: [], issues: [] } });
  }

  checkFontEmbedding(): AsyncEngineResult<{
    allFontsEmbedded: boolean;
    missingFonts: string[];
    subsetFonts: string[];
    systemFonts: string[];
  }> {
    return Promise.resolve({
      success: true,
      value: { allFontsEmbedded: true, missingFonts: [], subsetFonts: [], systemFonts: [] }
    });
  }

  validateColorSpaces(): AsyncEngineResult<{
    isValid: boolean;
    colorSpaces: Array<{
      name: string;
      type: string;
      deviceDependent: boolean;
      issues: string[];
    }>;
    issues: string[];
  }> {
    return Promise.resolve({ success: true, value: { isValid: true, colorSpaces: [], issues: [] } });
  }

  checkColorSeparation(): AsyncEngineResult<{
    hasSpotColors: boolean;
    hasProcessColors: boolean;
    spotColors: string[];
    processColors: string[];
    issues: string[];
  }> {
    return Promise.resolve({
      success: true,
      value: {
        hasSpotColors: false,
        hasProcessColors: true,
        spotColors: [],
        processColors: ['Cyan', 'Magenta', 'Yellow', 'Black'],
        issues: []
      }
    });
  }

  validateImages(): AsyncEngineResult<{
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
  }> {
    return Promise.resolve({ success: true, value: { isValid: true, images: [], issues: [] } });
  }

  checkImageResolution(): AsyncEngineResult<{
    allAboveMinDpi: boolean;
    lowResolutionImages: Array<{
      pageIndex: number;
      imageIndex: number;
      dpi: number;
      width: number;
      height: number;
    }>;
  }> {
    return Promise.resolve({ success: true, value: { allAboveMinDpi: true, lowResolutionImages: [] } });
  }

  validatePerformance(): AsyncEngineResult<{
    fileSize: number;
    compressionRatio: number;
    linearized: boolean;
    loadTime: number;
    renderTime: number;
    issues: string[];
    recommendations: string[];
  }> {
    return Promise.resolve({
      success: true,
      value: {
        fileSize: 1024 * 1024,
        compressionRatio: 0.5,
        linearized: false,
        loadTime: 100,
        renderTime: 50,
        issues: [],
        recommendations: ['Consider linearizing for web delivery']
      }
    });
  }

  benchmarkDocument(): AsyncEngineResult<Array<{
    operationType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>> {
    return notImpl('benchmarkDocument not implemented in MockValidationEngine');
  }

  // Sync reads

  checkPdfACompliance(): EngineResult<{
    claimedCompliance?: string;
    actualCompliance?: string;
    likelyCompliant: boolean;
    issues: string[];
  }> {
    return { success: true, value: { likelyCompliant: true, issues: [] } };
  }

  checkAccessibility(): EngineResult<{
    hasTags: boolean;
    hasLanguage: boolean;
    hasTitle: boolean;
    hasBookmarks: boolean;
    hasAltText: boolean;
    isLinearized: boolean;
    readingOrder: boolean;
    colorContrast: boolean;
    issues: string[];
  }> {
    return {
      success: true,
      value: {
        hasTags: false,
        hasLanguage: false,
        hasTitle: true,
        hasBookmarks: false,
        hasAltText: false,
        isLinearized: false,
        readingOrder: true,
        colorContrast: true,
        issues: []
      }
    };
  }

  checkPrintReadiness(): EngineResult<{
    isPrintReady: boolean;
    colorSpaces: string[];
    hasTrapping: boolean;
    hasBleed: boolean;
    hasCropMarks: boolean;
    resolution: number;
    issues: string[];
  }> {
    return {
      success: true,
      value: {
        isPrintReady: true,
        colorSpaces: ['DeviceRGB'],
        hasTrapping: false,
        hasBleed: false,
        hasCropMarks: false,
        resolution: 300,
        issues: []
      }
    };
  }

  validateMetadata(): EngineResult<{
    isValid: boolean;
    metadata: Record<string, unknown>;
    missing: string[];
    invalid: Array<{ field: string; issue: string }>;
    issues: string[];
  }> {
    return { success: true, value: { isValid: true, metadata: {}, missing: [], invalid: [], issues: [] } };
  }

  validateXmpMetadata(): EngineResult<{
    isValid: boolean;
    hasXmp: boolean;
    schemaCount: number;
    issues: string[];
  }> {
    return { success: true, value: { isValid: true, hasXmp: false, schemaCount: 0, issues: [] } };
  }

  validateSecurity(): EngineResult<{
    isEncrypted: boolean;
    encryptionMethod?: string;
    permissions: Record<string, boolean>;
    vulnerabilities: string[];
    recommendations: string[];
  }> {
    return {
      success: true,
      value: {
        isEncrypted: false,
        permissions: {
          canPrint: true, canModify: true, canCopy: true, canAnnotate: true,
          canFillForms: true, canExtractContent: true, canAssemble: true
        },
        vulnerabilities: [],
        recommendations: []
      }
    };
  }

  checkForMaliciousContent(): EngineResult<{
    hasJavaScript: boolean;
    hasEmbeddedFiles: boolean;
    hasLaunchActions: boolean;
    hasURIactions: boolean;
    risks: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    return {
      success: true,
      value: {
        hasJavaScript: false,
        hasEmbeddedFiles: false,
        hasLaunchActions: false,
        hasURIactions: false,
        risks: [],
        severity: 'low'
      }
    };
  }

  generateValidationReport(): EngineResult<{
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
  }> {
    return {
      success: true,
      value: {
        summary: {
          documentName: 'Mock Document',
          fileSize: 1024 * 1024,
          pageCount: 3,
          validationDate: new Date(),
          overallStatus: 'pass'
        },
        validations: [{ type: 'PDF/A', status: 'pass', errors: 0, warnings: 0, details: {} }],
        recommendations: []
      }
    };
  }
}
