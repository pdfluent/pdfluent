// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Runtime Layer Exports
// ---------------------------------------------------------------------------

import { runtimeRegistry } from './RuntimeRegistry';
import { runtimeAdapterFactory } from './RuntimeAdapterFactory';

export * from './types';
export * from './RuntimeRegistry';
export * from './RuntimeAdapterFactory';

// Adapter exports
export * from './adapters/TauriRuntimeAdapter';
export * from './adapters/BrowserTestRuntimeAdapter';

// Singleton instances (re-exported for consumers)
export { runtimeRegistry, runtimeAdapterFactory };

/**
 * Initialize runtime layer
 */
export function initializeRuntimeLayer(): void {
  // Initialize adapter factory which registers default adapters
  runtimeAdapterFactory.initialize();

  console.log('Runtime layer initialized with adapters:',
    runtimeRegistry.getAvailableAdapters().map(a => ({
      runtime: a.runtime,
      available: a.isAvailable(),
      priority: a.priority
    }))
  );
}

/**
 * Get engine for current environment
 */
export async function getEngineForCurrentEnvironment(config?: Partial<import('../../core/engine/types').EngineConfig>): Promise<import('../../core/engine/PdfEngine').PdfEngine> {
  const adapter = runtimeAdapterFactory.getAdapterForCurrentEnvironment();
  if (!adapter) {
    throw new Error('No runtime adapter available for current environment');
  }
  return adapter.createEngine(config);
}