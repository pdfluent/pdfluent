// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, Page } from '../../../core/document';
import type { EngineResult, AsyncEngineResult } from '../../../core/engine/types';
import type { TransformEngine } from '../../../core/engine/TransformEngine';

// Backend response types (snake_case from serde)
type TauriReorderPageInfo = { index: number; width_pt: number; height_pt: number };
type TauriReorderDocInfo = { page_count: number; pages: TauriReorderPageInfo[] };

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

/**
 * Tauri-backed transform engine.
 *
 * Operations requiring Tauri backend I/O (merge, split, compress, encrypt,
 * watermark, convert) are async placeholders pending backend wiring.
 *
 * Pure in-memory page manipulation (delete, reorder, rotate, duplicate) is
 * implemented against the document model and exposed as async to match the
 * uniform async interface contract.
 *
 * getCompressionStats and getCapabilities remain synchronous.
 */
export class TauriTransformEngine implements TransformEngine {
  // Async — require Tauri backend (placeholders)

  async mergeDocuments(): AsyncEngineResult<PdfDocument> {
    return notImpl('mergeDocuments requires Tauri backend');
  }

  async appendDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('appendDocument requires Tauri backend');
  }

  async insertDocumentPages(): AsyncEngineResult<PdfDocument> {
    return notImpl('insertDocumentPages requires Tauri backend');
  }

  async splitDocumentByRanges(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByRanges requires Tauri backend');
  }

  async splitDocumentByPageCount(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByPageCount requires Tauri backend');
  }

  async splitDocumentByBookmarks(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByBookmarks requires Tauri backend');
  }

  async extractPages(): AsyncEngineResult<PdfDocument> {
    return notImpl('extractPages requires Tauri backend');
  }

  async compressDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('compressDocument requires Tauri backend');
  }

  async optimizeForWeb(): AsyncEngineResult<PdfDocument> {
    return notImpl('optimizeForWeb requires Tauri backend');
  }

  async encryptDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('encryptDocument requires Tauri backend');
  }

  async decryptDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('decryptDocument requires Tauri backend');
  }

  async changePassword(): AsyncEngineResult<PdfDocument> {
    return notImpl('changePassword requires Tauri backend');
  }

  async removeEncryption(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeEncryption requires Tauri backend');
  }

  async addTextWatermark(): AsyncEngineResult<PdfDocument> {
    return notImpl('addTextWatermark requires Tauri backend');
  }

  async addImageWatermark(): AsyncEngineResult<PdfDocument> {
    return notImpl('addImageWatermark requires Tauri backend');
  }

  async removeWatermarks(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeWatermarks requires Tauri backend');
  }

  async repairDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('repairDocument requires Tauri backend');
  }

  async rebuildDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('rebuildDocument requires Tauri backend');
  }

  async removeUnusedObjects(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeUnusedObjects requires Tauri backend');
  }

  async fixXrefTable(): AsyncEngineResult<PdfDocument> {
    return notImpl('fixXrefTable requires Tauri backend');
  }

  async convertToPdfA(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfA requires Tauri backend');
  }

  async convertToPdfUa(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfUa requires Tauri backend');
  }

  async convertToPdfX(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfX requires Tauri backend');
  }

  async convertImageToPdf(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertImageToPdf requires Tauri backend');
  }

  async benchmarkTransformations(): AsyncEngineResult<Array<{
    operationType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>> {
    return notImpl('benchmarkTransformations requires Tauri backend');
  }

  // Async — in-memory page manipulation (uniform async interface)

  async deletePages(document: PdfDocument, pageIndices: number[]): AsyncEngineResult<PdfDocument> {
    const pageIndexSet = new Set(pageIndices);
    let newIndex = 0;
    const pages = document.pages
      .filter((_, i) => !pageIndexSet.has(i))
      .map(page => ({ ...page, index: newIndex++ }));
    return { success: true, value: { ...document, pages } };
  }

  async reorderPages(document: PdfDocument, newOrder: number[]): AsyncEngineResult<PdfDocument> {
    if (newOrder.some(i => i < 0 || i >= document.pages.length)) {
      return { success: false, error: { code: 'page-not-found', message: 'Invalid page index in new order' } };
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const info = await invoke<TauriReorderDocInfo>('reorder_pages', { newOrder });
      const pages: Page[] = info.pages.map(p => ({
        index: p.index,
        size: { width: p.width_pt, height: p.height_pt },
        rotation: 0 as const,
        contentHash: '',
        isRendered: false,
        metadata: {
          label: String(p.index + 1),
          inRange: true,
          hasAnnotations: false,
          hasForms: false,
        },
      }));
      return { success: true, value: { ...document, pages } };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async rotatePages(
    document: PdfDocument,
    pageIndices: number[],
    angle: 90 | 180 | 270
  ): AsyncEngineResult<PdfDocument> {
    const pageIndexSet = new Set(pageIndices);
    const pages = document.pages.map((page, i) => {
      if (!pageIndexSet.has(i)) return page;
      const newRotation = ((page.rotation + angle) % 360) as 0 | 90 | 180 | 270;
      return { ...page, rotation: newRotation };
    });
    return { success: true, value: { ...document, pages } };
  }

  async duplicatePages(
    document: PdfDocument,
    pageIndices: number[],
    count = 1
  ): AsyncEngineResult<PdfDocument> {
    const extras: typeof document.pages[number][] = [];
    for (let c = 0; c < count; c++) {
      for (const pi of pageIndices) {
        const p = document.pages[pi];
        if (p) extras.push(p);
      }
    }
    const allPages = [...document.pages, ...extras].map((page, i) => ({ ...page, index: i }));
    return { success: true, value: { ...document, pages: allPages } };
  }

  // Sync — in-memory reads

  getCompressionStats(document: PdfDocument): EngineResult<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    estimatedSavings: number;
  }> {
    return {
      success: true,
      value: {
        originalSize: document.fileSize,
        compressedSize: document.fileSize,
        compressionRatio: 1.0,
        estimatedSavings: 0,
      },
    };
  }

  getCapabilities(): EngineResult<{
    supportedOperations: string[];
    maxDocumentSize: number;
    maxPageCount: number;
    supportsEncryption: boolean;
    supportsCompression: boolean;
    supportsWatermarking: boolean;
    supportsPdfA: boolean;
  }> {
    return {
      success: true,
      value: {
        supportedOperations: ['delete-pages', 'reorder-pages', 'rotate-pages', 'duplicate-pages'],
        maxDocumentSize: 1024 * 1024 * 1024,
        maxPageCount: 10000,
        supportsEncryption: false,
        supportsCompression: false,
        supportsWatermarking: false,
        supportsPdfA: false,
      },
    };
  }
}
