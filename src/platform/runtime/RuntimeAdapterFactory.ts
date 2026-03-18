// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Runtime } from '../../core/types';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { EngineConfig } from '../../core/engine/types';
import type { RuntimeRegistry, RuntimeAdapter } from './types';
import { runtimeRegistry } from './RuntimeRegistry';
import { createTauriRuntimeAdapter } from './adapters/TauriRuntimeAdapter';
import { createBrowserTestRuntimeAdapter } from './adapters/BrowserTestRuntimeAdapter';

/**
 * Factory for creating runtime adapters and connecting them to EngineFactory
 */
export class RuntimeAdapterFactory {
  private registry: RuntimeRegistry;

  constructor(registry: RuntimeRegistry = runtimeRegistry) {
    this.registry = registry;
  }

  /**
   * Initialize runtime adapters
   */
  initialize(): void {
    this.registerDefaultAdapters();
  }

  /**
   * Register default adapters
   */
  private registerDefaultAdapters(): void {
    // Register Tauri adapter if available
    const tauriAdapter = createTauriRuntimeAdapter();
    if (tauriAdapter.isAvailable()) {
      this.registry.register(tauriAdapter);
    }

    // Always register browser test adapter
    const browserAdapter = createBrowserTestRuntimeAdapter();
    this.registry.register(browserAdapter);
  }

  /**
   * Get engine factory adapter for connecting to EngineFactory
   */
  getEngineFactoryAdapter(): {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  } {
    return {
      createEngine: async (runtime: Runtime, config?: Partial<EngineConfig>) => {
        const adapter = this.registry.getAdapter(runtime);
        if (!adapter) {
          throw new Error(`No runtime adapter available for runtime: ${runtime}`);
        }
        if (!adapter.isAvailable()) {
          throw new Error(`Runtime adapter for ${runtime} is not available in current environment`);
        }
        return adapter.createEngine(config);
      },

      isAvailable: (runtime: Runtime): boolean => {
        const adapter = this.registry.getAdapter(runtime);
        return adapter?.isAvailable() || false;
      },

      getAvailableRuntimes: (): Runtime[] => {
        const adapters = this.registry.getAvailableAdapters();
        return adapters.map(adapter => adapter.runtime);
      }
    };
  }

  /**
   * Configure engine factory with runtime adapter
   */
  configureEngineFactory(engineFactory: {
    setRuntimeAdapter(adapter: {
      createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
      isAvailable(runtime: Runtime): boolean;
      getAvailableRuntimes(): Runtime[];
    }): void;
  }): void {
    const adapter = this.getEngineFactoryAdapter();
    engineFactory.setRuntimeAdapter(adapter);
  }

  /**
   * Get adapter for current environment
   */
  getAdapterForCurrentEnvironment(): RuntimeAdapter | undefined {
    return this.registry.getAdapterForCurrentEnvironment();
  }

  /**
   * Get recommended adapter
   */
  getRecommendedAdapter(): RuntimeAdapter | undefined {
    return this.registry.getRecommendedAdapter();
  }

  /**
   * Create engine using recommended adapter
   */
  async createEngineWithRecommendedAdapter(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    const adapter = this.getRecommendedAdapter();
    if (!adapter) {
      throw new Error('No runtime adapters available');
    }
    return adapter.createEngine(config);
  }

  /**
   * Get adapter capabilities
   */
  getAdapterCapabilities(runtime: Runtime): {
    supportedOperations: string[];
    maxFileSize: number;
    maxPageCount: number;
    supportsStreaming: boolean;
    supportsParallel: boolean;
  } | undefined {
    const adapter = this.registry.getAdapter(runtime);
    if (!adapter) {
      return undefined;
    }
    const capabilities = adapter.getCapabilities();
    return {
      supportedOperations: capabilities.supportedOperations,
      maxFileSize: capabilities.maxFileSize,
      maxPageCount: capabilities.maxPageCount,
      supportsStreaming: capabilities.supportsStreaming,
      supportsParallel: capabilities.supportsParallel
    };
  }
}

/**
 * Singleton runtime adapter factory instance
 */
export const runtimeAdapterFactory = new RuntimeAdapterFactory();