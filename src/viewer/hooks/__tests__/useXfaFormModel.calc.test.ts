// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// J-59: the XFA overlay shows the total the form's script recalculated, also
// when commits follow each other faster than the backend answers. Calls the
// real useXfaFormModel hook in node with the Tauri commands mocked.

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

const xfaFormModel = vi.fn();
const commitXfaFieldValue = vi.fn();
vi.mock('../../../lib/tauri-api', () => ({
  xfaFormModel: () => xfaFormModel(),
  commitXfaFieldValue: (request: unknown) => commitXfaFieldValue(request),
}));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

import { useXfaFormModel } from '../useXfaFormModel';
import type { PdfDocument } from '../../../core/document';

const QTY = 'order.qty';
const TOTAL = 'order.total';

function field(name: string, value: string) {
  return {
    name, somPath: name, fieldType: 'text', value, readOnly: false, required: false,
    multiline: false, hidden: false, options: [], onValue: null, offValue: null,
    page: 0, rect: { x: 0, y: 0, width: 100, height: 20 }, widgets: [],
    boundToData: true, bindNone: false,
  };
}

/** The form as the backend holds it after a commit: total = 5 * quantity. */
function model(qty: string) {
  return {
    pageCount: 1, unsupportedScripts: 0, scriptErrors: [],
    fields: [field(QTY, qty), field(TOTAL, String(5 * Number(qty)))],
  };
}

function commitResult(qty: string) {
  return {
    rawValue: qty, persistedToDatasets: true, interactive: true, scriptsExecuted: 1,
    pageCountBefore: 1, pageCountAfter: 1, presenceChanges: [], model: model(qty),
  };
}

interface Pending { qty: string; resolve: (r: unknown) => void }
let pending: Pending[] = [];

beforeEach(() => {
  stateBoxes.length = 0;
  pending = [];
  xfaFormModel.mockReset();
  commitXfaFieldValue.mockReset();
  xfaFormModel.mockResolvedValue(model('1'));
  commitXfaFieldValue.mockImplementation((request: { value: string }) =>
    new Promise(resolve => pending.push({ qty: request.value, resolve })));
});

const flush = () => new Promise(r => setTimeout(r, 0));
// useXfaFormModel's states, in order: model, page count, values, reload nonce.
const shown = () => stateBoxes[2]!.current as Record<string, unknown>;

function useHarness() {
  const doc = { id: 'xfa-1', xfaDetected: true, pages: [{}] } as unknown as PdfDocument;
  const h = useXfaFormModel(doc, vi.fn(), vi.fn(), vi.fn(), vi.fn());
  return h;
}

describe('the XFA overlay after a commit', () => {
  it('shows the total the script recalculated', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    expect(shown()[TOTAL]).toBe('5');
    h.commitText(QTY, '4');
    await flush();
    pending.pop()!.resolve(commitResult('4'));
    await flush();
    expect(shown()[TOTAL]).toBe('20');
    expect(shown()[QTY]).toBe('4');
  });

  it('two quick commits: the older answer does not overwrite the newer one', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText(QTY, '2');
    h.commitText(QTY, '4');
    for (let guard = 0; guard < 20; guard++) {
      await flush();
      const p = pending.pop(); // newest first
      if (!p) break;
      p.resolve(commitResult(p.qty));
    }
    expect(shown()[QTY]).toBe('4');
    expect(shown()[TOTAL]).toBe('20');
  });

  it('keeps what the person has typed into another field since the last commit', async () => {
    const h = useHarness();
    await flush(); // the first model read is answered before anyone types
    h.commitText(QTY, '4');
    await flush();
    h.setTextLocal(TOTAL, 'typing');
    pending.pop()!.resolve(commitResult('4'));
    await flush();
    expect(shown()[TOTAL]).toBe('typing');
    expect(shown()[QTY]).toBe('4');
  });
});
