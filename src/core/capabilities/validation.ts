// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { CapabilityRegistry, CapabilityResult } from './registry';
import type { OperationType } from '../types';

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validate that an operation is supported by the current runtime.
 *
 * @param registry Capability registry to check against
 * @param operation Operation to validate
 * @returns Success result if supported, error result if not
 */
export function validateOperation(
  registry: CapabilityRegistry,
  operation: OperationType
): CapabilityResult<void> {
  if (!registry.canPerform(operation)) {
    return {
      success: false,
      error: {
        code: 'unsupported-operation',
        message: `Operation "${operation}" is not supported in ${registry.runtime} runtime`,
        details: { operation },
      },
    };
  }

  return { success: true, value: undefined };
}

/**
 * Validate that a file can be processed based on size and page count.
 *
 * @param registry Capability registry to check against
 * @param fileSize Size of the file in bytes
 * @param pageCount Number of pages in the document
 * @returns Success result if file can be processed, error result if not
 */
export function validateFile(
  registry: CapabilityRegistry,
  fileSize: number,
  pageCount: number
): CapabilityResult<void> {
  return registry.canProcessFile(fileSize, pageCount);
}

/**
 * Validate multiple operations at once.
 *
 * @param registry Capability registry to check against
 * @param operations Array of operations to validate
 * @returns Array of validation results for each operation
 */
export function validateOperations(
  registry: CapabilityRegistry,
  operations: OperationType[]
): CapabilityResult<void>[] {
  return operations.map(operation => validateOperation(registry, operation));
}

/**
 * Check if all operations in a list are supported.
 *
 * @param registry Capability registry to check against
 * @param operations Array of operations to check
 * @returns true if all operations are supported, false otherwise
 */
export function areAllOperationsSupported(
  registry: CapabilityRegistry,
  operations: OperationType[]
): boolean {
  return operations.every(operation => registry.canPerform(operation));
}

/**
 * Get the first unsupported operation from a list.
 *
 * @param registry Capability registry to check against
 * @param operations Array of operations to check
 * @returns First unsupported operation, or undefined if all are supported
 */
export function getFirstUnsupportedOperation(
  registry: CapabilityRegistry,
  operations: OperationType[]
): OperationType | undefined {
  return operations.find(operation => !registry.canPerform(operation));
}

// ---------------------------------------------------------------------------
// Guard Functions (throw errors)
// ---------------------------------------------------------------------------

/**
 * Guard that throws an error if an operation is not supported.
 *
 * @param registry Capability registry to check against
 * @param operation Operation to validate
 * @throws Error if operation is not supported
 */
export function guardOperation(
  registry: CapabilityRegistry,
  operation: OperationType
): void {
  const result = validateOperation(registry, operation);
  if (!result.success) {
    throw new Error(result.error.message);
  }
}

/**
 * Guard that throws an error if a file cannot be processed.
 *
 * @param registry Capability registry to check against
 * @param fileSize Size of the file in bytes
 * @param pageCount Number of pages in the document
 * @throws Error if file cannot be processed
 */
export function guardFile(
  registry: CapabilityRegistry,
  fileSize: number,
  pageCount: number
): void {
  const result = validateFile(registry, fileSize, pageCount);
  if (!result.success) {
    throw new Error(result.error.message);
  }
}

// ---------------------------------------------------------------------------
// Runtime Feature Detection
// ---------------------------------------------------------------------------

/**
 * Create a feature detector for a specific operation.
 *
 * @param registry Capability registry to use
 * @param operation Operation to detect
 * @returns Function that returns true if operation is supported
 */
export function createFeatureDetector(
  registry: CapabilityRegistry,
  operation: OperationType
): () => boolean {
  return () => registry.canPerform(operation);
}

/**
 * Create a conditional executor that only runs if an operation is supported.
 *
 * @param registry Capability registry to use
 * @param operation Operation to check
 * @param executor Function to execute if operation is supported
 * @returns Function that executes the operation or returns a fallback
 */
export function createConditionalExecutor<T>(
  registry: CapabilityRegistry,
  operation: OperationType,
  executor: () => T
): () => T | undefined {
  return () => {
    if (registry.canPerform(operation)) {
      return executor();
    }
    return undefined;
  };
}

// ---------------------------------------------------------------------------
// Capability Reporting
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable report of capabilities.
 *
 * @param registry Capability registry to report on
 * @returns Object with capability information
 */
export function generateCapabilityReport(registry: CapabilityRegistry): {
  runtime: string;
  engine: string;
  version: string;
  supportedOperations: string[];
  limitations: string[];
  fileLimits: {
    maxSize: string;
    maxPages: number;
  };
} {
  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  };

  return {
    runtime: registry.runtime,
    engine: registry.engine,
    version: registry.engineVersion,
    supportedOperations: registry.getSupportedOperations(),
    limitations: registry.getLimitationsDescription().replace('Limitations: ', '').split(', '),
    fileLimits: {
      maxSize: formatBytes(registry.maxFileSize),
      maxPages: registry.maxPages,
    },
  };
}

/**
 * Check if two capability registries are compatible (can handle the same operations).
 *
 * @param registry1 First capability registry
 * @param registry2 Second capability registry
 * @returns true if registries have compatible capabilities
 */
export function areCapabilitiesCompatible(
  registry1: CapabilityRegistry,
  registry2: CapabilityRegistry
): boolean {
  // For basic compatibility, check that registry2 supports all operations
  // that registry1 claims to support
  const registry1Operations = registry1.getSupportedOperations();
  return areAllOperationsSupported(registry2, registry1Operations);
}