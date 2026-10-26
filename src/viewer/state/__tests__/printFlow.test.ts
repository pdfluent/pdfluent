// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-34: Print prints the PDF, not the webview. In the desktop app every entry
// point goes to the backend's print_document (which hands the current
// document to the system dialog; content is proven in
// src-tauri/tests/print_copy_is_the_current_document.rs) and never to
// window.print().

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

import { invoke } from '@tauri-apps/api/core';
import { printDocument, printCurrentDocument } from '../printFlow';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('printDocument in the desktop app', () => {
  it('asks the backend to print and does not print the webview', async () => {
    const webviewPrint = vi.fn();
    vi.stubGlobal('window', { print: webviewPrint });
    await printDocument();
    expect(invoke).toHaveBeenCalledWith('print_document', undefined);
    expect(webviewPrint).not.toHaveBeenCalled();
  });

  it('passes a backend refusal on to an awaiting caller', async () => {
    const backend = (() => Promise.reject(new Error('print-not-permitted: no'))) as never;
    await expect(printCurrentDocument(backend)).rejects.toThrow('print-not-permitted');
  });
});
