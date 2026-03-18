// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Runtime, Engine, OperationType, LimitType, LimitInfo, Result } from '../types';

// ---------------------------------------------------------------------------
// CapabilityRegistry Interface
// ---------------------------------------------------------------------------

/**
 * Central registry for runtime capability checks.
 *
 * This interface provides a single source of truth for what operations
 * are supported in the current runtime environment. It prevents platform-
 * specific code from leaking into UI and business logic.
 *
 * All components should query capabilities through this interface rather
 * than checking runtime directly.
 */
export interface CapabilityRegistry {
  // -------------------------------------------------------------------------
  // Platform Identification
  // -------------------------------------------------------------------------

  /** Current runtime environment */
  readonly runtime: Runtime;

  /** Current PDF engine */
  readonly engine: Engine;

  /** Human-readable engine version */
  readonly engineVersion: string;

  // -------------------------------------------------------------------------
  // Core PDF Capabilities
  // -------------------------------------------------------------------------

  /** Whether the engine can open and parse PDF files */
  readonly supportsOpening: boolean;

  /** Whether the engine can save/modify PDF files */
  readonly supportsSaving: boolean;

  /** Whether the engine can render PDF pages to images */
  readonly supportsRendering: boolean;

  /** Maximum rendering DPI supported */
  readonly maxRenderDpi: number;

  // -------------------------------------------------------------------------
  // Advanced PDF Capabilities
  // -------------------------------------------------------------------------

  /** Whether annotations are supported (highlight, comment, freehand, etc.) */
  readonly supportsAnnotations: boolean;

  /** Whether AcroForm/XFA form filling is supported */
  readonly supportsForms: boolean;

  /** Whether digital signatures are supported */
  readonly supportsSignatures: boolean;

  /** Whether OCR (text recognition) is supported */
  readonly supportsOCR: boolean;

  /** Whether redaction (GDPR-compliant content removal) is supported */
  readonly supportsRedaction: boolean;

  /** Whether PDF/A validation is supported */
  readonly supportsPdfaValidation: boolean;

  // -------------------------------------------------------------------------
  // Document Manipulation Capabilities
  // -------------------------------------------------------------------------

  /** Whether merging multiple PDFs is supported */
  readonly supportsMerge: boolean;

  /** Whether splitting PDFs into multiple files is supported */
  readonly supportsSplit: boolean;

  /** Whether rotating pages is supported */
  readonly supportsRotation: boolean;

  /** Whether compressing PDFs is supported */
  readonly supportsCompression: boolean;

  /** Whether watermarking is supported */
  readonly supportsWatermark: boolean;

  /** Whether encryption/decryption is supported */
  readonly supportsEncryption: boolean;

  // -------------------------------------------------------------------------
  // Content Intelligence Capabilities
  // -------------------------------------------------------------------------

  /** Whether text extraction is supported */
  readonly supportsTextExtraction: boolean;

  /** Whether image extraction is supported */
  readonly supportsImageExtraction: boolean;

  /** Whether document structure analysis is supported */
  readonly supportsStructureAnalysis: boolean;

  // -------------------------------------------------------------------------
  // Performance and Resource Limits
  // -------------------------------------------------------------------------

  /** Maximum file size in bytes */
  readonly maxFileSize: number;

  /** Maximum number of pages per document */
  readonly maxPages: number;

  /** Whether progressive rendering is supported (render low-res first) */
  readonly supportsProgressiveRender: boolean;

  /** Maximum concurrent operations */
  readonly maxConcurrentOperations: number;

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Check if a specific operation is supported
   * @param operation The operation to check
   * @returns true if the operation is supported, false otherwise
   */
  canPerform(operation: OperationType): boolean;

  /**
   * Get limits for a specific resource type
   * @param limitType The type of limit to query
   * @returns Detailed limit information
   */
  getLimits(limitType: LimitType): LimitInfo;

  /**
   * Check if a file can be processed based on size and other constraints
   * @param fileSize Size of the file in bytes
   * @param pageCount Number of pages in the document
   * @returns Result indicating whether the file can be processed
   */
  canProcessFile(fileSize: number, pageCount: number): CapabilityResult<void>;

  // -------------------------------------------------------------------------
  // Feature Availability
  // -------------------------------------------------------------------------

  /**
   * Get a list of all supported operations
   * @returns Array of supported operation types
   */
  getSupportedOperations(): OperationType[];

  /**
   * Get a human-readable description of engine limitations
   * @returns String describing limitations
   */
  getLimitationsDescription(): string;
}

// ---------------------------------------------------------------------------
// Error Types for Capability Checks
// ---------------------------------------------------------------------------

export type CapabilityErrorCode =
  | 'unsupported-operation'
  | 'file-too-large'
  | 'too-many-pages'
  | 'resource-limit-exceeded';

export interface CapabilityError {
  code: CapabilityErrorCode;
  message: string;
  details?: {
    fileSize?: number;
    pageCount?: number;
    limit?: number;
    operation?: OperationType;
  };
}

// ---------------------------------------------------------------------------
// Result Type with Capability Errors
// ---------------------------------------------------------------------------

export type CapabilityResult<T> = Result<T, CapabilityError>;