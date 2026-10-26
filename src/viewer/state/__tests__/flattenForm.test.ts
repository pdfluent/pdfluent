// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-58: the forms card's Flatten control (`flatten-form-btn`) asks the backend
// to flatten the form and hands the views the new document; a refusal reaches
// the user. The backend half is src-tauri/tests/acroform_every_field_type.rs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../../lib/commandBridge', () => ({
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import { runFlattenForm } from '../flattenForm';

const info = { page_count: 1, pages: [], title: null, author: null, form_type: 'none' };

beforeEach(() => {
  invoke.mockReset();
});

describe('flatten-form-btn', () => {
  it('flattens through flatten_form and hands over the new document', async () => {
    invoke.mockResolvedValue(info);
    const onFlattened = vi.fn();
    const outcome = await runFlattenForm(onFlattened);
    expect(invoke).toHaveBeenCalledWith('flatten_form', undefined);
    expect(onFlattened).toHaveBeenCalledWith(info);
    expect(outcome).toEqual({ ok: true });
  });

  it('reports a refusal and does not claim the form was flattened', async () => {
    invoke.mockRejectedValue(new Error('This document is signed.'));
    const onFlattened = vi.fn();
    const outcome = await runFlattenForm(onFlattened);
    expect(onFlattened).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, message: 'This document is signed.' });
  });
});
