// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type {
  RuntimeCapabilities,
  RuntimeOperationCapability,
} from './types';

const SUPPORTED: RuntimeOperationCapability = { status: 'supported' };
const UNSUPPORTED: RuntimeOperationCapability = { status: 'unsupported' };

export function getRuntimeOperationCapability(
  capabilities: RuntimeCapabilities,
  operation: string,
): RuntimeOperationCapability {
  const explicit = capabilities.operationDetails?.[operation];
  if (explicit) return explicit;
  return capabilities.supportedOperations.includes(operation) ? SUPPORTED : UNSUPPORTED;
}

export function getRuntimeOperationStatus(
  capabilities: RuntimeCapabilities,
  operation: string,
): RuntimeOperationCapability['status'] {
  return getRuntimeOperationCapability(capabilities, operation).status;
}

export function isRuntimeOperationSupported(
  capabilities: RuntimeCapabilities,
  operation: string,
): boolean {
  return getRuntimeOperationStatus(capabilities, operation) === 'supported';
}

export function isRuntimeOperationApiAvailable(
  capabilities: RuntimeCapabilities,
  operation: string,
): boolean {
  const status = getRuntimeOperationStatus(capabilities, operation);
  return status === 'supported' ||
    status === 'degraded' ||
    status === 'apiAvailableButNotWired' ||
    status === 'apiAvailableButRuntimeMissing';
}
