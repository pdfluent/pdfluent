// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-57: the overlay shows what the form's calculations set, also when edits
// follow each other faster than the backend answers. Calls the real
// useFormModel hook in node with the Tauri commands mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks } from './hookHarness';

const stateBoxes = vi.hoisted(() => [] as { current: unknown }[]);
vi.mock('react', async (orig) => {
  const react = reactForHooks(await orig<typeof import('react')>());
  return {
    ...react,
    useState: <V,>(v: V | (() => V)) => {
      const box = { current: typeof v === 'function' ? (v as () => V)() : v };
      stateBoxes.push(box);
      const set = (n: V | ((p: V) => V)) => {
        box.current = typeof n === 'function' ? (n as (p: V) => V)(box.current as V) : n;
      };
      return [box.current, set];
    },
  };
});

const invoke = vi.fn();
vi.mock('../../../lib/commandBridge', () => ({
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
}));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

import { useFormModel } from '../useFormModel';
import type { PdfDocument } from '../../../core/document';

interface Pending {
  request: { name: string; value?: string };
  resolve: (report: unknown) => void;
  reject: (err: unknown) => void;
}
let pending: Pending[] = [];

function textField(name: string) {
  return { name, value: '', readOnly: false, kind: { type: 'text' }, widgets: [] };
}

beforeEach(() => {
  stateBoxes.length = 0;
  pending = [];
  invoke.mockReset();
  invoke.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === 'get_form_model') return Promise.resolve(['qty', 'price', 'total'].map(textField));
    if (cmd === 'set_form_value') {
      const request = (args as { request: Pending['request'] }).request;
      return new Promise((resolve, reject) => pending.push({ request, resolve, reject }));
    }
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  });
});

const flush = () => new Promise(r => setTimeout(r, 0));
const shown = () => stateBoxes[1]!.current as Record<string, unknown>;

function useHarness() {
  const doc = { id: 'doc-1' } as unknown as PdfDocument;
  const h = useFormModel(doc, 1, vi.fn(), vi.fn(), vi.fn());
  return h;
}

/** The backend answers like a form with total = qty * price. */
function answerFor(qty: string, price: string): unknown {
  return { updated: [{ name: 'total', value: String(Number(qty || 0) * Number(price || 0)) }], failed: [] };
}

/** Answer the writes the app has sent, the last one first, until none is left. */
async function answerNewestFirst(table: Record<string, unknown>): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    await flush();
    const p = pending.pop();
    if (!p) return;
    p.resolve(table[String(p.request.value)]);
  }
}

describe('calculated fields in the overlay', () => {
  it('shows the total a calculation set after the edit', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText('qty', '3');
    await flush();
    pending.pop()!.resolve({ updated: [{ name: 'total', value: '12' }], failed: [] });
    await flush();
    expect(shown().total).toBe('12');
    expect(shown().qty).toBe('3');
  });

  it('two quick edits: the newer total is not overwritten by the older answer', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText('qty', '3'); // total = 3 * (nothing yet) = 0
    h.commitText('price', '4'); // total = 3 * 4 = 12
    await answerNewestFirst({ '3': answerFor('3', ''), '4': answerFor('3', '4') });
    expect(shown().total).toBe('12');
  });

  it('writes reach the backend in the order they were made, one at a time', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText('qty', '3');
    h.commitText('price', '4');
    await flush();
    expect(pending.map(p => p.request.name)).toEqual(['qty']);
    pending.pop()!.resolve(answerFor('3', ''));
    await flush();
    expect(pending.map(p => p.request.name)).toEqual(['price']);
  });

  it('a failed write does not stall the ones behind it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText('qty', '3');
    h.commitText('price', '4');
    await flush();
    pending.pop()!.reject(new Error('read-only'));
    await flush();
    pending.pop()!.resolve(answerFor('3', '4'));
    await flush();
    expect(shown().total).toBe('12');
    errors.mockRestore();
  });

  it('a calculation does not take the text away from a field being typed into', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText('qty', '3');
    await flush();
    h.setTextLocal('total', '99'); // the person starts typing in the calculated field
    pending.pop()!.resolve({ updated: [{ name: 'total', value: '12' }], failed: [] });
    await flush();
    expect(shown().total).toBe('99');
  });
});
