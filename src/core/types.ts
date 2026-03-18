// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Runtime Types
// ---------------------------------------------------------------------------

/** Supported runtime environments */
export type Runtime = 'tauri' | 'browser-test';

/** Supported PDF engines */
export type Engine = 'xfa-sdk' | 'browser-mock';

/** Operation types that can be checked for support */
export type OperationType =
  | 'open'
  | 'save'
  | 'render'
  | 'annotate'
  | 'form-fill'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'compress'
  | 'ocr'
  | 'redact'
  | 'sign'
  | 'validate-pdfa'
  | 'extract-text'
  | 'extract-images';

/** Limit types that can be queried */
export type LimitType =
  | 'file-size'
  | 'page-count'
  | 'concurrent-operations'
  | 'memory-usage'
  | 'render-resolution';

/** Information about a specific limit */
export interface LimitInfo {
  /** Maximum allowed value */
  max: number;
  /** Recommended value for good performance */
  recommended: number;
  /** Unit of measurement (e.g., 'bytes', 'pages', 'megapixels') */
  unit: string;
}

// ---------------------------------------------------------------------------
// Geometry Types
// ---------------------------------------------------------------------------

/** 2D point with x, y coordinates */
export interface Point {
  x: number;
  y: number;
}

/** 2D size with width and height */
export interface Size {
  width: number;
  height: number;
}

/** 2D rectangle with position and size */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page rotation in degrees (0, 90, 180, 270) */
export type Rotation = 0 | 90 | 180 | 270;

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/** Standardized error codes for PDF operations */
export type ErrorCode =
  | 'unsupported-operation'
  | 'limit-exceeded'
  | 'invalid-document'
  | 'io-error'
  | 'permission-denied'
  | 'corrupt-pdf'
  | 'encrypted'
  | 'missing-font'
  | 'render-failed'
  | 'engine-error';

/** Structured error information */
export interface PdfError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  /** Whether this operation can be retried */
  retryable: boolean;
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

/** Result type for operations that can fail */
export type Result<T, E = PdfError> =
  | { success: true; value: T }
  | { success: false; error: E };

/** Async result type */
export type AsyncResult<T, E = PdfError> = Promise<Result<T, E>>;

/** Type guard for successful results */
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success === true;
}

/** Type guard for failed results */
export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/** Platform detection utility */
export function detectRuntime(): Runtime {
  // In Tauri environment, we can check for Tauri APIs
  // For now, we'll use a simple check - this will be enhanced in actual implementation
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    return 'tauri';
  }
  return 'browser-test';
}