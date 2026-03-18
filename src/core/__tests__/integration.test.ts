// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  initializeCore,
  isTauriEnvironment,
  isBrowserTestEnvironment,
  features,
  getVersionInfo,
  detectRuntime,
  getCapabilityRegistry,
  supports,
  createEmptyDocument,
  validateDocument,
} from '../index';

describe('Core Integration', () => {
  describe('Runtime Detection', () => {
    it('detectRuntime should return valid runtime', () => {
      const runtime = detectRuntime();
      expect(runtime).toBe('browser-test'); // Default for safety
    });

    it('isTauriEnvironment should check runtime', () => {
      expect(isTauriEnvironment()).toBe(false); // In browser-test environment
    });

    it('isBrowserTestEnvironment should check runtime', () => {
      expect(isBrowserTestEnvironment()).toBe(true); // In browser-test environment
    });
  });

  describe('Core Initialization', () => {
    it('initializeCore should return runtime info', () => {
      const core = initializeCore();

      expect(core.runtime).toBe('browser-test');
      expect(core.isTauri).toBe(false);
      expect(core.isBrowserTest).toBe(true);
      expect(core.capabilities.runtime).toBe('browser-test');
    });
  });

  describe('Feature Flags', () => {
    it('features should reflect capability support', () => {
      // In browser-test environment
      expect(features.ocr).toBe(false);
      expect(features.annotations).toBe(true); // Mock annotations supported
      expect(features.forms).toBe(false);
      expect(features.signatures).toBe(false);
      expect(features.redaction).toBe(false);
      expect(features.pdfaValidation).toBe(false);
    });
  });

  describe('Version Information', () => {
    it('getVersionInfo should return version info', () => {
      const versionInfo = getVersionInfo();

      expect(versionInfo.core).toBe('0.1.0');
      expect(versionInfo.capabilities).toBe('0.1.0');
      expect(versionInfo.document).toBe('0.1.0');
    });
  });

  describe('Capability Integration', () => {
    it('supports should check operation support', () => {
      expect(supports('open')).toBe(true);
      expect(supports('save')).toBe(false);
      expect(supports('ocr')).toBe(false);
    });

    it('getCapabilityRegistry should return registry', () => {
      const registry = getCapabilityRegistry();
      expect(registry.runtime).toBe('browser-test');
      expect(registry.engine).toBe('browser-mock');
    });
  });

  describe('Document Model Integration', () => {
    it('createEmptyDocument should work with core', () => {
      const document = createEmptyDocument('test.pdf');
      const result = validateDocument(document);

      expect(result.success).toBe(true);
      expect(document.fileName).toBe('test.pdf');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle unsupported operations gracefully', () => {
      const registry = getCapabilityRegistry();

      // Check supported operation
      expect(registry.canPerform('open')).toBe(true);

      // Check unsupported operation
      expect(registry.canPerform('save')).toBe(false);
      expect(registry.canPerform('ocr')).toBe(false);
    });
  });
});