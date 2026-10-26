// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Print (J-34).
//
// Every Print entry point — menu, ⌘P, toolbar, command palette — comes here.
// Until 1.0.1 they called `window.print()`, which prints the webview: the
// toolbar and the canvas, not the PDF. In the desktop app the backend
// (`print_document`) hands the document as it is now, unsaved changes
// included, to the system print dialog. A browser build has no backend and
// keeps the browser's own print.
// ---------------------------------------------------------------------------

import { isTauriRuntime } from '../../lib/tauri-detection';
import type { InvokeFn } from './saveFlow';

/** Ask the backend to print; rejects with its error. */
export async function printCurrentDocument(invoke: InvokeFn): Promise<void> {
  await invoke<void>('print_document');
}

/**
 * Fire-and-forget form for UI handlers. A failure is already on screen
 * (invokeCommand reports it); it is kept away from the crash reporter here.
 */
export async function printDocument(): Promise<void> {
  if (!isTauriRuntime()) {
    window.print();
    return;
  }
  try {
    const { invokeCommand } = await import('../../lib/commandBridge');
    await printCurrentDocument(invokeCommand);
  } catch (error) {
    console.warn('print_document failed (already reported)', error);
  }
}
