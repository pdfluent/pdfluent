// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, Page } from '../../document';
import type { RenderOptions, EngineResult, AsyncEngineResult } from '../types';

// Minimal PNG (1x1 transparent pixel) for testing
const MOCK_PNG = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
]);

export class MockRenderEngine {
  async renderPage(
    document: PdfDocument,
    pageIndex: number,
    _width: number,
    _height: number,
    _options?: RenderOptions
  ): AsyncEngineResult<Uint8Array> {
    if (!document.pages[pageIndex]) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    return { success: true, value: MOCK_PNG };
  }

  async renderPages(
    document: PdfDocument,
    pageIndices: number[],
    width: number,
    height: number,
    options?: RenderOptions
  ): AsyncEngineResult<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (const idx of pageIndices) {
      const result = await this.renderPage(document, idx, width, height, options);
      if (!result.success) return result;
      results.push(result.value);
    }
    return { success: true, value: results };
  }

  getPageDimensions(document: PdfDocument, pageIndex: number): EngineResult<{ width: number; height: number }> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    return { success: true, value: { width: page.size.width, height: page.size.height } };
  }

  getPageRotation(document: PdfDocument, pageIndex: number): EngineResult<number> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    return { success: true, value: page.rotation };
  }

  async getThumbnail(
    document: PdfDocument,
    pageIndex: number,
    width: number,
    height: number,
    options?: RenderOptions
  ): AsyncEngineResult<Uint8Array> {
    return this.renderPage(document, pageIndex, width, height, options);
  }

  async getThumbnails(
    document: PdfDocument,
    pageIndices: number[],
    maxWidth: number,
    maxHeight: number
  ): AsyncEngineResult<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (const idx of pageIndices) {
      const result = await this.getThumbnail(document, idx, maxWidth, maxHeight);
      if (!result.success) return result;
      results.push(result.value);
    }
    return { success: true, value: results };
  }

  async getAllThumbnails(
    document: PdfDocument,
    maxWidth: number,
    maxHeight: number
  ): AsyncEngineResult<Uint8Array[]> {
    return this.getThumbnails(document, document.pages.map((_, i) => i), maxWidth, maxHeight);
  }

  getPageMetadata(document: PdfDocument, pageIndex: number): EngineResult<Page> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    return { success: true, value: page };
  }

  updatePageMetadata(): EngineResult<PdfDocument> {
    return { success: false, error: { code: 'not-implemented', message: 'updatePageMetadata not implemented in MockRenderEngine' } };
  }

  getSupportedFormats(): string[] {
    return ['png'];
  }

  getMaxRenderDpi(): number {
    return 150;
  }

  getRecommendedRenderDpi(): number {
    return 72;
  }

  isHardwareAccelerated(): boolean {
    return false;
  }

  clearRenderCache(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  clearAllRenderCaches(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  getCacheStats(): EngineResult<{ hits: number; misses: number; size: number; entries: number }> {
    return { success: true, value: { hits: 0, misses: 0, size: 0, entries: 0 } };
  }

  async benchmarkRender(): AsyncEngineResult<{ averageTime: number; minTime: number; maxTime: number; memoryUsage: number }> {
    return { success: false, error: { code: 'not-implemented', message: 'benchmarkRender not implemented in MockRenderEngine' } };
  }

  getPerformanceHints(): string[] {
    return ['Mock engine — no performance hints available'];
  }
}
