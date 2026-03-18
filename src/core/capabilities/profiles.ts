// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type {
  CapabilityRegistry,
  CapabilityError,
  CapabilityResult,
} from './registry';
import type {
  Runtime,
  Engine,
  OperationType,
  LimitType,
  LimitInfo,
} from '../types';

// ---------------------------------------------------------------------------
// Base Capability Registry Implementation
// ---------------------------------------------------------------------------

abstract class BaseCapabilityRegistry implements CapabilityRegistry {
  abstract readonly runtime: Runtime;
  abstract readonly engine: Engine;
  abstract readonly engineVersion: string;

  // Core PDF capabilities
  abstract readonly supportsOpening: boolean;
  abstract readonly supportsSaving: boolean;
  abstract readonly supportsRendering: boolean;
  abstract readonly maxRenderDpi: number;

  // Advanced PDF capabilities
  abstract readonly supportsAnnotations: boolean;
  abstract readonly supportsForms: boolean;
  abstract readonly supportsSignatures: boolean;
  abstract readonly supportsOCR: boolean;
  abstract readonly supportsRedaction: boolean;
  abstract readonly supportsPdfaValidation: boolean;

  // Document manipulation capabilities
  abstract readonly supportsMerge: boolean;
  abstract readonly supportsSplit: boolean;
  abstract readonly supportsRotation: boolean;
  abstract readonly supportsCompression: boolean;
  abstract readonly supportsWatermark: boolean;
  abstract readonly supportsEncryption: boolean;

  // Content intelligence capabilities
  abstract readonly supportsTextExtraction: boolean;
  abstract readonly supportsImageExtraction: boolean;
  abstract readonly supportsStructureAnalysis: boolean;

  // Performance limits
  abstract readonly maxFileSize: number;
  abstract readonly maxPages: number;
  abstract readonly supportsProgressiveRender: boolean;
  abstract readonly maxConcurrentOperations: number;

  // -------------------------------------------------------------------------
  // Operation Support Mapping
  // -------------------------------------------------------------------------

  private get operationSupport(): Record<OperationType, boolean> {
    return {
      'open': this.supportsOpening,
      'save': this.supportsSaving,
      'render': this.supportsRendering,
      'annotate': this.supportsAnnotations,
      'form-fill': this.supportsForms,
      'merge': this.supportsMerge,
      'split': this.supportsSplit,
      'rotate': this.supportsRotation,
      'compress': this.supportsCompression,
      'ocr': this.supportsOCR,
      'redact': this.supportsRedaction,
      'sign': this.supportsSignatures,
      'validate-pdfa': this.supportsPdfaValidation,
      'extract-text': this.supportsTextExtraction,
      'extract-images': this.supportsImageExtraction,
    };
  }

  // -------------------------------------------------------------------------
  // Limit Information Mapping
  // -------------------------------------------------------------------------

