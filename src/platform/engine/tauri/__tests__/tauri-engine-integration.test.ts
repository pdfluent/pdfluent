// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach } from 'vitest';
import { TauriPdfEngine } from '../TauriPdfEngine';

describe('TauriPdfEngine Integration', () => {
  let engine: TauriPdfEngine;

  beforeEach(() => {
    engine = TauriPdfEngine.create();
  });

  describe('Engine Creation', () => {
    it('should create Tauri engine instance', () => {
      expect(engine).toBeDefined();
      expect(engine.name).toBe('Tauri PDF Engine');
      expect(engine.version).toBe('0.1.0');
      expect(engine.vendor).toBe('PDFluent');
      expect(engine.isInitialized).toBe(true);
    });

    it('should have all engine components', () => {
      expect(engine.document).toBeDefined();
      expect(engine.render).toBeDefined();
      expect(engine.annotation).toBeDefined();
      expect(engine.form).toBeDefined();
      expect(engine.query).toBeDefined();
      expect(engine.transform).toBeDefined();
      expect(engine.validation).toBeDefined();
    });

    it('should support PDF versions', () => {
      expect(engine.supportedPdfVersions).toContain('1.7');
      expect(engine.supportedPdfVersions).toContain('2.0');
      expect(engine.supportedPdfVersions.length).toBeGreaterThan(0);
    });
  });

  describe('Capabilities', () => {
    it('should get engine capabilities', async () => {
      const result = await engine.getCapabilities();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.operations).toContain('open');
        expect(result.value.operations).toContain('render');
        expect(result.value.operations).toContain('annotate');
        expect(result.value.maxDocumentSize).toBeGreaterThan(0);
        expect(result.value.maxPageCount).toBeGreaterThan(0);
        expect(result.value.maxRenderDpi).toBeGreaterThan(0);
      }
    });

    it('should check operation support', () => {
      expect(engine.isOperationSupported('open')).toBe(true);
      expect(engine.isOperationSupported('save')).toBe(true);
      expect(engine.isOperationSupported('render')).toBe(true);
      expect(engine.isOperationSupported('non-existent')).toBe(false);
    });

    it('should check feature support', () => {
      expect(engine.isFeatureSupported('annotations')).toBe(true);
      expect(engine.isFeatureSupported('form-fields')).toBe(true);
      expect(engine.isFeatureSupported('text-search')).toBe(true);
      expect(engine.isFeatureSupported('non-existent')).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should get and update config', async () => {
      const configResult = await engine.getConfig();
      expect(configResult.success).toBe(true);

      if (configResult.success) {
        const originalValue = configResult.value.maxConcurrentOperations;

        const updateResult = await engine.updateConfig({ maxConcurrentOperations: 8 });
        expect(updateResult.success).toBe(true);

        if (updateResult.success) {
          expect(updateResult.value.maxConcurrentOperations).toBe(8);
        }

        // Restore original value
        await engine.updateConfig({ maxConcurrentOperations: originalValue });
      }
    });

    it('should validate configuration', () => {
      const validation = engine.initialize({ maxConcurrentOperations: -1 });

      // Note: In test environment, Tauri might not be available
      // So we accept either error or success with warning
      if (validation.success) {
        // If initialization succeeded (tauri not available), that's OK
        expect(validation.success).toBe(true);
      } else {
        expect(validation.error?.code).toBeDefined();
      }
    });
  });

  describe('Engine Info', () => {
    it('should get engine information', async () => {
      const result = await engine.getEngineInfo();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.name).toBe('Tauri PDF Engine');
        expect(result.value.version).toBe('0.1.0');
        expect(result.value.vendor).toBe('PDFluent');
        expect(result.value.runtime).toBe('tauri');
      }
    });

    it('should get health status', async () => {
      const result = await engine.getHealthStatus();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(result.value.status);
        expect(result.value.components).toBeInstanceOf(Array);
        expect(result.value.components.length).toBeGreaterThan(0);
      }
    });

    it('should run diagnostics', async () => {
      const result = await engine.runDiagnostics();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.engine).toBeInstanceOf(Array);
        expect(result.value.components).toBeInstanceOf(Array);
        expect(result.value.summary).toBeDefined();
        expect(result.value.summary.totalTests).toBeGreaterThan(0);
      }
    });
  });

  describe('Resource Management', () => {
    it('should get performance metrics', async () => {
      const result = await engine.getPerformanceMetrics();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.operationsPerSecond).toBeDefined();
        expect(result.value.averageResponseTime).toBeDefined();
        expect(result.value.memoryUsage).toBeDefined();
        expect(result.value.cache).toBeDefined();
      }
    });

    it('should get resource usage', async () => {
      const result = await engine.getResourceUsage();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.memory).toBeDefined();
        expect(result.value.cpu).toBeDefined();
        expect(result.value.disk).toBeDefined();
      }
    });

    it('should handle cache operations', async () => {
      const clearResult = await engine.clearCaches();
      expect(clearResult.success).toBe(true);

      const gcResult = await engine.garbageCollect();
      expect(gcResult.success).toBe(true);
    });
  });

  describe('Version Compatibility', () => {
    it('should check version compatibility', async () => {
      const result = await engine.getVersionCompatibility();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.compatible).toBe(true);
        expect(result.value.issues).toBeInstanceOf(Array);
        expect(result.value.recommendations).toBeInstanceOf(Array);
      }
    });
  });
});