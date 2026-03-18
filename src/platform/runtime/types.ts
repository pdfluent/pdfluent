// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Runtime Adapter Types
// ---------------------------------------------------------------------------

import type { Runtime } from '../../core/types';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { EngineConfig } from '../../core/engine/types';

/**
 * Runtime adapter for creating engine instances
 */
export interface RuntimeAdapter {
  /**
   * Runtime this adapter supports
   */
  readonly runtime: Runtime;

  /**
   * Priority of this adapter (higher = more preferred)
   */
  readonly priority: number;

  /**
   * Check if this adapter is available in current environment
   */
  isAvailable(): boolean;

  /**
   * Create engine instance for this runtime
   */
  createEngine(config?: Partial<EngineConfig>): Promise<PdfEngine>;

  /**
   * Get adapter metadata (name, version, description)
   */
  getMetadata(): RuntimeAdapterMetadata;

  /**
   * Get capabilities supported by this adapter
   */
  getCapabilities(): RuntimeCapabilities;
}

/**
 * Metadata about a runtime adapter
 */
export interface RuntimeAdapterMetadata {
  /** Adapter name */
  name: string;
  /** Adapter version */
  version: string;
  /** Adapter description */
  description: string;
  /** Runtime this adapter supports */
  runtime: Runtime;
}

/**
 * Capabilities supported by a runtime adapter
 */
export interface RuntimeCapabilities {
  /** Operations supported by this adapter */
  supportedOperations: string[];
  /** Maximum file size in bytes (0 = no limit) */
  maxFileSize: number;
  /** Maximum page count (0 = no limit) */
  maxPageCount: number;
  /** Whether adapter supports streaming operations */
  supportsStreaming: boolean;
  /** Whether adapter supports parallel operations */
  supportsParallel: boolean;
  /** Performance characteristics */
  performance: RuntimePerformance;
}

/**
 * Performance characteristics of a runtime adapter
 */
export interface RuntimePerformance {
  /** Document loading speed (1-10, 10 = fastest) */
  documentLoading: number;
  /** Page rendering speed (1-10, 10 = fastest) */
  pageRendering: number;
  /** Text extraction speed (1-10, 10 = fastest) */
  textExtraction: number;
  /** Memory efficiency (1-10, 10 = most efficient) */
  memoryEfficiency: number;
}

/**
 * Runtime registry for managing adapters
 */
export interface RuntimeRegistry {
  /**
   * Register a runtime adapter
   */
  register(adapter: RuntimeAdapter): void;

  /**
   * Unregister a runtime adapter
   */
  unregister(runtime: Runtime): boolean;

  /**
   * Get adapter for specific runtime
   */
  getAdapter(runtime: Runtime): RuntimeAdapter | undefined;

  /**
   * Get adapter for current environment
   */
  getAdapterForCurrentEnvironment(): RuntimeAdapter | undefined;

  /**
   * Get all registered adapters
   */
  getAllAdapters(): RuntimeAdapter[];

  /**
   * Get all available adapters (isAvailable() === true)
   */
  getAvailableAdapters(): RuntimeAdapter[];

  /**
   * Get recommended adapter for current environment
   */
  getRecommendedAdapter(): RuntimeAdapter | undefined;

  /**
   * Clear all registered adapters
   */
  clear(): void;
}

/**
 * Runtime detection result
 */
export interface RuntimeDetectionResult {
  /** Detected runtime */
  runtime: Runtime;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Detection method used */
  method: string;
  /** Environment details */
  environment: RuntimeEnvironment;
}

/**
 * Environment details
 */
export interface RuntimeEnvironment {
  /** Platform (web, desktop, mobile) */
  platform: string;
  /** User agent string (if available) */
  userAgent?: string;
  /** Tauri API available */
  tauriAvailable: boolean;
  /** Web APIs available */
  webAPIs: string[];
  /** Memory available in bytes */
  availableMemory?: number;
}

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  /** Default runtime to use */
  defaultRuntime?: Runtime;
  /** Whether to auto-detect runtime */
  autoDetect: boolean;
  /** Whether to prefer native over web runtime */
  preferNative: boolean;
  /** Fallback runtime if preferred not available */
  fallbackRuntime: Runtime;
  /** Timeout for runtime detection in ms */
  detectionTimeout: number;
  /** Log level for runtime layer */
  logLevel: 'error' | 'warning' | 'info' | 'debug';
}