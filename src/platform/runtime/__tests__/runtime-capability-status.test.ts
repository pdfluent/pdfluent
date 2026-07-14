// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { BrowserTestRuntimeAdapter } from '../adapters/BrowserTestRuntimeAdapter';
import { TauriRuntimeAdapter } from '../adapters/TauriRuntimeAdapter';
import {
  getRuntimeOperationStatus,
  isRuntimeOperationApiAvailable,
  isRuntimeOperationSupported,
} from '../capabilityStatus';

describe('runtime capability status', () => {
  it('reports native Tauri PDF operations as supported', () => {
    const capabilities = new TauriRuntimeAdapter().getCapabilities();

    for (const operation of [
      'open',
      'save',
      'filesystem-save',
      'pdf-export',
      'render',
      'render-thumbnail',
      'extract-text',
      'extract-text-positions',
      'search-text',
      'annotate',
      'form-fill',
      'merge',
      'split',
      'rotate',
      'compress',
      'redact',
      'validate-pdfa',
      'convert-pdfa',
      'verify-signatures',
      'office-export',
      'ocr',
    ]) {
      expect(getRuntimeOperationStatus(capabilities, operation)).toBe('supported');
      expect(isRuntimeOperationSupported(capabilities, operation)).toBe(true);
    }
  });

  it('keeps browser-test explicitly degraded or unsupported', () => {
    const capabilities = new BrowserTestRuntimeAdapter().getCapabilities();

    expect(getRuntimeOperationStatus(capabilities, 'open')).toBe('degraded');
    expect(getRuntimeOperationStatus(capabilities, 'render')).toBe('degraded');
    expect(getRuntimeOperationStatus(capabilities, 'extract-text')).toBe('degraded');
    expect(getRuntimeOperationStatus(capabilities, 'ocr')).toBe('unsupported');
    expect(getRuntimeOperationStatus(capabilities, 'redact')).toBe('unsupported');
    expect(getRuntimeOperationStatus(capabilities, 'office-export')).toBe('unsupported');
  });

  it('uses capability status for routing decisions', () => {
    const nativeCapabilities = new TauriRuntimeAdapter().getCapabilities();
    const browserCapabilities = new BrowserTestRuntimeAdapter().getCapabilities();

    expect(isRuntimeOperationApiAvailable(nativeCapabilities, 'render')).toBe(true);
    expect(isRuntimeOperationSupported(nativeCapabilities, 'render')).toBe(true);
    expect(isRuntimeOperationApiAvailable(browserCapabilities, 'render')).toBe(true);
    expect(isRuntimeOperationSupported(browserCapabilities, 'render')).toBe(false);
    expect(isRuntimeOperationApiAvailable(browserCapabilities, 'ocr')).toBe(false);
  });
});
