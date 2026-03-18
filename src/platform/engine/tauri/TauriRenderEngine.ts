// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from '@tauri-apps/api/core';
import type { PdfDocument, Page } from '../../../core/document';
import type { RenderOptions, EngineResult, AsyncEngineResult } from '../../../core/engine/types';
import type { RenderEngine } from '../../../core/engine/RenderEngine';

// ---- Backend response types (snake_case from serde) ----

interface TauriRenderedPage {
  index: number;
  width: number;
  height: number;
  data_base64: string;
}

// ---- Helpers ----

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Tauri-backed render engine.
 *
 * Async methods call the Tauri backend via invoke().
 * Sync methods operate on the in-memory PdfDocument model.
 */
export class TauriRenderEngine implements RenderEngine {
  // ---- Async: backed by Tauri backend ----

  async renderPage(
    document: PdfDocument,
    pageIndex: number,
    width: number,
    _height: number,
    _options?: RenderOptions
  ): AsyncEngineResult<Uint8Array> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    const scale = page.size.width > 0 ? width / page.size.width : 1;
    try {
      const rendered = await invoke<TauriRenderedPage>('render_page', { pageIndex, scale });
      return { success: true, value: base64ToUint8Array(rendered.data_base64) };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
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

  async getThumbnail(
    _document: PdfDocument,
    pageIndex: number,
    _maxWidth: number,
    _maxHeight: number
  ): AsyncEngineResult<Uint8Array> {
    // Do not guard against document.pages[pageIndex] here: after append/insert mutations
    // the in-memory doc model is stale but the backend has the up-to-date page list.
    // The backend validates the page index and returns an error if out of range.
    if (pageIndex < 0) {
      return { success: false, error: { code: 'page-not-found', message: `Invalid page index: ${pageIndex}` } };
    }
    try {
      const rendered = await invoke<TauriRenderedPage>('render_thumbnail', { pageIndex });
      return { success: true, value: base64ToUint8Array(rendered.data_base64) };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
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

  async benchmarkRender(
    _document: PdfDocument,
    _pageIndex: number,
    _iterations: number
  ): AsyncEngineResult<{ averageTime: number; minTime: number; maxTime: number; memoryUsage: number }> {
    return notImpl('benchmarkRender requires Tauri backend');
  }

  // ---- Sync: backed by in-memory model ----

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

  getPageMetadata(document: PdfDocument, pageIndex: number): EngineResult<Page> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    return { success: true, value: page };
  }

  updatePageMetadata(
    document: PdfDocument,
    pageIndex: number,
    metadata: Partial<Page>
  ): EngineResult<PdfDocument> {
    const page = document.pages[pageIndex];
    if (!page) {
      return { success: false, error: { code: 'page-not-found', message: `Page ${pageIndex} not found` } };
    }
    const updatedPage = { ...page, ...metadata, index: pageIndex };
    const pages = document.pages.map((p, i) => i === pageIndex ? updatedPage : p);
    return { success: true, value: { ...document, pages } };
  }

  getSupportedFormats(): string[] {
    return ['png', 'jpeg'];
  }

  getMaxRenderDpi(): number {
    return 300;
  }

  getRecommendedRenderDpi(): number {
    return 150;
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

  getPerformanceHints(): string[] {
    return [
      'Use lower DPI for faster rendering',
      'Render thumbnails at smaller sizes first',
    ];
  }
}
