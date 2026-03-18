// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Engine Factory
// ---------------------------------------------------------------------------

import type { Runtime } from '../types';
import type { PdfEngine } from './PdfEngine';
import type { EngineConfig } from './types';

/**
 * Engine factory for creating runtime-specific PDF engines
 */
export interface EngineFactory {
  // -------------------------------------------------------------------------
  // Engine Creation
  // -------------------------------------------------------------------------

  /**
   * Create PDF engine for specific runtime
   */
  createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;

  /**
   * Create default PDF engine based on current environment
   */
  createDefaultEngine(config?: Partial<EngineConfig>): Promise<PdfEngine>;

  /**
   * Create Tauri PDF engine (XFA SDK backend)
   */
  createTauriEngine(config?: Partial<EngineConfig>): Promise<PdfEngine>;

  /**
   * Create browser test PDF engine (mock implementation)
   */
  createBrowserTestEngine(config?: Partial<EngineConfig>): Promise<PdfEngine>;

  // -------------------------------------------------------------------------
  // Engine Registration
  // -------------------------------------------------------------------------

  /**
   * Register custom engine implementation
   */
  registerEngine(
    runtime: Runtime,
    factory: (config?: Partial<EngineConfig>) => Promise<PdfEngine>
  ): void;

  /**
   * Unregister engine implementation
   */
  unregisterEngine(runtime: Runtime): boolean;

  /**
   * Check if engine is registered for runtime
   */
  isEngineRegistered(runtime: Runtime): boolean;

  /**
   * Get registered engine runtimes
   */
  getRegisteredRuntimes(): Runtime[];

  // -------------------------------------------------------------------------
  // Engine Discovery
  // -------------------------------------------------------------------------

  /**
   * Discover available engines in current environment
   */
  discoverAvailableEngines(): Promise<Array<{
    runtime: Runtime;
    name: string;
    version: string;
    priority: number;
  }>>;

  /**
   * Get recommended engine for current environment
   */
  getRecommendedEngine(): Promise<{
    runtime: Runtime;
    name: string;
    version: string;
    reason: string;
  }>;

  /**
   * Test engine compatibility
   */
  testEngineCompatibility(): Promise<{
    compatible: boolean;
    issues: string[];
    warnings: string[];
    capabilities: Record<string, boolean>;
  }>;

  // -------------------------------------------------------------------------
  // Engine Configuration
  // -------------------------------------------------------------------------

  /**
   * Get default configuration for runtime
   */
  getDefaultConfig(): EngineConfig;

  /**
   * Validate configuration for runtime
   */
  validateConfig(config: Partial<EngineConfig>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedConfig: EngineConfig;
  };

  /**
   * Get configuration schema for runtime
   */
  getConfigSchema(): {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: unknown;
        minimum?: number;
        maximum?: number;
        enum?: unknown[];
        required?: boolean;
      }
    >;
    required: string[];
  };

  // -------------------------------------------------------------------------
  // Engine Management
  // -------------------------------------------------------------------------

  /**
   * Get engine instance by ID
   */
  getEngine(engineId: string): PdfEngine | undefined;

  /**
   * Get all active engine instances
   */
  getAllEngines(): Map<string, PdfEngine>;

  /**
   * Shutdown all engine instances
   */
  shutdownAllEngines(): Promise<Array<{
    engineId: string;
    success: boolean;
    error?: string;
  }>>;

  /**
   * Get engine instance statistics
   */
  getEngineStats(): {
    totalEngines: number;
    enginesByRuntime: Record<Runtime, number>;
    activeOperations: number;
    totalMemoryUsage: number;
    errors: number;
  };

  // -------------------------------------------------------------------------
  // Factory Configuration
  // -------------------------------------------------------------------------

  /**
   * Set factory configuration
   */
  setFactoryConfig(config: {
    defaultRuntime?: Runtime;
    autoDiscovery?: boolean;
    engineTimeout?: number;
    maxEngines?: number;
    logLevel?: 'error' | 'warning' | 'info' | 'debug';
  }): void;

  /**
   * Get factory configuration
   */
  getFactoryConfig(): {
    defaultRuntime: Runtime;
    autoDiscovery: boolean;
    engineTimeout: number;
    maxEngines: number;
    logLevel: string;
  };

  /**
   * Reset factory to default state
   */
  resetFactory(): void;

  // -------------------------------------------------------------------------
  // Runtime Integration
  // -------------------------------------------------------------------------

  /**
   * Set runtime adapter for factory to use
   */
  setRuntimeAdapter(adapter: {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  }): void;

  /**
   * Get current runtime adapter
   */
  getRuntimeAdapter(): {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  } | undefined;

  /**
   * Detect available runtimes in current environment
   */
  detectAvailableRuntimes(): Promise<Runtime[]>;

  /**
   * Get recommended runtime for current environment
   */
  getRecommendedRuntime(): Promise<Runtime>;

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Get engine feature matrix
   */
  getFeatureMatrix(): Promise<Record<
    Runtime,
    {
      features: Record<string, boolean>;
      limitations: string[];
      performance: {
        documentLoading: number;
        pageRendering: number;
        textSearch: number;
      };
    }
  >>;

  /**
   * Benchmark engines
   */
  benchmarkEngines(
    testDocument?: ArrayBuffer,
    operations?: string[]
  ): Promise<Record<
    Runtime,
    {
      initializationTime: number;
      documentLoadTime: number;
      pageRenderTime: number;
      textSearchTime: number;
      memoryUsage: number;
      score: number;
    }
  >>;

  /**
   * Compare engine outputs
   */
  compareEngineOutputs(
    engines: Runtime[],
    operation: string,
    input: unknown
  ): Promise<{
    consistent: boolean;
    differences: Array<{
      engine: Runtime;
      output: unknown;
      differences?: Record<string, unknown>;
    }>;
  }>;
}

