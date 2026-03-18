// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Runtime } from '../../core/types';
import type {
  RuntimeAdapter,
  RuntimeRegistry,
  RuntimeDetectionResult,
  RuntimeConfig,
  RuntimeAdapterMetadata,
  RuntimeEnvironment
} from './types';
import { detectRuntime } from '../../core/types';

/**
 * Default runtime configuration
 */
const DEFAULT_CONFIG: RuntimeConfig = {
  autoDetect: true,
  preferNative: true,
  fallbackRuntime: 'browser-test',
  detectionTimeout: 1000,
  logLevel: 'warning'
};

/**
 * Default runtime adapter metadata
 */
const DEFAULT_ADAPTER_METADATA: RuntimeAdapterMetadata = {
  name: 'Default Adapter',
  version: '0.1.0',
  description: 'Default runtime adapter',
  runtime: 'browser-test' as Runtime
};

/**
 * Implementation of RuntimeRegistry
 */
export class DefaultRuntimeRegistry implements RuntimeRegistry {
  private adapters = new Map<Runtime, RuntimeAdapter>();
  private config: RuntimeConfig = { ...DEFAULT_CONFIG };

  register(adapter: RuntimeAdapter): void {
    if (this.adapters.has(adapter.runtime)) {
      console.warn(`Overwriting existing adapter for runtime: ${adapter.runtime}`);
    }
    this.adapters.set(adapter.runtime, adapter);
  }

  unregister(runtime: Runtime): boolean {
    return this.adapters.delete(runtime);
  }

  getAdapter(runtime: Runtime): RuntimeAdapter | undefined {
    return this.adapters.get(runtime);
  }

  getAdapterForCurrentEnvironment(): RuntimeAdapter | undefined {
    if (!this.config.autoDetect) {
      const defaultRuntime = this.config.defaultRuntime || this.config.fallbackRuntime;
      return this.getAdapter(defaultRuntime);
    }

    const detection = this.detectRuntime();

    // Try detected runtime first
    const detectedAdapter = this.getAdapter(detection.runtime);
    if (detectedAdapter?.isAvailable()) {
      return detectedAdapter;
    }

    // If preferNative and detected runtime is not available, try others
    if (this.config.preferNative && detection.runtime === 'tauri') {
      // Try browser-test as fallback
      const browserAdapter = this.getAdapter('browser-test');
      if (browserAdapter?.isAvailable()) {
        return browserAdapter;
      }
    }

    // Return any available adapter
    for (const adapter of this.adapters.values()) {
      if (adapter.isAvailable()) {
        return adapter;
      }
    }

    return undefined;
  }

  getAllAdapters(): RuntimeAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAvailableAdapters(): RuntimeAdapter[] {
    return this.getAllAdapters().filter(adapter => adapter.isAvailable());
  }

  getRecommendedAdapter(): RuntimeAdapter | undefined {
    const adapters = this.getAvailableAdapters();
    if (adapters.length === 0) {
      return undefined;
    }

    // Sort by priority (highest first)
    adapters.sort((a, b) => b.priority - a.priority);

    // If Tauri is available and we prefer native, use it
    if (this.config.preferNative) {
      const tauriAdapter = adapters.find(a => a.runtime === 'tauri');
      if (tauriAdapter) {
        return tauriAdapter;
      }
    }

    // Return highest priority adapter
    return adapters[0];
  }

  clear(): void {
    this.adapters.clear();
  }

  /**
   * Set runtime configuration
   */
  setConfig(config: Partial<RuntimeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  /**
   * Detect runtime environment
   */
  private detectRuntime(): RuntimeDetectionResult {
    const runtime = detectRuntime();

    const environment = this.detectEnvironment();

    return {
      runtime,
      confidence: 0.9, // High confidence for simple detection
      method: 'window.__TAURI__ check',
      environment
    };
  }

  /**
   * Detect environment details
   */
  private detectEnvironment(): RuntimeEnvironment {
    const tauriAvailable = typeof window !== 'undefined' && !!(window as any).__TAURI__;

    const webAPIs: string[] = [];
    if (typeof window !== 'undefined') {
      // Check for common Web APIs
      if ('fetch' in window) webAPIs.push('fetch');
      if ('Worker' in window) webAPIs.push('Worker');
      if ('WebAssembly' in window) webAPIs.push('WebAssembly');
      if ('OffscreenCanvas' in window) webAPIs.push('OffscreenCanvas');
    }

    return {
      platform: tauriAvailable ? 'desktop' : 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      tauriAvailable,
      webAPIs,
      availableMemory: (performance as any)?.memory?.totalJSHeapSize
    };
  }

  /**
   * Create a placeholder adapter for testing
   */
  static createPlaceholderAdapter(runtime: Runtime): RuntimeAdapter {
    return {
      runtime,
      priority: 1,
      isAvailable: () => true,
      createEngine: async () => {
        throw new Error(`Placeholder adapter for ${runtime} cannot create engines`);
      },
      getMetadata: () => ({
        ...DEFAULT_ADAPTER_METADATA,
        runtime,
        name: `Placeholder Adapter (${runtime})`
      }),
      getCapabilities: () => ({
        supportedOperations: [],
        maxFileSize: 0,
        maxPageCount: 0,
        supportsStreaming: false,
        supportsParallel: false,
        performance: {
          documentLoading: 1,
          pageRendering: 1,
          textExtraction: 1,
          memoryEfficiency: 1
        }
      })
    };
  }
}

/**
 * Singleton runtime registry instance
 */
export const runtimeRegistry = new DefaultRuntimeRegistry();