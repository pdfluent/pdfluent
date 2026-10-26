// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-59: filling an XFA form in the editor. Calls the real useXfaFormModel hook
// in node with the Tauri commands mocked: a typed value goes to the commit loop,
// what the form refuses is said with the field's name, and a form with scripts
// the build cannot run says so once.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));

const xfaFormModel = vi.fn();
const commitXfaFieldValue = vi.fn();
vi.mock('../../../lib/tauri-api', () => ({
  xfaFormModel: () => xfaFormModel(),
  commitXfaFieldValue: (request: unknown) => commitXfaFieldValue(request),
}));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

import { useXfaFormModel } from '../useXfaFormModel';
import { subscribeCommandFailures } from '../../../lib/commandBridge';
import type { AppError } from '../../state/errorCenter';
import type { PdfDocument } from '../../../core/document';

const QUANTITY = 'order.lines.quantity';

function field(name: string, value: string, readOnly = false) {
  return {
    name, somPath: name, fieldType: 'text', value, readOnly, required: false,
    multiline: false, hidden: false, options: [], onValue: null, offValue: null,
    page: 0, rect: { x: 0, y: 0, width: 100, height: 20 }, widgets: [],
    boundToData: true, bindNone: false,
  };
}

function model(unsupportedScripts = 0, quantity = '1', scriptErrors: unknown[] = []) {
  return {
    pageCount: 1,
    unsupportedScripts,
    scriptErrors,
    fields: [field(QUANTITY, quantity), field('order.lines.internal_ref', 'REF-001', true)],
  };
}

function commitResult(over: Record<string, unknown> = {}) {
  return {
    rawValue: '4', persistedToDatasets: true, interactive: true, scriptsExecuted: 2,
    pageCountBefore: 1, pageCountAfter: 1, presenceChanges: [], model: model(0, '4'),
    ...over,
  };
}

beforeEach(() => {
  xfaFormModel.mockReset();
  commitXfaFieldValue.mockReset();
  xfaFormModel.mockResolvedValue(model());
});

function useHarness() {
  const markDirty = vi.fn();
  const pushUndo = vi.fn();
  const requestRepaint = vi.fn();
  const doc = { id: 'xfa-1', xfaDetected: true, pages: [{}] } as unknown as PdfDocument;
  const h = useXfaFormModel(doc, markDirty, vi.fn(), pushUndo, requestRepaint);
  return { h, markDirty, pushUndo, requestRepaint };
}

function published(): { seen: AppError[]; stop: () => void } {
  const seen: AppError[] = [];
  const stop = subscribeCommandFailures(e => { seen.push(e); });
  return { seen, stop };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('useXfaFormModel commits through the XFA commit loop', () => {
  it('sends the typed value, marks the document dirty and repaints the pages', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult());
    const { h, markDirty, requestRepaint, pushUndo } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    expect(commitXfaFieldValue).toHaveBeenCalledWith({ kind: 'text', name: QUANTITY, value: '4' });
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(requestRepaint).toHaveBeenCalledTimes(1);
    expect(pushUndo).toHaveBeenCalledTimes(1);
  });

  it('sends checkboxes and radio groups as their own request kinds', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult());
    const { h } = useHarness();
    h.commitCheckbox('agree', true);
    h.commitRadio('kind', '3');
    await flush();
    expect(commitXfaFieldValue.mock.calls.map(c => c[0])).toEqual([
      { kind: 'checkbox', name: 'agree', checked: true },
      { kind: 'radio', name: 'kind', export: '3' },
    ]);
  });
});

describe('a value the form refuses', () => {
  it('is reported with the field name, does not dirty the document, and the overlay is re-read', async () => {
    commitXfaFieldValue.mockRejectedValue('XFA_FIELD_READ_ONLY: order.lines.internal_ref');
    const { seen, stop } = published();
    const { h, markDirty, requestRepaint } = useHarness();
    await flush();
    const modelReads = xfaFormModel.mock.calls.length;
    h.commitText('order.lines.internal_ref', 'tampered');
    await flush();
    stop();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('XFA_FIELD_READ_ONLY');
    expect(seen[0]!.severity).toBe('error');
    expect(seen[0]!.message).toContain('order.lines.internal_ref');
    expect(markDirty).not.toHaveBeenCalled();
    expect(requestRepaint).not.toHaveBeenCalled();
    // The refused value is taken out of the overlay by reading the form again.
    expect(xfaFormModel.mock.calls.length).toBe(modelReads + 1);
  });
});

describe('scripts that failed', () => {
  it('names the field and the kind once per document', async () => {
    const errors = [{ scriptId: 'broken_hook:change#0', kind: 'threw' }];
    commitXfaFieldValue.mockResolvedValue(commitResult({ model: model(0, '4', errors) }));
    const { seen, stop } = published();
    const { h } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    h.commitText(QUANTITY, '5');
    await flush();
    stop();
    const notices = seen.filter(e => e.code === 'XFA_SCRIPTS_FAILED');
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain('broken_hook (hit an error)');
  });

  it('says nothing when every script completed', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult());
    const { seen, stop } = published();
    const { h } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    stop();
    expect(seen.filter(e => e.code === 'XFA_SCRIPTS_FAILED')).toEqual([]);
  });
});

describe('scripts this build cannot run', () => {
  it('a form with FormCalc says so once, however many values go in', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult({ model: model(2, '4') }));
    const { seen, stop } = published();
    const { h } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    h.commitText(QUANTITY, '5');
    await flush();
    stop();
    const notices = seen.filter(e => e.code === 'XFA_SCRIPTS_NOT_RUN');
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain('2');
  });

  it('a form without FormCalc stays quiet', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult());
    const { seen, stop } = published();
    const { h } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    stop();
    expect(seen).toEqual([]);
  });

  it('a build without the commit loop says the value was written statically, once', async () => {
    commitXfaFieldValue.mockResolvedValue(commitResult({ interactive: false, scriptsExecuted: 0 }));
    const { seen, stop } = published();
    const { h } = useHarness();
    h.commitText(QUANTITY, '4');
    await flush();
    h.commitText(QUANTITY, '5');
    await flush();
    stop();
    expect(seen.filter(e => e.code === 'XFA_PHASE1_STATIC_WRITE')).toHaveLength(1);
  });
});
