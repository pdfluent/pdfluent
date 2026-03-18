// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Core Registry
// ---------------------------------------------------------------------------

import type {
  OperationType,
  LimitType,
  LimitInfo,
} from '../types';
import type { CapabilityRegistry } from './registry';

export type {
  CapabilityRegistry,
  CapabilityError,
  CapabilityResult,
} from './registry';

export type { OperationType, LimitType, LimitInfo };

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

import {
  TauriCapabilityRegistry,
  BrowserTestCapabilityRegistry,
  createCapabilityRegistry,
  createCapabilityRegistryForCurrentRuntime,
} from './profiles';

export {
  TauriCapabilityRegistry,
  BrowserTestCapabilityRegistry,
  createCapabilityRegistry,
  createCapabilityRegistryForCurrentRuntime,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export {
  validateOperation,
  validateFile,
  validateOperations,
  areAllOperationsSupported,
  getFirstUnsupportedOperation,
  guardOperation,
  guardFile,
  createFeatureDetector,
  createConditionalExecutor,
  generateCapabilityReport,
  areCapabilitiesCompatible,
} from './validation';

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Get a capability registry for the current runtime (auto-detected).
 *
 * This is the primary entry point for most components.
 */
export function getCapabilityRegistry(): CapabilityRegistry {
  return createCapabilityRegistryForCurrentRuntime();
}

/**
 * Check if the current runtime supports a specific operation.
 *
 * @param operation Operation to check
 * @returns true if supported, false otherwise
 */
export function supports(operation: OperationType): boolean {
  const registry = getCapabilityRegistry();
  return registry.canPerform(operation);
}

/**
 * Get limits for a specific resource type.
 *
 * @param limitType Type of limit to query
 * @returns Detailed limit information
 */
export function getLimits(limitType: LimitType): LimitInfo {
  const registry = getCapabilityRegistry();
  return registry.getLimits(limitType);
}

/**
 * Check if a file can be processed based on size and page count.
 *
 * @param fileSize Size in bytes
 * @param pageCount Number of pages
 * @returns true if file can be processed, false otherwise
 */
export function canProcessFile(fileSize: number, pageCount: number): boolean {
  const registry = getCapabilityRegistry();
  const result = registry.canProcessFile(fileSize, pageCount);
  return result.success;
}

/**
 * Get a human-readable description of current capabilities and limitations.
 *
 * @returns Description string
 */
export function getCapabilitiesDescription(): string {
  const registry = getCapabilityRegistry();
  return `Runtime: ${registry.runtime}, Engine: ${registry.engine} ${registry.engineVersion}. ${registry.getLimitationsDescription()}`;
}