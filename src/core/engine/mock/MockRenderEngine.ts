// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, Page } from '../../document';
import type { RenderOptions, EngineResult, AsyncEngineResult } from '../types';

// Valid 1×1 grey PNG (67 bytes) — fallback when OffscreenCanvas is unavailable.
const FALLBACK_PNG = new Uint8Array([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG signature
  0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1×1
  0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53, // 8-bit RGB
  0xDE,0x00,0x00,0x00,0x0C,0x49,0x44,0x41, // IDAT chunk
  0x54,0x08,0xD7,0x63,0xD8,0xD0,0xD0,0x00, // compressed grey pixel
  0x00,0x00,0x11,0x00,0x05,0xE4,0xA8,0x3E, // CRC
  0x28,0x00,0x00,0x00,0x00,0x49,0x45,0x4E, // IEND chunk
  0x44,0xAE,0x42,0x60,0x82,
]);

/**
 * Generates a valid synthetic PNG for a mock page using OffscreenCanvas.
 * White background with centred "Page {N}" label at A4 aspect ratio.
 * Falls back to FALLBACK_PNG if OffscreenCanvas is unavailable (e.g. Node).
 */
async function generateMockPagePng(
  pageNumber: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === 'undefined') return FALLBACK_PNG;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return FALLBACK_PNG;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Light border to indicate page bounds
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  // Centred page label
  const fontSize = Math.max(12, Math.round(height / 20));
  ctx.fillStyle = '#888888';
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Page ${pageNumber}`, width / 2, height / 2);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

export class MockRenderEngine {
  async renderPage(
    document: PdfDocument,
    pageIndex: number,
    width: number,
    height: number,
    _options?: RenderOptions
  ): AsyncEngineResult<Uint8Array> {
    if (!document.pages[pageIndex]) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    // Ensure minimum size for valid rendering
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const png = await generateMockPagePng(pageIndex + 1, w, h);
    return { success: true, value: png };
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
