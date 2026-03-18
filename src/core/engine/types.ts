// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Engine Common Types
// ---------------------------------------------------------------------------

import type { Result } from '../types';

// ---------------------------------------------------------------------------
// Engine Error Types
// ---------------------------------------------------------------------------

export type EngineErrorCode =
  | 'engine-not-initialized'
  | 'document-not-loaded'
  | 'page-not-found'
  | 'operation-not-supported'
  | 'file-too-large'
  | 'invalid-file-format'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'network-error'
  | 'internal-error'
  | 'runtime-unavailable'
  | 'not-implemented';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type EngineResult<T> = Result<T, EngineError>;
export type AsyncEngineResult<T> = Promise<EngineResult<T>>;

// ---------------------------------------------------------------------------
// Engine Configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  /** Maximum concurrent operations */
  maxConcurrentOperations: number;

  /** Memory limit in bytes */
  memoryLimit: number;

  /** Cache size for rendered pages */
  renderCacheSize: number;

  /** Enable debug logging */
  debug: boolean;

  /** Custom engine-specific options */
  options: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Document Loading Options
// ---------------------------------------------------------------------------

export interface DocumentLoadOptions {
  /** Password for encrypted documents */
  password?: string;

  /** Whether to load metadata only (no pages) */
  metadataOnly?: boolean;

  /** Whether to preload all pages */
  preloadPages?: boolean;

  /** Page range to load (e.g., "1-5,10-15") */
  pageRange?: string;

  /** Custom load options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rendering Options
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** DPI for rendering */
  dpi?: number;

  /** Background color (CSS color string) */
  backgroundColor?: string;

  /** Whether to render annotations */
  renderAnnotations?: boolean;

  /** Whether to render form fields */
  renderFormFields?: boolean;

  /** Image format for output */
  format?: 'png' | 'jpeg' | 'webp';

  /** JPEG quality (0-100) */
  quality?: number;

  /** Custom render options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Save Options
// ---------------------------------------------------------------------------

export interface SaveOptions {
  /** Whether to optimize file size */
  optimize?: boolean;

  /** Whether to linearize for web streaming */
  linearize?: boolean;

  /** PDF version (e.g., "1.7", "2.0") */
  pdfVersion?: string;

  /** Whether to preserve annotations */
  preserveAnnotations?: boolean;

  /** Whether to preserve form fields */
  preserveFormFields?: boolean;

  /** Custom save options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Annotation Creation Options
// ---------------------------------------------------------------------------

export interface AnnotationCreateOptions {
  /** Whether to validate annotation bounds */
  validateBounds?: boolean;

  /** Default color for annotation */
  defaultColor?: string;

  /** Default opacity (0.0-1.0) */
  defaultOpacity?: number;

  /** Custom annotation options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Form Field Options
// ---------------------------------------------------------------------------

export interface FormFieldOptions {
  /** Whether to validate field values */
  validateValues?: boolean;

  /** Whether to preserve formatting */
  preserveFormatting?: boolean;

  /** Custom form field options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

export interface QueryOptions {
  /** Case-sensitive search */
  caseSensitive?: boolean;

  /** Whole word matching */
  wholeWord?: boolean;

  /** Regular expression search */
  regex?: boolean;

  /** Maximum number of results */
  maxResults?: number;

  /** Custom query options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transformation Options
// ---------------------------------------------------------------------------

export interface TransformOptions {
  /** Whether to preserve metadata */
  preserveMetadata?: boolean;

  /** Whether to preserve bookmarks */
  preserveBookmarks?: boolean;

  /** Compression level (0-9) */
  compressionLevel?: number;

  /** Custom transformation options */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation Options
// ---------------------------------------------------------------------------

export interface ValidationOptions {
  /** Strict validation mode */
  strict?: boolean;

  /** Whether to fix issues automatically */
  autoFix?: boolean;

  /** Maximum validation time in milliseconds */
  timeout?: number;

  /** Custom validation options */
  options?: Record<string, unknown>;
}