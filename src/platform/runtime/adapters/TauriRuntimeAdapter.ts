// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { RuntimeAdapter, RuntimeAdapterMetadata, RuntimeCapabilities } from '../types';
import type { PdfEngine } from '../../../core/engine/PdfEngine';
import type { EngineConfig } from '../../../core/engine/types';

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

    const tauri = (window as any).__TAURI__;
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
    // Placeholder capabilities - will be populated from actual XFA SDK
    return {
      supportedOperations: [
        'open',
        'save',
        'render',
        'annotate',
        'form-fill',
        'merge',
        'split',
        'rotate',
        'compress',
        'validate-pdfa',
        'extract-text',
        'extract-images'
      ],
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