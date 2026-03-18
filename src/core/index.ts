// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export type {
  Runtime,
  Engine,
  OperationType,
  LimitType,
  LimitInfo,
  Point,
  Size,
  Rect,
  Rotation,
  ErrorCode,
  PdfError,
  Result,
  AsyncResult,
} from './types';

export {
  isSuccess,
  isFailure,
  detectRuntime,
} from './types';

// Import types and functions for internal use
import type { Runtime } from './types';
import type { CapabilityRegistry } from './capabilities';
import { detectRuntime } from './types';

// ---------------------------------------------------------------------------
// Capabilities Module
// ---------------------------------------------------------------------------

export type {
  CapabilityRegistry,
  CapabilityError,
  CapabilityResult,
} from './capabilities';

export {
  TauriCapabilityRegistry,
  BrowserTestCapabilityRegistry,
  createCapabilityRegistry,
} from './capabilities';

// Import capability functions
import {
  getCapabilityRegistry as getRegistry,
  supports as checkSupports,
  getLimits as getLimitInfo,
  canProcessFile as checkCanProcessFile,
  getCapabilitiesDescription as getCapDescription,
  validateOperation as validateOp,
  guardOperation as guardOp,
  generateCapabilityReport as generateReport
} from './capabilities';

// Re-export with original names
export const getCapabilityRegistry = getRegistry;
export const supports = checkSupports;
export const getLimits = getLimitInfo;
export const canProcessFile = checkCanProcessFile;
export const getCapabilitiesDescription = getCapDescription;
export const validateOperation = validateOp;
export const guardOperation = guardOp;
export const generateCapabilityReport = generateReport;

// ---------------------------------------------------------------------------
// Document Module
// ---------------------------------------------------------------------------

export type {
  PdfDocument,
  Page,
  Annotation,
  FormField,
  DocumentMetadata,
  DocumentState,
  ValidationError,
  ValidationResult,
} from './document';

export {
  createEmptyDocument,
  updateMetadata,
  updatePage,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  updateFormField,
  updateDocumentState,
  createDefaultMetadata,
  validateDocument,
  getPageCount,
  getCurrentPage,
  getAnnotationsForPage,
  getFormFieldsForPage,
  getDisplayTitle,
  createSnapshot,
} from './document';

// ---------------------------------------------------------------------------
// Runtime Detection & Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the core module for the current runtime.
 *
 * This should be called early in the application lifecycle.
 *
 * @returns Object with runtime information and initialized modules
 */
export function initializeCore(): {
  runtime: Runtime;
  capabilities: CapabilityRegistry;
  isTauri: boolean;
  isBrowserTest: boolean;
} {
  const runtime = detectRuntime();
  const capabilities = getCapabilityRegistry();

  return {
    runtime,
    capabilities,
    isTauri: runtime === 'tauri',
    isBrowserTest: runtime === 'browser-test',
  };
}

/**
 * Check if the application is running in Tauri desktop environment.
 *
 * @returns true if running in Tauri, false otherwise
 */
export function isTauriEnvironment(): boolean {
  return detectRuntime() === 'tauri';
}

/**
 * Check if the application is running in browser test environment.
 *
 * @returns true if running in browser test, false otherwise
 */
export function isBrowserTestEnvironment(): boolean {
  return detectRuntime() === 'browser-test';
}

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

/**
 * Feature flags for enabling/disabling features based on capabilities.
 */
export const features = {
  /**
   * Whether OCR features should be enabled.
   */
  get ocr(): boolean {
    return checkSupports('ocr');
  },

  /**
   * Whether annotation features should be enabled.
   */
  get annotations(): boolean {
    return checkSupports('annotate');
  },

  /**
   * Whether form filling features should be enabled.
   */
  get forms(): boolean {
    return checkSupports('form-fill');
  },

  /**
   * Whether digital signature features should be enabled.
   */
  get signatures(): boolean {
    return checkSupports('sign');
  },

  /**
   * Whether redaction features should be enabled.
   */
  get redaction(): boolean {
    return checkSupports('redact');
  },

  /**
   * Whether PDF/A validation features should be enabled.
   */
  get pdfaValidation(): boolean {
    return checkSupports('validate-pdfa');
  },

  /**
   * Whether document manipulation features (merge, split, rotate) should be enabled.
   */
  get documentManipulation(): boolean {
    return checkSupports('merge') && checkSupports('split') && checkSupports('rotate');
  },

  /**
   * Whether text extraction features should be enabled.
   */
  get textExtraction(): boolean {
    return checkSupports('extract-text');
  },

  /**
   * Whether image extraction features should be enabled.
   */
  get imageExtraction(): boolean {
    return checkSupports('extract-images');
  },
};

// ---------------------------------------------------------------------------
// Version Information
// ---------------------------------------------------------------------------

/**
 * Core module version.
 */
export const VERSION = '0.1.0';

/**
 * Get version information for all core modules.
 *
 * @returns Object with version information
 */
export function getVersionInfo(): {
  core: string;
  capabilities: string;
  document: string;
} {
  const capabilities = getRegistry();

  return {
    core: VERSION,
    capabilities: capabilities.engineVersion,
    document: '0.1.0',
  };
}