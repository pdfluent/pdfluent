// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A line in the shell's toast, from code that renders inside the page and has
 * no handle on the shell: the selection toolbar's Copy said nothing, so a
 * person could not tell a copy that worked from a button that did nothing
 * (J-33). One window event, one listener in the shell.
 */

export const SHELL_TOAST_EVENT = 'pdfluent:shell-toast';

export function announceInShell(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(SHELL_TOAST_EVENT, { detail: message }));
}

/** Listen for announcements; returns the unsubscribe. */
export function onShellToast(handler: (message: string) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail === 'string' && detail) handler(detail);
  };
  window.addEventListener(SHELL_TOAST_EVENT, listener);
  return () => { window.removeEventListener(SHELL_TOAST_EVENT, listener); };
}
