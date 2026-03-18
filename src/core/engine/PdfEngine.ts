// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// PDF Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument } from '../document';
import type { DocumentEngine } from './DocumentEngine';
import type { RenderEngine } from './RenderEngine';
import type { AnnotationEngine } from './AnnotationEngine';
import type { FormEngine } from './FormEngine';
import type { QueryEngine } from './QueryEngine';
import type { TransformEngine } from './TransformEngine';
import type { ValidationEngine } from './ValidationEngine';
import type { EngineConfig, EngineResult } from './types';

/**
 * PDF Engine - Main interface that bundles all sub-engines
 */
export interface PdfEngine {
  // -------------------------------------------------------------------------
  // Engine Identification
  // -------------------------------------------------------------------------

  /** Engine name */
  readonly name: string;

  /** Engine version */
  readonly version: string;

  /** Engine vendor */
  readonly vendor: string;

  /** Supported PDF versions */
  readonly supportedPdfVersions: string[];

  /** Whether engine is initialized */
  readonly isInitialized: boolean;

  // -------------------------------------------------------------------------
  // Sub-Engines
  // -------------------------------------------------------------------------

  /** Document operations engine */
  readonly document: DocumentEngine;

  /** Rendering engine */
  readonly render: RenderEngine;

  /** Annotation operations engine */
  readonly annotation: AnnotationEngine;

  /** Form operations engine */
  readonly form: FormEngine;

  /** Query and search engine */
  readonly query: QueryEngine;

  /** Document transformation engine */
  readonly transform: TransformEngine;

  /** Validation and compliance engine */
  readonly validation: ValidationEngine;

  // -------------------------------------------------------------------------
  // Engine Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize engine with configuration
   */
  initialize(config?: Partial<EngineConfig>): EngineResult<void>;

  /**
   * Shutdown engine and release resources
   */
  shutdown(): EngineResult<void>;

  /**
   * Get engine configuration
   */
  getConfig(): EngineResult<EngineConfig>;

  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<EngineConfig>): EngineResult<EngineConfig>;

  // -------------------------------------------------------------------------
  // Engine Capabilities
  // -------------------------------------------------------------------------

  /**
   * Get engine capabilities
   */
  getCapabilities(): EngineResult<{
    /** Supported operations */
    operations: string[];

    /** Maximum document size in bytes */
    maxDocumentSize: number;

    /** Maximum page count */
    maxPageCount: number;

    /** Maximum render DPI */
    maxRenderDpi: number;

    /** Supported annotation types */
    supportedAnnotationTypes: string[];

    /** Supported form field types */
    supportedFormFieldTypes: string[];

    /** Supported PDF standards */
    supportedStandards: string[];

    /** Supported image formats for import/export */
    supportedImageFormats: string[];

    /** Whether engine supports encryption */
    supportsEncryption: boolean;

    /** Whether engine supports compression */
    supportsCompression: boolean;

    /** Whether engine supports digital signatures */
    supportsSignatures: boolean;

    /** Whether engine supports OCR */
    supportsOcr: boolean;

    /** Whether engine supports redaction */
    supportsRedaction: boolean;
  }>;

  /**
   * Check if operation is supported
   */
  isOperationSupported(operation: string): boolean;

  /**
   * Check if feature is supported
   */
  isFeatureSupported(feature: string): boolean;

  // -------------------------------------------------------------------------
  // Document Management
  // -------------------------------------------------------------------------

  /**
   * Get all loaded documents
   */
  getLoadedDocuments(): EngineResult<PdfDocument[]>;

  /**
   * Get document by ID
   */
  getDocument(documentId: string): EngineResult<PdfDocument>;

  /**
   * Check if document is loaded
   */
  isDocumentLoaded(documentId: string): boolean;

  /**
   * Get document load statistics
   */
  getDocumentStats(): EngineResult<{
    loadedCount: number;
    totalMemoryUsage: number;
    averageLoadTime: number;
    errors: number;
  }>;

  // -------------------------------------------------------------------------
  // Engine Information
  // -------------------------------------------------------------------------

  /**
   * Get engine information
   */
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
  }>;

  /**
   * Get engine health status
   */
  getHealthStatus(): EngineResult<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Array<{
      name: string;
      status: 'ok' | 'warning' | 'error';
      message?: string;
    }>;
    issues: string[];
    recommendations: string[];
  }>;

  /**
   * Get engine performance metrics
   */
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
  }>;

  // -------------------------------------------------------------------------
  // Engine Diagnostics
  // -------------------------------------------------------------------------

  /**
   * Run engine diagnostics
   */
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
  }>;

  /**
   * Get engine logs
   */
  getLogs(
    level?: 'error' | 'warning' | 'info' | 'debug',
    limit?: number
  ): EngineResult<Array<{
    timestamp: Date;
    level: string;
    message: string;
    component?: string;
    context?: Record<string, unknown>;
  }>>;

  /**
   * Clear engine logs
   */
  clearLogs(): EngineResult<void>;

  // -------------------------------------------------------------------------
  // Resource Management
  // -------------------------------------------------------------------------

  /**
   * Get resource usage
   */
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
  }>;

  /**
   * Clear engine caches
   */
  clearCaches(): EngineResult<void>;

  /**
   * Garbage collect unused resources
   */
  garbageCollect(): EngineResult<void>;

  /**
   * Set resource limits
   */
  setResourceLimits(limits: {
    memory?: number;
    diskCache?: number;
    concurrentOperations?: number;
  }): EngineResult<void>;

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  /**
   * Register event listener
   */
  on(
    event: 'documentLoaded' | 'documentSaved' | 'documentClosed' | 'error' | 'warning' | 'operationComplete',
    listener: (event: {
      type: string;
      timestamp: Date;
      data: Record<string, unknown>;
    }) => void
  ): void;

  /**
   * Unregister event listener
   */
  off(
    event: 'documentLoaded' | 'documentSaved' | 'documentClosed' | 'error' | 'warning' | 'operationComplete',
    listener: (event: {
      type: string;
      timestamp: Date;
      data: Record<string, unknown>;
    }) => void
  ): void;

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Get engine version compatibility
   */
  getVersionCompatibility(
    otherVersion: string
  ): EngineResult<{
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  }>;

  /**
   * Export engine state
   */
  exportState(): EngineResult<Uint8Array>;

  /**
   * Import engine state
   */
  importState(state: Uint8Array): EngineResult<void>;

  /**
   * Reset engine to default state
   */
  reset(): EngineResult<void>;
}