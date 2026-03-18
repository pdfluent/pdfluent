// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultEngineFactory } from '../EngineFactory';
import { runtimeAdapterFactory } from '../../../platform/runtime';
import type { PdfEngine } from '../PdfEngine';

describe('EngineFactory Runtime Integration', () => {
  let factory: DefaultEngineFactory;

  beforeEach(() => {
    factory = new DefaultEngineFactory();
    runtimeAdapterFactory.initialize();
    runtimeAdapterFactory.configureEngineFactory(factory);
  });

  describe('Runtime Adapter Integration', () => {
    it('should set and get runtime adapter', () => {
      const adapter = factory.getRuntimeAdapter();
      expect(adapter).toBeDefined();
      expect(adapter).toHaveProperty('createEngine');
      expect(adapter).toHaveProperty('isAvailable');
      expect(adapter).toHaveProperty('getAvailableRuntimes');
    });

    it('should detect available runtimes', async () => {
      const runtimes = await factory.detectAvailableRuntimes();
      expect(runtimes).toBeInstanceOf(Array);

      // Should include browser-test at minimum
      expect(runtimes).toContain('browser-test');
    });

    it('should get recommended runtime', async () => {
      const runtime = await factory.getRecommendedRuntime();
      expect(typeof runtime).toBe('string');
      expect(['tauri', 'browser-test']).toContain(runtime);
    });
  });

  describe('Engine Creation with Runtime Adapter', () => {
    it('should create engine for browser-test runtime', async () => {
      const engine = await factory.createEngine('browser-test');
      expect(engine).toBeDefined();
      expect(engine).toHaveProperty('document');
      expect(engine).toHaveProperty('render');
      expect(engine).toHaveProperty('annotation');
      expect(engine).toHaveProperty('form');
      expect(engine).toHaveProperty('query');
      expect(engine).toHaveProperty('transform');
      expect(engine).toHaveProperty('validation');
      expect(engine).toHaveProperty('shutdown');
    });

    it('should create default engine', async () => {
      const engine = await factory.createDefaultEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.shutdown).toBe('function');
    });

    it('should create browser test engine', async () => {
      const engine = await factory.createBrowserTestEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.shutdown).toBe('function');
    });

    it('should handle tauri engine creation', async () => {
      // Tauri engine is now implemented (Issue #61)
      // The adapter should either create engine or handle availability check
      try {
        const engine = await factory.createTauriEngine();
        // If we get here, engine was created successfully
        expect(engine).toBeDefined();
        expect(typeof engine.shutdown).toBe('function');
      } catch (error: any) {
        // If engine creation fails, it should be a clean error
        // Acceptable errors in test environment:
        // - Tauri runtime not available (test environment)
        // - No engine factory registered (fallback scenario)
        expect([
          'Tauri runtime not available',
          'No engine factory registered for runtime: tauri'
        ]).toContain(error.message);
      }
    });
  });

  describe('Engine Management', () => {
    it('should track created engines', async () => {
      await factory.createEngine('browser-test');
      await factory.createEngine('browser-test');

      const allEngines = factory.getAllEngines();
      expect(allEngines.size).toBe(2);

      // Should be able to retrieve engines by ID
      const engineIds = Array.from(allEngines.keys());
      expect(engineIds).toHaveLength(2);
    });

    it('should enforce engine limit', async () => {
      // Create more engines than limit (default is 10)
      const engines: PdfEngine[] = [];
      for (let i = 0; i < 12; i++) {
        const engine = await factory.createEngine('browser-test');
        engines.push(engine);
      }

      const allEngines = factory.getAllEngines();
      expect(allEngines.size).toBe(10); // Should be limited to maxEngines
    });

    it('should shutdown all engines', async () => {
      // Create a few engines
      await factory.createEngine('browser-test');
      await factory.createEngine('browser-test');

      const shutdownResults = await factory.shutdownAllEngines();
      expect(shutdownResults).toBeInstanceOf(Array);
      expect(shutdownResults.length).toBe(2);

      // All should be successful
      for (const result of shutdownResults) {
        expect(result.success).toBe(true);
      }

      // No engines should remain
      expect(factory.getAllEngines().size).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should get and set factory config', () => {
      const originalConfig = factory.getFactoryConfig();

      // Update config
      factory.setFactoryConfig({
        defaultRuntime: 'tauri',
        maxEngines: 20,
        logLevel: 'debug'
      });

      const updatedConfig = factory.getFactoryConfig();
      expect(updatedConfig.defaultRuntime).toBe('tauri');
      expect(updatedConfig.maxEngines).toBe(20);
      expect(updatedConfig.logLevel).toBe('debug');

      // Other values should remain unchanged
      expect(updatedConfig.autoDiscovery).toBe(originalConfig.autoDiscovery);
      expect(updatedConfig.engineTimeout).toBe(originalConfig.engineTimeout);
    });

    it('should validate engine config', () => {
      const invalidConfig = { maxConcurrentOperations: -1 };
      const validation = factory.validateConfig(invalidConfig);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('maxConcurrentOperations must be at least 1');

      const validConfig = { maxConcurrentOperations: 4 };
      const validValidation = factory.validateConfig(validConfig);
      expect(validValidation.valid).toBe(true);
      expect(validValidation.errors).toHaveLength(0);
    });

    it('should get configuration schema', () => {
      const schema = factory.getConfigSchema();
      expect(schema).toHaveProperty('properties');
      expect(schema).toHaveProperty('required');
      expect(schema.properties).toHaveProperty('maxConcurrentOperations');
      expect(schema.properties).toHaveProperty('memoryLimit');
      expect(schema.properties).toHaveProperty('renderCacheSize');
      expect(schema.properties).toHaveProperty('debug');
    });
  });

  describe('Factory Reset', () => {
    it('should reset factory to default state', async () => {
      // Create some engines and modify config
      await factory.createEngine('browser-test');
      factory.setFactoryConfig({ maxEngines: 50 });

      // Reset
      factory.resetFactory();

      // Engines should be cleared
      expect(factory.getAllEngines().size).toBe(0);

      // Config should be reset to defaults
      const config = factory.getFactoryConfig();
      expect(config.maxEngines).toBe(10);
      expect(config.defaultRuntime).toBe('browser-test');
    });
  });
});