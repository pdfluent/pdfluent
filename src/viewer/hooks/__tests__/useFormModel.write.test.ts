// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-56: the form overlay in the active shell fills every field type through
// `set_form_value` (the SDK writeback with /AS and /AP), never the legacy
// raw-/V `set_form_field_value`. Calls the real useFormModel hook in node.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks } from './hookHarness';

// The harness' useState hands back a snapshot, so keep each state box to read
// what a setter wrote.
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

beforeEach(() => {
  stateBoxes.length = 0;
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_form_model') return [];
    if (cmd === 'set_form_value') return undefined;
    throw new Error(`unexpected command ${cmd}`);
  });
});

function useHarness(markDirty = vi.fn(), pushUndo = vi.fn()) {
  const doc = { id: 'doc-1' } as unknown as PdfDocument;
  return { h: useFormModel(doc, 1, markDirty, vi.fn(), pushUndo), markDirty, pushUndo };
}

function writes(): unknown[] {
  return invoke.mock.calls.filter(([cmd]) => cmd !== 'get_form_model').map(([cmd, args]) => ({ cmd, args }));
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('useFormModel commits every field type with set_form_value', () => {
  it('text, checkbox, radio, combo, list and multi-select each send their typed request', async () => {
    const { h, markDirty, pushUndo } = useHarness();
    h.commitText('name', 'Jane Doe');
    h.commitCheckbox('agree', true);
    h.commitRadio('color', 'blue');
    h.commitChoice('country', 'Belgium');
    h.commitChoice('size', 'Medium');
    h.commitMultiChoice('toppings', ['Cheese', 'Olives']);
    await flush();
    expect(writes()).toEqual([
      { cmd: 'set_form_value', args: { request: { kind: 'text', name: 'name', value: 'Jane Doe' } } },
      { cmd: 'set_form_value', args: { request: { kind: 'checkbox', name: 'agree', checked: true } } },
      { cmd: 'set_form_value', args: { request: { kind: 'radio', name: 'color', export: 'blue' } } },
      { cmd: 'set_form_value', args: { request: { kind: 'choice', name: 'country', value: 'Belgium' } } },
      { cmd: 'set_form_value', args: { request: { kind: 'choice', name: 'size', value: 'Medium' } } },
      { cmd: 'set_form_value', args: { request: { kind: 'multiChoice', name: 'toppings', values: ['Cheese', 'Olives'] } } },
    ]);
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'set_form_field_value')).toBe(false);
    expect(markDirty).toHaveBeenCalledTimes(6);
    expect(pushUndo).toHaveBeenCalledTimes(6);
  });

  it('a refused write does not mark the document dirty', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_form_model') return [];
      throw new Error('read-only field');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { h, markDirty } = useHarness();
    h.commitText('name', 'x');
    await flush();
    expect(markDirty).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('shows the fields a calculation set and reports the ones that failed', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_form_model') return [];
      if (cmd === 'set_form_value') {
        return {
          updated: [{ name: 'total', value: '12' }],
          failed: [{ name: 'tax', message: 'no field named rate' }],
        };
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { h } = useHarness();
    h.commitText('price', '4');
    await flush();
    // useFormModel's states, in order: model, values, reload nonce.
    expect((stateBoxes[1]!.current as Record<string, unknown>).total).toBe('12');
    expect(errors).toHaveBeenCalledWith('[PDFluent] form calculation failed for tax', 'no field named rate');
    errors.mockRestore();
  });
});
