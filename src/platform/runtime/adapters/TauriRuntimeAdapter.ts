// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../../lib/tauri-detection';
import type {
  RuntimeAdapter,
  RuntimeAdapterMetadata,
  RuntimeCapabilities,
  RuntimeOperationCapability,
} from '../types';
import type { PdfEngine } from '../../../core/engine/PdfEngine';
import type { EngineConfig } from '../../../core/engine/types';

const TAURI_OPERATION_DETAILS: Record<string, RuntimeOperationCapability> = {
  open: { status: 'supported' },
  save: { status: 'supported' },
  'filesystem-save': { status: 'supported' },
  'pdf-export': { status: 'supported' },
  render: { status: 'supported' },
  thumbnails: { status: 'supported' },
  'render-thumbnail': { status: 'supported' },
  annotate: { status: 'supported' },
  'form-fill': { status: 'supported' },
  merge: { status: 'supported' },
  split: { status: 'supported' },
  rotate: { status: 'supported' },
  compress: { status: 'supported' },
  'validate-pdfa': { status: 'supported' },
  text: { status: 'supported' },
  'extract-text': { status: 'supported' },
  'text-positions': { status: 'supported' },
  'extract-text-positions': { status: 'supported' },
  search: { status: 'supported' },
  'search-text': { status: 'supported' },
  'extract-images': { status: 'supported' },
  redact: { status: 'supported' },
  'verify-signatures': { status: 'supported' },
  'convert-pdfa': { status: 'supported' },
  ocr: { status: 'supported' },
  'office-export': { status: 'supported' },
  'flatten-xfa': { status: 'supported' },
};

const TAURI_SUPPORTED_OPERATIONS = Object.entries(TAURI_OPERATION_DETAILS)
  .filter(([, capability]) => capability.status === 'supported')
  .map(([operation]) => operation);

/**
 * Tauri runtime adapter for production desktop environment
 */
export class TauriRuntimeAdapter implements RuntimeAdapter {
  readonly runtime = 'tauri' as const;
  readonly priority = 100; // Highest priority for production

  isAvailable(): boolean {
    // Check for Tauri APIs
    if (typeof window === 'undefined') {
      return false;
    }

    const tauri = isTauriRuntime();
    return !!tauri;
  }

  async createEngine(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    // Create Tauri-backed PDF engine
    const { TauriPdfEngine } = await import('../../../platform/engine/tauri/TauriPdfEngine');
    return TauriPdfEngine.create(config);
  }

  getMetadata(): RuntimeAdapterMetadata {
    return {
      name: 'Tauri Runtime Adapter',
      version: '0.1.0',
      description: 'Production desktop runtime with XFA Rust SDK backend',
      runtime: 'tauri'
    };
  }

  getCapabilities(): RuntimeCapabilities {
    return {
      supportedOperations: [...TAURI_SUPPORTED_OPERATIONS],
      operationDetails: { ...TAURI_OPERATION_DETAILS },
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      maxPageCount: 10000,
      supportsStreaming: true,
      supportsParallel: true,
      performance: {
        documentLoading: 9,
        pageRendering: 8,
        textExtraction: 9,
        memoryEfficiency: 7
      }
    };
  }
}

/**
 * Create Tauri runtime adapter instance
 */
export function createTauriRuntimeAdapter(): TauriRuntimeAdapter {
  return new TauriRuntimeAdapter();
}