/**
 * Default engine factory implementation
 */
export class DefaultEngineFactory implements EngineFactory {
  private engines = new Map<string, PdfEngine>();
  private factories = new Map<Runtime, (config?: Partial<EngineConfig>) => Promise<PdfEngine>>();
  private runtimeAdapter?: {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  };
  private config = {
    defaultRuntime: 'browser-test' as Runtime,
    autoDiscovery: true,
    engineTimeout: 30000,
    maxEngines: 10,
    logLevel: 'warning' as 'error' | 'warning' | 'info' | 'debug',
  };

  async createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine> {
    // Try runtime adapter first
    if (this.runtimeAdapter && this.runtimeAdapter.isAvailable(runtime)) {
      try {
        const engine = await this.runtimeAdapter.createEngine(runtime, config);
        const engineId = `${runtime}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.engines.set(engineId, engine);
        this.enforceEngineLimit();
        return engine;
      } catch (error) {
        // Fall back to registered factory
        console.warn(`Runtime adapter failed for ${runtime}, falling back to registered factory:`, error);
      }
    }

    // Fall back to registered factory
    const factory = this.factories.get(runtime);
    if (!factory) {
      throw new Error(`No engine factory registered for runtime: ${runtime}`);
    }

    const engine = await factory(config);
    const engineId = `${runtime}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.engines.set(engineId, engine);
    this.enforceEngineLimit();

    return engine;
  }

  async createDefaultEngine(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    return this.createEngine(this.config.defaultRuntime, config);
  }

  async createTauriEngine(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    return this.createEngine('tauri', config);
  }

  async createBrowserTestEngine(config?: Partial<EngineConfig>): Promise<PdfEngine> {
    return this.createEngine('browser-test', config);
  }

  registerEngine(
    runtime: Runtime,
    factory: (config?: Partial<EngineConfig>) => Promise<PdfEngine>
  ): void {
    this.factories.set(runtime, factory);
  }

  unregisterEngine(runtime: Runtime): boolean {
    return this.factories.delete(runtime);
  }

  isEngineRegistered(runtime: Runtime): boolean {
    return this.factories.has(runtime);
  }

  getRegisteredRuntimes(): Runtime[] {
    return Array.from(this.factories.keys()) as Runtime[];
  }

  // Other methods would be implemented here...
  // For brevity, implementing the full interface would continue here

  getEngine(engineId: string): PdfEngine | undefined {
    return this.engines.get(engineId);
  }

  getAllEngines(): Map<string, PdfEngine> {
    return new Map(this.engines);
  }

  async shutdownAllEngines(): Promise<Array<{ engineId: string; success: boolean; error?: string }>> {
    const results = [];
    for (const [engineId, engine] of this.engines) {
      const shutdownResult = engine.shutdown();
      if (shutdownResult.success) {
        results.push({ engineId, success: true });
      } else {
        results.push({
          engineId,
          success: false,
          error: shutdownResult.error?.message || 'Unknown error'
        });
      }
    }
    this.engines.clear();
    return results;
  }

  getEngineStats() {
    const enginesByRuntime: Record<Runtime, number> = {} as Record<Runtime, number>;

    return {
      totalEngines: this.engines.size,
      enginesByRuntime,
      activeOperations: 0,
      totalMemoryUsage: 0,
      errors: 0,
    };
  }

  setFactoryConfig(config: {
    defaultRuntime?: Runtime;
    autoDiscovery?: boolean;
    engineTimeout?: number;
    maxEngines?: number;
    logLevel?: 'error' | 'warning' | 'info' | 'debug';
  }) {
    Object.assign(this.config, config);
  }

  getFactoryConfig() {
    return { ...this.config };
  }

  resetFactory(): void {
    this.engines.clear();
    this.factories.clear();
    this.runtimeAdapter = undefined;
    this.config = {
      defaultRuntime: 'browser-test',
      autoDiscovery: true,
      engineTimeout: 30000,
      maxEngines: 10,
      logLevel: 'warning',
    };
  }

  // -------------------------------------------------------------------------
  // Runtime Integration Implementation
  // -------------------------------------------------------------------------

  setRuntimeAdapter(adapter: {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  }): void {
    this.runtimeAdapter = adapter;
  }

  getRuntimeAdapter(): {
    createEngine(runtime: Runtime, config?: Partial<EngineConfig>): Promise<PdfEngine>;
    isAvailable(runtime: Runtime): boolean;
    getAvailableRuntimes(): Runtime[];
  } | undefined {
    return this.runtimeAdapter;
  }

  async detectAvailableRuntimes(): Promise<Runtime[]> {
    const runtimes: Runtime[] = [];

    // Check runtime adapter first
    if (this.runtimeAdapter) {
      runtimes.push(...this.runtimeAdapter.getAvailableRuntimes());
    }

    // Check registered factories
    for (const runtime of this.factories.keys()) {
      if (!runtimes.includes(runtime)) {
        runtimes.push(runtime);
      }
    }

    return runtimes;
  }

  async getRecommendedRuntime(): Promise<Runtime> {
    // Prefer Tauri if available
    if (this.runtimeAdapter?.isAvailable('tauri')) {
      return 'tauri';
    }

    // Otherwise use browser-test
    return 'browser-test';
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private enforceEngineLimit(): void {
    if (this.engines.size <= this.config.maxEngines) {
      return;
    }

    // Remove oldest engines
    const keys = Array.from(this.engines.keys());
    const keysToRemove = keys.slice(0, this.engines.size - this.config.maxEngines);

    for (const key of keysToRemove) {
      const engine = this.engines.get(key);
      if (engine) {
        try {
          engine.shutdown();
        } catch (error) {
          // Log but continue
          console.warn(`Failed to shutdown engine ${key}:`, error);
        }
      }
      this.engines.delete(key);
    }
  }

  // Stub implementations for other methods
  async discoverAvailableEngines(): Promise<Array<{ runtime: Runtime; name: string; version: string; priority: number }>> {
    return [];
  }

  async getRecommendedEngine(): Promise<{ runtime: Runtime; name: string; version: string; reason: string }> {
    return {
      runtime: this.config.defaultRuntime,
      name: 'Default Engine',
      version: '0.1.0',
      reason: 'Default runtime configuration',
    };
  }

  async testEngineCompatibility() {
    return {
      compatible: true,
      issues: [],
      warnings: [],
      capabilities: {},
    };
  }

  getDefaultConfig(): EngineConfig {
    return {
      maxConcurrentOperations: 4,
      memoryLimit: 512 * 1024 * 1024, // 512MB
      renderCacheSize: 100,
      debug: false,
      options: {},
    };
  }

  validateConfig(config: Partial<EngineConfig>) {
    const defaultConfig = this.getDefaultConfig();
    const sanitizedConfig: EngineConfig = { ...defaultConfig, ...config };

    const errors: string[] = [];
    const warnings: string[] = [];

    if (sanitizedConfig.maxConcurrentOperations < 1) {
      errors.push('maxConcurrentOperations must be at least 1');
    }

    if (sanitizedConfig.memoryLimit < 64 * 1024 * 1024) {
      warnings.push('memoryLimit is very low (minimum 64MB recommended)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedConfig,
    };
  }

  getConfigSchema() {
    return {
      properties: {
        maxConcurrentOperations: {
          type: 'number',
          description: 'Maximum concurrent operations',
          default: 4,
          minimum: 1,
          maximum: 32,
          required: false,
        },
        memoryLimit: {
          type: 'number',
          description: 'Memory limit in bytes',
          default: 512 * 1024 * 1024,
          minimum: 64 * 1024 * 1024,
          required: false,
        },
        renderCacheSize: {
          type: 'number',
          description: 'Cache size for rendered pages',
          default: 100,
          minimum: 0,
          maximum: 1000,
          required: false,
        },
        debug: {
          type: 'boolean',
          description: 'Enable debug logging',
          default: false,
          required: false,
        },
      },
      required: [],
    };
  }

  async getFeatureMatrix(): Promise<Record<Runtime, { features: Record<string, boolean>; limitations: string[]; performance: { documentLoading: number; pageRendering: number; textSearch: number } }>> {
    return {} as any;
  }

  async benchmarkEngines(): Promise<Record<Runtime, { initializationTime: number; documentLoadTime: number; pageRenderTime: number; textSearchTime: number; memoryUsage: number; score: number }>> {
    return {} as any;
  }

  async compareEngineOutputs(): Promise<{ consistent: boolean; differences: Array<{ engine: Runtime; output: unknown; differences?: Record<string, unknown> }> }> {
    return { consistent: true, differences: [] };
  }
}

/**
 * Singleton engine factory instance
 */
export const engineFactory = new DefaultEngineFactory();