  private get limitInfo(): Record<LimitType, LimitInfo> {
    return {
      'file-size': {
        max: this.maxFileSize,
        recommended: Math.min(this.maxFileSize, 10 * 1024 * 1024), // 10MB recommended
        unit: 'bytes',
      },
      'page-count': {
        max: this.maxPages,
        recommended: Math.min(this.maxPages, 100), // 100 pages recommended
        unit: 'pages',
      },
      'concurrent-operations': {
        max: this.maxConcurrentOperations,
        recommended: 1, // Single operation for stability
        unit: 'operations',
      },
      'memory-usage': {
        max: this.maxFileSize * 5, // Rough estimate: 5x file size for processing
        recommended: this.maxFileSize * 2,
        unit: 'bytes',
      },
      'render-resolution': {
        max: this.maxRenderDpi,
        recommended: 150, // 150 DPI is good balance of quality/performance
        unit: 'dpi',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Public Interface Implementation
  // -------------------------------------------------------------------------

  canPerform(operation: OperationType): boolean {
    return this.operationSupport[operation];
  }

  getLimits(limitType: LimitType): LimitInfo {
    return this.limitInfo[limitType];
  }

  canProcessFile(fileSize: number, pageCount: number): CapabilityResult<void> {
    const errors: CapabilityError[] = [];

    // Check file size
    if (fileSize > this.maxFileSize) {
      errors.push({
        code: 'file-too-large',
        message: `File size (${formatBytes(fileSize)}) exceeds maximum (${formatBytes(this.maxFileSize)})`,
        details: { fileSize, limit: this.maxFileSize },
      });
    }

    // Check page count
    if (pageCount > this.maxPages) {
      errors.push({
        code: 'too-many-pages',
        message: `Document has ${pageCount} pages, maximum is ${this.maxPages}`,
        details: { pageCount, limit: this.maxPages },
      });
    }

    if (errors.length > 0 && errors[0]) {
      return {
        success: false,
        error: errors[0], // Return first error for simplicity
      };
    }

    return { success: true, value: undefined };
  }

  getSupportedOperations(): OperationType[] {
    return Object.entries(this.operationSupport)
      .filter(([_, supported]) => supported)
      .map(([operation]) => operation as OperationType);
  }

  getLimitationsDescription(): string {
    const limitations: string[] = [];

    if (!this.supportsOCR) limitations.push('No OCR support');
    if (!this.supportsSignatures) limitations.push('No digital signatures');
    if (!this.supportsRedaction) limitations.push('No redaction support');
    if (!this.supportsPdfaValidation) limitations.push('No PDF/A validation');

    if (this.maxFileSize < 100 * 1024 * 1024) {
      limitations.push(`Maximum file size: ${formatBytes(this.maxFileSize)}`);
    }

    if (this.maxPages < 1000) {
      limitations.push(`Maximum pages: ${this.maxPages}`);
    }

    return limitations.length > 0
      ? `Limitations: ${limitations.join(', ')}`
      : 'No significant limitations';
  }
}

// ---------------------------------------------------------------------------
// Tauri/XFA SDK Capability Profile
// ---------------------------------------------------------------------------

/**
 * Full-featured capability profile for Tauri runtime with XFA SDK engine.
 *
 * This profile represents the complete set of capabilities available
 * in the desktop application with the full XFA Rust SDK.
 */
export class TauriCapabilityRegistry extends BaseCapabilityRegistry {
  readonly runtime: Runtime = 'tauri';
  readonly engine: Engine = 'xfa-sdk';
  readonly engineVersion = '1.0.0'; // TODO: Get from SDK

  // Core PDF capabilities
  readonly supportsOpening = true;
  readonly supportsSaving = true;
  readonly supportsRendering = true;
  readonly maxRenderDpi = 600;

  // Advanced PDF capabilities
  readonly supportsAnnotations = true;
  readonly supportsForms = true;
  readonly supportsSignatures = true;
  readonly supportsOCR = true;
  readonly supportsRedaction = true;
  readonly supportsPdfaValidation = true;

  // Document manipulation capabilities
  readonly supportsMerge = true;
  readonly supportsSplit = true;
  readonly supportsRotation = true;
  readonly supportsCompression = true;
  readonly supportsWatermark = true;
  readonly supportsEncryption = true;

  // Content intelligence capabilities
  readonly supportsTextExtraction = true;
  readonly supportsImageExtraction = true;
  readonly supportsStructureAnalysis = true;

  // Performance limits
  readonly maxFileSize = 100 * 1024 * 1024; // 100MB
  readonly maxPages = 10000;
  readonly supportsProgressiveRender = true;
  readonly maxConcurrentOperations = 4;
}

// ---------------------------------------------------------------------------
// Browser Test/Mock Capability Profile
// ---------------------------------------------------------------------------

/**
 * Limited capability profile for browser-based testing environment.
 *
 * This profile provides minimal capabilities for testing UI components
 * without requiring the full XFA SDK or Tauri runtime.
 */
export class BrowserTestCapabilityRegistry extends BaseCapabilityRegistry {
  readonly runtime: Runtime = 'browser-test';
  readonly engine: Engine = 'browser-mock';
  readonly engineVersion = '0.1.0';

  // Core PDF capabilities (mocked for testing)
  readonly supportsOpening = true;
  readonly supportsSaving = false; // Browser can't save files
  readonly supportsRendering = true; // Mock rendering
  readonly maxRenderDpi = 150;

  // Advanced PDF capabilities (limited for testing)
  readonly supportsAnnotations = true; // Mock annotations
  readonly supportsForms = false; // No form support in mock
  readonly supportsSignatures = false;
  readonly supportsOCR = false;
  readonly supportsRedaction = false;
  readonly supportsPdfaValidation = false;

  // Document manipulation capabilities (limited)
  readonly supportsMerge = false;
  readonly supportsSplit = false;
  readonly supportsRotation = true; // Basic rotation supported
  readonly supportsCompression = false;
  readonly supportsWatermark = false;
  readonly supportsEncryption = false;

  // Content intelligence capabilities
  readonly supportsTextExtraction = true; // Mock extraction
  readonly supportsImageExtraction = true; // Mock extraction
  readonly supportsStructureAnalysis = false;

  // Performance limits (tight for testing)
  readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  readonly maxPages = 50;
  readonly supportsProgressiveRender = false;
  readonly maxConcurrentOperations = 1;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a capability registry for the specified runtime.
 *
 * @param runtime The runtime environment
 * @returns Appropriate capability registry instance
 */
export function createCapabilityRegistry(runtime: Runtime): CapabilityRegistry {
  switch (runtime) {
    case 'tauri':
      return new TauriCapabilityRegistry();
    case 'browser-test':
      return new BrowserTestCapabilityRegistry();
    default:
      // TypeScript should catch this, but we need a runtime fallback
      const exhaustiveCheck: never = runtime;
      throw new Error(`Unsupported runtime: ${exhaustiveCheck}`);
  }
}

/**
 * Create a capability registry for the current runtime (auto-detected).
 *
 * @returns Capability registry for current environment
 */
export function createCapabilityRegistryForCurrentRuntime(): CapabilityRegistry {
  // This would use actual runtime detection
  // For now, default to browser-test for safety
  const runtime: Runtime = 'browser-test';
  return createCapabilityRegistry(runtime);
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}