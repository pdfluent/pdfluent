// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Transform Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument } from '../document';
import type { TransformOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Transform Engine - Handles document manipulation operations
 */
export interface TransformEngine {
  // -------------------------------------------------------------------------
  // Document Combination
  // -------------------------------------------------------------------------

  /**
   * Merge multiple documents into one
   */
  mergeDocuments(
    documents: PdfDocument[],
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Append document to another document
   */
  appendDocument(
    target: PdfDocument,
    source: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Insert document pages at specific position
   */
  insertDocumentPages(
    target: PdfDocument,
    source: PdfDocument,
    targetPosition: number,
    sourcePages?: number[],
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Splitting
  // -------------------------------------------------------------------------

  /**
   * Split document by page ranges
   */
  splitDocumentByRanges(
    document: PdfDocument,
    ranges: Array<{
      name?: string;
      pages: number[] | { start: number; end: number };
    }>,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument[]>;

  /**
   * Split document by page count
   */
  splitDocumentByPageCount(
    document: PdfDocument,
    pagesPerDocument: number,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument[]>;

  /**
   * Split document by bookmarks
   */
  splitDocumentByBookmarks(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument[]>;

  /**
   * Extract specific pages from document
   */
  extractPages(
    document: PdfDocument,
    pageIndices: number[],
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Page Manipulation
  // -------------------------------------------------------------------------

  /**
   * Delete pages from document
   */
  deletePages(
    document: PdfDocument,
    pageIndices: number[],
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Reorder pages in document
   */
  reorderPages(
    document: PdfDocument,
    newOrder: number[],
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Rotate pages
   */
  rotatePages(
    document: PdfDocument,
    pageIndices: number[],
    angle: 90 | 180 | 270,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Duplicate pages
   */
  duplicatePages(
    document: PdfDocument,
    pageIndices: number[],
    count?: number,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Compression
  // -------------------------------------------------------------------------

  /**
   * Compress document
   */
  compressDocument(
    document: PdfDocument,
    level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Get compression statistics
   */
  getCompressionStats(
    document: PdfDocument
  ): EngineResult<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    estimatedSavings: number;
  }>;

  /**
   * Optimize document for web
   */
  optimizeForWeb(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Encryption
  // -------------------------------------------------------------------------

  /**
   * Encrypt document
   */
  encryptDocument(
    document: PdfDocument,
    password: string,
    options?: {
      userPassword?: string;
      ownerPassword?: string;
      permissions?: {
        canPrint?: boolean;
        canModify?: boolean;
        canCopy?: boolean;
        canAnnotate?: boolean;
        canFillForms?: boolean;
        canExtractContent?: boolean;
        canAssemble?: boolean;
      };
      encryptionMethod?: 'rc4-40' | 'rc4-128' | 'aes-128' | 'aes-256';
    }
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Decrypt document
   */
  decryptDocument(
    document: PdfDocument,
    password: string
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Change document password
   */
  changePassword(
    document: PdfDocument,
    oldPassword: string,
    newPassword: string
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Remove document encryption
   */
  removeEncryption(
    document: PdfDocument,
    password: string
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Watermarking
  // -------------------------------------------------------------------------

  /**
   * Add text watermark
   */
  addTextWatermark(
    document: PdfDocument,
    text: string,
    options?: {
      position?: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';
      fontSize?: number;
      color?: string;
      opacity?: number;
      rotation?: number;
      pages?: number[];
    }
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Add image watermark
   */
  addImageWatermark(
    document: PdfDocument,
    imageData: Uint8Array,
    options?: {
      position?: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';
      scale?: number;
      opacity?: number;
      rotation?: number;
      pages?: number[];
    }
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Remove watermarks
   */
  removeWatermarks(
    document: PdfDocument,
    options?: {
      pages?: number[];
      type?: 'text' | 'image' | 'all';
    }
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Repair
  // -------------------------------------------------------------------------

  /**
   * Repair corrupt document
   */
  repairDocument(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Rebuild document structure
   */
  rebuildDocument(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Remove unused objects
   */
  removeUnusedObjects(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Fix cross-reference table
   */
  fixXrefTable(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Conversion
  // -------------------------------------------------------------------------

  /**
   * Convert to PDF/A
   */
  convertToPdfA(
    document: PdfDocument,
    level: '1a' | '1b' | '2a' | '2b' | '2u' | '3a' | '3b' | '3u',
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Convert to PDF/UA
   */
  convertToPdfUa(
    document: PdfDocument,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Convert to PDF/X
   */
  convertToPdfX(
    document: PdfDocument,
    version: '1a' | '3' | '4' | '5',
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  /**
   * Convert from image to PDF
   */
  convertImageToPdf(
    images: Array<{
      data: Uint8Array;
      format: string;
      dpi?: number;
    }>,
    options?: TransformOptions
  ): AsyncEngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Performance
  // -------------------------------------------------------------------------

  /**
   * Get transformation capabilities
   */
  getCapabilities(): EngineResult<{
    supportedOperations: string[];
    maxDocumentSize: number;
    maxPageCount: number;
    supportsEncryption: boolean;
    supportsCompression: boolean;
    supportsWatermarking: boolean;
    supportsPdfA: boolean;
  }>;

  /**
   * Benchmark transformation operations
   */
  benchmarkTransformations(
    document: PdfDocument,
    operations: Array<{
      type: string;
      parameters: Record<string, unknown>;
    }>,
    iterations?: number
  ): AsyncEngineResult<Array<{
    operationType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>>;
}
