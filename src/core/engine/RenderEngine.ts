// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Render Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument, Page } from '../document';
import type { RenderOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Render Engine - Handles page rendering and thumbnail generation
 */
export interface RenderEngine {
  // -------------------------------------------------------------------------
  // Page Rendering
  // -------------------------------------------------------------------------

  /**
   * Render a single page to an image
   */
  renderPage(
    document: PdfDocument,
    pageIndex: number,
    width: number,
    height: number,
    options?: RenderOptions
  ): AsyncEngineResult<Uint8Array>; // Returns image bytes (PNG/JPEG)

  /**
   * Render multiple pages to images
   */
  renderPages(
    document: PdfDocument,
    pageIndices: number[],
    width: number,
    height: number,
    options?: RenderOptions
  ): AsyncEngineResult<Uint8Array[]>; // Returns array of image bytes

  /**
   * Get page dimensions (width, height in points)
   */
  getPageDimensions(document: PdfDocument, pageIndex: number): EngineResult<{ width: number; height: number }>;

  /**
   * Get page rotation (0, 90, 180, 270 degrees)
   */
  getPageRotation(document: PdfDocument, pageIndex: number): EngineResult<number>;

  // -------------------------------------------------------------------------
  // Thumbnail Generation
  // -------------------------------------------------------------------------

  /**
   * Generate thumbnail for a page
   */
  getThumbnail(
    document: PdfDocument,
    pageIndex: number,
    maxWidth: number,
    maxHeight: number
  ): AsyncEngineResult<Uint8Array>;

  /**
   * Generate thumbnails for multiple pages
   */
  getThumbnails(
    document: PdfDocument,
    pageIndices: number[],
    maxWidth: number,
    maxHeight: number
  ): AsyncEngineResult<Uint8Array[]>;

  /**
   * Generate thumbnails for all pages
   */
  getAllThumbnails(
    document: PdfDocument,
    maxWidth: number,
    maxHeight: number
  ): AsyncEngineResult<Uint8Array[]>;

  // -------------------------------------------------------------------------
  // Page Information
  // -------------------------------------------------------------------------

  /**
   * Get page metadata
   */
  getPageMetadata(document: PdfDocument, pageIndex: number): EngineResult<Page>;

  /**
   * Update page metadata
   */
  updatePageMetadata(
    document: PdfDocument,
    pageIndex: number,
    metadata: Partial<Page>
  ): EngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Rendering Configuration
  // -------------------------------------------------------------------------

  /**
   * Get supported rendering formats
   */
  getSupportedFormats(): string[];

  /**
   * Get maximum render DPI
   */
  getMaxRenderDpi(): number;

  /**
   * Get recommended render DPI for quality/speed balance
   */
  getRecommendedRenderDpi(): number;

  /**
   * Check if rendering is hardware accelerated
   */
  isHardwareAccelerated(): boolean;

  // -------------------------------------------------------------------------
  // Cache Management
  // -------------------------------------------------------------------------

  /**
   * Clear render cache for a document
   */
  clearRenderCache(document: PdfDocument): EngineResult<void>;

  /**
   * Clear all render caches
   */
  clearAllRenderCaches(): EngineResult<void>;

  /**
   * Get cache statistics
   */
  getCacheStats(): EngineResult<{
    hits: number;
    misses: number;
    size: number;
    entries: number;
  }>;

  // -------------------------------------------------------------------------
  // Performance
  // -------------------------------------------------------------------------

  /**
   * Measure rendering performance
   */
  benchmarkRender(
    document: PdfDocument,
    pageIndex: number,
    iterations: number
  ): AsyncEngineResult<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    memoryUsage: number;
  }>;

  /**
   * Get rendering performance hints
   */
  getPerformanceHints(): string[];
}