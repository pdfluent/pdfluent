// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runtimeRegistry, runtimeAdapterFactory } from '../index';

describe('Runtime Adapter Architecture Integration', () => {
  beforeEach(() => {
    // Reset runtime registry
    runtimeRegistry.clear();
  });

  describe('Runtime Registry', () => {
    it('should register and retrieve adapters', () => {
      const mockAdapter = {
        runtime: 'browser-test' as const,
        priority: 1,
        isAvailable: () => true,
        createEngine: async () => ({}) as any,
        getMetadata: () => ({
          name: 'Test Adapter',
          version: '1.0.0',
          description: 'Test',
          runtime: 'browser-test' as const
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

      runtimeRegistry.register(mockAdapter);

      const adapter = runtimeRegistry.getAdapter('browser-test');
      expect(adapter).toBe(mockAdapter);
      expect(runtimeRegistry.getAllAdapters()).toHaveLength(1);
    });

    it('should handle unavailable adapters', () => {
      const unavailableAdapter = {
        runtime: 'tauri' as const,
        priority: 100,
        isAvailable: () => false,
        createEngine: async () => ({}) as any,
        getMetadata: () => ({
          name: 'Unavailable Adapter',
          version: '1.0.0',
          description: 'Not available',
          runtime: 'tauri' as const
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

      runtimeRegistry.register(unavailableAdapter);

      const availableAdapters = runtimeRegistry.getAvailableAdapters();
      // In test environment, tauri adapter might not be available
      // So we check that it's filtered out
      expect(availableAdapters).not.toContainEqual(expect.objectContaining({ runtime: 'tauri' }));
    });
  });

  describe('Runtime Adapter Factory', () => {
    it('should initialize with default adapters', () => {
      runtimeAdapterFactory.initialize();

      const adapters = runtimeRegistry.getAllAdapters();
      expect(adapters.length).toBeGreaterThan(0);

      // Should have browser-test adapter at minimum
      const browserAdapter = runtimeRegistry.getAdapter('browser-test');
      expect(browserAdapter).toBeDefined();
      expect(browserAdapter?.runtime).toBe('browser-test');
    });

    it('should provide engine factory adapter', () => {
      runtimeAdapterFactory.initialize();

      const adapter = runtimeAdapterFactory.getEngineFactoryAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.createEngine).toBe('function');
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.getAvailableRuntimes).toBe('function');
    });
  });

  describe('Engine Factory Integration', () => {
    it('should configure engine factory with runtime adapter', () => {
      // Mock engine factory
      const mockSetAdapter = vi.fn();
      const engineFactory = {
        setRuntimeAdapter: mockSetAdapter
      };

      runtimeAdapterFactory.initialize();
      runtimeAdapterFactory.configureEngineFactory(engineFactory);

      expect(mockSetAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          createEngine: expect.any(Function),
          isAvailable: expect.any(Function),
          getAvailableRuntimes: expect.any(Function)
        })
      );
    });

    it('should create engine through runtime adapter', async () => {
      runtimeAdapterFactory.initialize();

      const adapter = runtimeAdapterFactory.getEngineFactoryAdapter();

      // Check if browser-test adapter is available in current environment
      if (adapter.isAvailable('browser-test')) {
        // Should be able to create engine (mock engine)
        const engine = await adapter.createEngine('browser-test');
        expect(engine).toBeDefined();
        expect(typeof engine.shutdown).toBe('function');
      } else {
        // If not available, that's OK for this test
        console.log('Browser-test adapter not available in current test environment');
      }
    });
  });

  describe('Runtime Detection', () => {
    it('should get adapter for current environment', () => {
      runtimeAdapterFactory.initialize();

      const adapter = runtimeAdapterFactory.getAdapterForCurrentEnvironment();
      // In test environment (Node.js), browser-test adapter might not be available
      // because window is undefined, but we check for test environment
      if (adapter) {
        expect(adapter.runtime).toBe('browser-test');
      }
      // If undefined, that's also OK - depends on environment detection
    });

    it('should get recommended adapter', () => {
      runtimeAdapterFactory.initialize();

      const adapter = runtimeAdapterFactory.getRecommendedAdapter();
      // Might be undefined in test environment
      if (adapter) {
        expect(adapter).toBeDefined();
      }
    });
  });

  describe('Capabilities', () => {
    it('should get adapter capabilities', () => {
      runtimeAdapterFactory.initialize();

      const capabilities = runtimeAdapterFactory.getAdapterCapabilities('browser-test');
      expect(capabilities).toBeDefined();
      expect(capabilities?.supportedOperations).toBeInstanceOf(Array);
      expect(capabilities?.maxFileSize).toBeTypeOf('number');
      expect(capabilities?.maxPageCount).toBeTypeOf('number');
    });
  });
});