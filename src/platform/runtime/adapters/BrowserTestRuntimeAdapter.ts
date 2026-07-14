// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type {
  RuntimeAdapter,
  RuntimeAdapterMetadata,
  RuntimeCapabilities,
  RuntimeOperationCapability,
} from '../types';
import type { PdfEngine } from '../../../core/engine/PdfEngine';
import type { EngineConfig } from '../../../core/engine/types';
import { MockPdfEngine } from '../../../core/engine/mock/MockPdfEngine';

const BROWSER_TEST_OPERATION_DETAILS: Record<string, RuntimeOperationCapability> = {
  open: { status: 'degraded', reason: 'Mock-only test runtime.' },
  save: { status: 'degraded', reason: 'Mock-only test runtime; no real filesystem save.' },
  'filesystem-save': { status: 'unsupported', reason: 'Browser test runtime has no filesystem save.' },
  'pdf-export': { status: 'degraded', reason: 'Mock-only PDF byte export.' },
  'browser-download': { status: 'degraded', reason: 'Browser download plumbing is available; PDF bytes are mock-only.' },
  render: { status: 'degraded', reason: 'Mock-only rendering.' },
  annotate: { status: 'degraded', reason: 'Mock-only annotation behavior.' },
  'form-fill': { status: 'unsupported', reason: 'Form editing is not implemented in the mock runtime.' },
  text: { status: 'degraded', reason: 'Mock-only text extraction.' },
  'extract-text': { status: 'degraded', reason: 'Mock-only text extraction.' },
  ocr: { status: 'unsupported', reason: 'OCR is not implemented in the mock runtime.' },
  redact: { status: 'unsupported', reason: 'Redaction is not implemented in the mock runtime.' },
  'office-export': { status: 'unsupported', reason: 'Office export is not implemented in the mock runtime.' },
};

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
        'pdf-export',
        'browser-download',
        'render',
        'annotate',
        'extract-text'
      ],
      operationDetails: { ...BROWSER_TEST_OPERATION_DETAILS },
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
