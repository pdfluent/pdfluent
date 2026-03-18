// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { RuntimeAdapter, RuntimeAdapterMetadata, RuntimeCapabilities } from '../types';
import type { PdfEngine } from '../../../core/engine/PdfEngine';
import type { EngineConfig } from '../../../core/engine/types';
import { MockPdfEngine } from '../../../core/engine/mock/MockPdfEngine';

/**
 * Browser test runtime adapter for development and testing
 */
export class BrowserTestRuntimeAdapter implements RuntimeAdapter {
  readonly runtime = 'browser-test' as const;
  readonly priority = 50; // Medium priority for development

  isAvailable(): boolean {
    // Browser test adapter is available in browser environment
    // Also available in test environment (Node.js) for testing
    return typeof window !== 'undefined' || (typeof (globalThis as Record<string, unknown>)['process'] !== 'undefined');
  }

  async createEngine(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    // Create mock engine for development/testing
    return MockPdfEngine.create(config);
  }

  getMetadata(): RuntimeAdapterMetadata {
    return {
      name: 'Browser Test Runtime Adapter',
      version: '0.1.0',
      description: 'Development and testing runtime with mock PDF engine',
      runtime: 'browser-test'
    };
  }

  getCapabilities(): RuntimeCapabilities {
    return {
      supportedOperations: [
        'open',
        'save',
        'render',
        'annotate',
        'form-fill',
        'extract-text'
      ],
      maxFileSize: 10 * 1024 * 1024, // 10MB for testing
      maxPageCount: 100,
      supportsStreaming: false,
      supportsParallel: false,
      performance: {
        documentLoading: 5, // Medium speed for mock
        pageRendering: 4,   // Slower rendering (mock canvas)
        textExtraction: 6,  // Fast text extraction (mock)
        memoryEfficiency: 8 // Good memory efficiency (mock)
      }
    };
  }
}

/**
 * Create browser test runtime adapter instance
 */
export function createBrowserTestRuntimeAdapter(): BrowserTestRuntimeAdapter {
  return new BrowserTestRuntimeAdapter();
}