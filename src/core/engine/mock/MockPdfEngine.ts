// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument } from '../../document';
import { createEmptyDocument } from '../../document';
import type { PdfEngine } from '../PdfEngine';
import type { EngineConfig, EngineResult } from '../types';
import { MockDocumentEngine } from './MockDocumentEngine';
import { MockRenderEngine } from './MockRenderEngine';
import { MockAnnotationEngine } from './MockAnnotationEngine';
import { MockFormEngine } from './MockFormEngine';
import { MockQueryEngine } from './MockQueryEngine';
import { MockTransformEngine } from './MockTransformEngine';
import { MockValidationEngine } from './MockValidationEngine';

export class MockPdfEngine implements PdfEngine {
  readonly name = 'Mock PDF Engine';
  readonly version = '0.1.0';
  readonly vendor = 'PDFluent';

  /**
   * Create a new MockPdfEngine instance
   */
  static create(config?: Partial<EngineConfig>): MockPdfEngine {
    const engine = new MockPdfEngine();
    if (config) {
      engine.initialize(config);
    }
    return engine;
  }
  readonly supportedPdfVersions = ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '2.0'];
  readonly isInitialized = true;

  readonly document = new MockDocumentEngine();
  readonly render = new MockRenderEngine();
  readonly annotation = new MockAnnotationEngine();
  readonly form = new MockFormEngine();
  readonly query = new MockQueryEngine();
  readonly transform = new MockTransformEngine();
  readonly validation = new MockValidationEngine();

  private loadedDocuments = new Map<string, PdfDocument>();
  private config: EngineConfig = {
    maxConcurrentOperations: 4,
    memoryLimit: 512 * 1024 * 1024,
    renderCacheSize: 100,
    debug: false,
    options: {},
  };

  initialize(config?: Partial<EngineConfig>): EngineResult<void> {
    this.config = { ...this.config, ...config };
    return { success: true, value: undefined };
  }

  shutdown(): EngineResult<void> {
    this.loadedDocuments.clear();
    return { success: true, value: undefined };
  }

  getConfig(): EngineResult<EngineConfig> {
    return { success: true, value: this.config };
  }

  updateConfig(config: Partial<EngineConfig>): EngineResult<EngineConfig> {
    this.config = { ...this.config, ...config };
    return { success: true, value: this.config };
  }

  getCapabilities(): EngineResult<{
    operations: string[];
    maxDocumentSize: number;
    maxPageCount: number;
    maxRenderDpi: number;
    supportedAnnotationTypes: string[];
    supportedFormFieldTypes: string[];
    supportedStandards: string[];
    supportedImageFormats: string[];
    supportsEncryption: boolean;
    supportsCompression: boolean;
    supportsSignatures: boolean;
    supportsOcr: boolean;
    supportsRedaction: boolean;
  }> {
    return {
      success: true,
      value: {
        operations: ['load', 'render', 'annotate', 'search', 'validate'],
        maxDocumentSize: 10 * 1024 * 1024,
        maxPageCount: 100,
        maxRenderDpi: 150,
        supportedAnnotationTypes: ['text', 'highlight', 'underline', 'strikeout', 'freehand'],
        supportedFormFieldTypes: ['text', 'checkbox', 'radio', 'dropdown', 'list'],
        supportedStandards: ['PDF/A-1b'],
        supportedImageFormats: ['png'],
        supportsEncryption: false,
        supportsCompression: false,
        supportsSignatures: false,
        supportsOcr: false,
        supportsRedaction: false,
      }
    };
  }

  isOperationSupported(operation: string): boolean {
    return ['load', 'render', 'annotate', 'search', 'validate'].includes(operation);
  }

  isFeatureSupported(feature: string): boolean {
    return ['annotations', 'form-fields', 'text-search', 'validation'].includes(feature);
  }

  getLoadedDocuments(): EngineResult<PdfDocument[]> {
    return { success: true, value: Array.from(this.loadedDocuments.values()) };
  }

  getDocument(documentId: string): EngineResult<PdfDocument> {
    const document = this.loadedDocuments.get(documentId);
    if (document) {
      return { success: true, value: document };
    }
    return { success: false, error: { code: 'document-not-loaded', message: 'Document not found' } };
  }

  isDocumentLoaded(documentId: string): boolean {
    return this.loadedDocuments.has(documentId);
  }

  getDocumentStats(): EngineResult<{
    loadedCount: number;
    totalMemoryUsage: number;
    averageLoadTime: number;
    errors: number;
  }> {
    return {
      success: true,
      value: {
        loadedCount: this.loadedDocuments.size,
        totalMemoryUsage: 0,
        averageLoadTime: 0,
        errors: 0,
      }
    };
  }

  getEngineInfo(): EngineResult<{
    name: string;
    version: string;
    vendor: string;
    buildDate: Date;
    platform: string;
    architecture: string;
    runtime: string;
    memoryUsage: number;
    uptime: number;
  }> {
    return {
      success: true,
      value: {
        name: this.name,
        version: this.version,
        vendor: this.vendor,
        buildDate: new Date(),
        platform: 'Mock Platform',
        architecture: 'Mock Architecture',
        runtime: 'browser-test',
        memoryUsage: 0,
        uptime: 0,
      }
    };
  }

  getHealthStatus(): EngineResult<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Array<{
      name: string;
      status: 'ok' | 'warning' | 'error';
      message?: string;
    }>;
    issues: string[];
    recommendations: string[];
  }> {
    return {
      success: true,
      value: {
        status: 'healthy',
        components: [
          { name: 'Document Engine', status: 'ok' },
          { name: 'Render Engine', status: 'ok' },
          { name: 'Annotation Engine', status: 'ok' },
          { name: 'Form Engine', status: 'ok' },
          { name: 'Query Engine', status: 'ok' },
          { name: 'Transform Engine', status: 'ok' },
          { name: 'Validation Engine', status: 'ok' },
        ],
        issues: [],
        recommendations: [],
      }
    };
  }

  getPerformanceMetrics(): EngineResult<{
    operationsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: {
      current: number;
      peak: number;
      allocated: number;
    };
    cache: {
      hitRate: number;
      size: number;
      entries: number;
    };
  }> {
    return {
      success: true,
      value: {
        operationsPerSecond: 1000,
        averageResponseTime: 0.1,
        errorRate: 0,
        memoryUsage: {
          current: 0,
          peak: 0,
          allocated: 0,
        },
        cache: {
          hitRate: 0,
          size: 0,
          entries: 0,
        },
      }
    };
  }

  runDiagnostics(): EngineResult<{
    engine: Array<{
      test: string;
      passed: boolean;
      message?: string;
      duration: number;
    }>;
    components: Array<{
      component: string;
      tests: Array<{
        test: string;
        passed: boolean;
        message?: string;
        duration: number;
      }>;
    }>;
    summary: {
      totalTests: number;
      passed: number;
      failed: number;
      duration: number;
      overallStatus: 'pass' | 'fail' | 'warning';
    };
  }> {
    return {
      success: true,
      value: {
        engine: [
          { test: 'Initialization', passed: true, duration: 0 },
          { test: 'Configuration', passed: true, duration: 0 },
        ],
        components: [
          {
            component: 'Document Engine',
            tests: [
              { test: 'Document Loading', passed: true, duration: 0 },
              { test: 'Document Saving', passed: true, duration: 0 },
            ]
          }
        ],
        summary: {
          totalTests: 4,
          passed: 4,
          failed: 0,
          duration: 0,
          overallStatus: 'pass',
        }
      }
    };
  }

  getLogs(): EngineResult<Array<{
    timestamp: Date;
    level: string;
    message: string;
    component?: string;
    context?: Record<string, unknown>;
  }>> {
    return { success: true, value: [] };
  }

  clearLogs(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  getResourceUsage(): EngineResult<{
    memory: {
      used: number;
      available: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      cores: number;
    };
    disk: {
      used: number;
      available: number;
      total: number;
    };
    network?: {
      bytesIn: number;
      bytesOut: number;
    };
  }> {
    return {
      success: true,
      value: {
        memory: {
          used: 0,
          available: 0,
          total: 0,
          percentage: 0,
        },
        cpu: {
          usage: 0,
          cores: 1,
        },
        disk: {
          used: 0,
          available: 0,
          total: 0,
        },
      }
    };
  }

  clearCaches(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  garbageCollect(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  setResourceLimits(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  // Event handling - simple mock implementation
  on(): void {}
  off(): void {}

  getVersionCompatibility(): EngineResult<{
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    return {
      success: true,
      value: {
        compatible: true,
        issues: [],
        recommendations: [],
      }
    };
  }

  exportState(): EngineResult<Uint8Array> {
    return { success: true, value: new Uint8Array() };
  }

  importState(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  reset(): EngineResult<void> {
    this.loadedDocuments.clear();
    return { success: true, value: undefined };
  }
}

/**
 * Helper to create mock document for testing
 */
export function createMockDocument(pageCount: number = 3): PdfDocument {
  const base = createEmptyDocument(`mock-${pageCount}-pages.pdf`);
  const mockPages = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    size: { width: 612, height: 792 },
    rotation: 0 as const,
    contentHash: '',
    isRendered: false,
    metadata: {
      label: String(i + 1),
      inRange: true,
      hasAnnotations: false,
      hasForms: false,
    },
  }));

  return {
    ...base,
    fileSize: pageCount * 1024 * 1024,
    pages: mockPages,
    metadata: {
      ...base.metadata,
      title: `Mock Document (${pageCount} pages)`,
      author: 'PDFluent Mock',
      subject: 'Testing Document',
      keywords: ['test', 'mock', 'document'],
      creator: 'PDFluent Mock Engine',
      producer: 'PDFluent',
    },
  };
}