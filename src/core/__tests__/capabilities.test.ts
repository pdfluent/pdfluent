// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  TauriCapabilityRegistry,
  BrowserTestCapabilityRegistry,
  createCapabilityRegistry,
  supports,
  getLimits,
  canProcessFile,
  validateOperation,
} from '../capabilities';

describe('Capability Registry', () => {
  describe('TauriCapabilityRegistry', () => {
    it('should have correct runtime properties', () => {
      const registry = new TauriCapabilityRegistry();

      expect(registry.runtime).toBe('tauri');
      expect(registry.engine).toBe('xfa-sdk');
      expect(registry.engineVersion).toBe('1.0.0');
    });

    it('should support all PDF operations', () => {
      const registry = new TauriCapabilityRegistry();

      expect(registry.supportsOpening).toBe(true);
      expect(registry.supportsSaving).toBe(true);
      expect(registry.supportsRendering).toBe(true);
      expect(registry.supportsAnnotations).toBe(true);
      expect(registry.supportsForms).toBe(true);
      expect(registry.supportsSignatures).toBe(true);
    });

    it('should have appropriate limits', () => {
      const registry = new TauriCapabilityRegistry();

      expect(registry.maxFileSize).toBe(100 * 1024 * 1024); // 100MB
      expect(registry.maxPages).toBe(10000);
      expect(registry.maxRenderDpi).toBe(600);
    });

    it('should validate operations correctly', () => {
      const registry = new TauriCapabilityRegistry();

      expect(registry.canPerform('open')).toBe(true);
      expect(registry.canPerform('save')).toBe(true);
      expect(registry.canPerform('ocr')).toBe(true);
      expect(registry.canPerform('sign')).toBe(true);
    });

    it('should validate file processing', () => {
      const registry = new TauriCapabilityRegistry();

      // Valid file
      const validResult = registry.canProcessFile(10 * 1024 * 1024, 50);
      expect(validResult.success).toBe(true);

      // Too large file
      const largeResult = registry.canProcessFile(200 * 1024 * 1024, 50);
      expect(largeResult.success).toBe(false);

      // Too many pages
      const pagesResult = registry.canProcessFile(10 * 1024 * 1024, 20000);
      expect(pagesResult.success).toBe(false);
    });
  });

  describe('BrowserTestCapabilityRegistry', () => {
    it('should have correct runtime properties', () => {
      const registry = new BrowserTestCapabilityRegistry();

      expect(registry.runtime).toBe('browser-test');
      expect(registry.engine).toBe('browser-mock');
      expect(registry.engineVersion).toBe('0.1.0');
    });

    it('should have limited capabilities', () => {
      const registry = new BrowserTestCapabilityRegistry();

      expect(registry.supportsOpening).toBe(true);
      expect(registry.supportsSaving).toBe(false);
      expect(registry.supportsOCR).toBe(false);
      expect(registry.supportsSignatures).toBe(false);
      expect(registry.supportsForms).toBe(false);
    });

    it('should have tight limits', () => {
      const registry = new BrowserTestCapabilityRegistry();

      expect(registry.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
      expect(registry.maxPages).toBe(50);
      expect(registry.maxRenderDpi).toBe(150);
    });
  });

  describe('Factory Functions', () => {
    it('should create appropriate registry for runtime', () => {
      const tauriRegistry = createCapabilityRegistry('tauri');
      expect(tauriRegistry.runtime).toBe('tauri');

      const browserRegistry = createCapabilityRegistry('browser-test');
      expect(browserRegistry.runtime).toBe('browser-test');
    });
  });

  describe('Utility Functions', () => {
    it('supports() should check operation support', () => {
      // In browser-test environment (default for safety)
      expect(supports('open')).toBe(true);
      expect(supports('save')).toBe(false);
      expect(supports('ocr')).toBe(false);
    });

    it('getLimits() should return limit information', () => {
      const limits = getLimits('file-size');
      expect(limits.max).toBeGreaterThan(0);
      expect(limits.unit).toBe('bytes');
    });

    it('canProcessFile() should validate files', () => {
      expect(canProcessFile(5 * 1024 * 1024, 20)).toBe(true);
      expect(canProcessFile(20 * 1024 * 1024, 20)).toBe(false);
    });

    it('validateOperation() should return validation result', () => {
      const registry = new BrowserTestCapabilityRegistry();
      const result = validateOperation(registry, 'open');
      expect(result.success).toBe(true);

      const invalidResult = validateOperation(registry, 'save');
      expect(invalidResult.success).toBe(false);
    });
  });
});