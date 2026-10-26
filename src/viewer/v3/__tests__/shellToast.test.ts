// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-33: a line announced from inside the page reaches the shell's toast, and
// the shell stops listening when it unmounts.

import { describe, expect, it } from 'vitest';
import { installFakeWindow } from '../../hooks/__tests__/hookHarness';

const win = installFakeWindow();
// The harness window records listeners; dispatching goes through `fire`.
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  type: string;
  detail: unknown;
  constructor(type: string, init: { detail: unknown }) { this.type = type; this.detail = init.detail; }
};
(globalThis.window as unknown as { dispatchEvent: (e: { type: string }) => boolean }).dispatchEvent = (e) => {
  win.fire(e.type, e);
  return true;
};

import { SHELL_TOAST_EVENT, announceInShell, onShellToast } from '../shellToast';

describe('shell toast bus', () => {
  it('delivers an announced message to the listener', () => {
    const seen: string[] = [];
    const off = onShellToast(m => seen.push(m));
    announceInShell('Copied');
    expect(seen).toEqual(['Copied']);
    off();
  });

  it('ignores an empty or non-string payload', () => {
    const seen: string[] = [];
    const off = onShellToast(m => seen.push(m));
    win.fire(SHELL_TOAST_EVENT, { detail: '' });
    win.fire(SHELL_TOAST_EVENT, { detail: 42 });
    expect(seen).toEqual([]);
    off();
  });

  it('stops delivering after the unsubscribe', () => {
    const seen: string[] = [];
    const off = onShellToast(m => seen.push(m));
    off();
    announceInShell('late');
    expect(seen).toEqual([]);
    expect(win.listenerCount(SHELL_TOAST_EVENT)).toBe(0);
  });
});
