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

export class MockTransformEngine {
  // Async mutations

  mergeDocuments(): AsyncEngineResult<PdfDocument> {
    return notImpl('mergeDocuments not implemented in MockTransformEngine');
  }

  appendDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('appendDocument not implemented in MockTransformEngine');
  }

  insertDocumentPages(): AsyncEngineResult<PdfDocument> {
    return notImpl('insertDocumentPages not implemented in MockTransformEngine');
  }

  splitDocumentByRanges(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByRanges not implemented in MockTransformEngine');
  }

  splitDocumentByPageCount(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByPageCount not implemented in MockTransformEngine');
  }

  splitDocumentByBookmarks(): AsyncEngineResult<PdfDocument[]> {
    return notImpl('splitDocumentByBookmarks not implemented in MockTransformEngine');
  }

  extractPages(): AsyncEngineResult<PdfDocument> {
    return notImpl('extractPages not implemented in MockTransformEngine');
  }

  deletePages(): AsyncEngineResult<PdfDocument> {
    return notImpl('deletePages not implemented in MockTransformEngine');
  }

  reorderPages(): AsyncEngineResult<PdfDocument> {
    return notImpl('reorderPages not implemented in MockTransformEngine');
  }

  rotatePages(): AsyncEngineResult<PdfDocument> {
    return notImpl('rotatePages not implemented in MockTransformEngine');
  }

  duplicatePages(): AsyncEngineResult<PdfDocument> {
    return notImpl('duplicatePages not implemented in MockTransformEngine');
  }

  compressDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('compressDocument not implemented in MockTransformEngine');
  }

  optimizeForWeb(): AsyncEngineResult<PdfDocument> {
    return notImpl('optimizeForWeb not implemented in MockTransformEngine');
  }

  encryptDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('encryptDocument not implemented in MockTransformEngine');
  }

  decryptDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('decryptDocument not implemented in MockTransformEngine');
  }

  changePassword(): AsyncEngineResult<PdfDocument> {
    return notImpl('changePassword not implemented in MockTransformEngine');
  }

  removeEncryption(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeEncryption not implemented in MockTransformEngine');
  }

  addTextWatermark(): AsyncEngineResult<PdfDocument> {
    return notImpl('addTextWatermark not implemented in MockTransformEngine');
  }

  addImageWatermark(): AsyncEngineResult<PdfDocument> {
    return notImpl('addImageWatermark not implemented in MockTransformEngine');
  }

  removeWatermarks(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeWatermarks not implemented in MockTransformEngine');
  }

  repairDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('repairDocument not implemented in MockTransformEngine');
  }

  rebuildDocument(): AsyncEngineResult<PdfDocument> {
    return notImpl('rebuildDocument not implemented in MockTransformEngine');
  }

  removeUnusedObjects(): AsyncEngineResult<PdfDocument> {
    return notImpl('removeUnusedObjects not implemented in MockTransformEngine');
  }

  fixXrefTable(): AsyncEngineResult<PdfDocument> {
    return notImpl('fixXrefTable not implemented in MockTransformEngine');
  }

  convertToPdfA(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfA not implemented in MockTransformEngine');
  }

  convertToPdfUa(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfUa not implemented in MockTransformEngine');
  }

  convertToPdfX(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertToPdfX not implemented in MockTransformEngine');
  }

  convertImageToPdf(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertImageToPdf not implemented in MockTransformEngine');
  }

  benchmarkTransformations(): AsyncEngineResult<Array<{
    operationType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>> {
    return notImpl('benchmarkTransformations not implemented in MockTransformEngine');
  }

  // Sync reads

  getCompressionStats(): EngineResult<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    estimatedSavings: number;
  }> {
    return {
      success: true,
      value: {
        originalSize: 1024 * 1024,
        compressedSize: 512 * 1024,
        compressionRatio: 0.5,
        estimatedSavings: 512 * 1024
      }
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
        supportedOperations: [],
        maxDocumentSize: 10 * 1024 * 1024,
        maxPageCount: 100,
        supportsEncryption: false,
        supportsCompression: false,
        supportsWatermarking: false,
        supportsPdfA: false
      }
    };
  }
}
