// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-56: a field filled through the form engine (the forms panel's path) is
// written with the typed `set_form_value` command, which gives the widget its
// /AS and /AP. The legacy `set_form_field_value` wrote a raw /V only, so a
// checkbox stayed unchecked in other viewers. The backend half is
// src-tauri/tests/acroform_every_field_type.rs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PdfDocument, FormField, FormFieldValue } from '../../../../core/document';

const invoke = vi.fn();
vi.mock('../../../../lib/commandBridge', () => ({
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import { TauriFormEngine } from '../TauriFormEngine';

function field(type: FormField['type'], name: string): FormField {
  return {
    id: `id-${name}`, pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 },
    type, name, value: '', defaultValue: '', required: false, readOnly: false,
    visible: true, label: name,
  } as FormField;
}

const fields = [
  field('text', 'name'),
  field('checkbox', 'agree'),
  field('radio', 'color'),
  field('combo', 'country'),
  field('list', 'size'),
  field('list', 'toppings'),
];
const doc = { formFields: fields } as unknown as PdfDocument;

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

async function write(name: string, value: FormFieldValue): Promise<unknown> {
  const result = await new TauriFormEngine().setFormFieldValue(doc, `id-${name}`, value);
  expect(result.success).toBe(true);
  expect(invoke).toHaveBeenCalledTimes(1);
  const [cmd, args] = invoke.mock.calls[0] as [string, { request: unknown }];
  expect(cmd).toBe('set_form_value');
  return args.request;
}

describe('TauriFormEngine.setFormFieldValue writes the typed request per field type', () => {
  it('text', async () => {
    expect(await write('name', 'Jane Doe')).toEqual({ kind: 'text', name: 'name', value: 'Jane Doe' });
  });
  it('checkbox, from a boolean and from a state name', async () => {
    expect(await write('agree', true)).toEqual({ kind: 'checkbox', name: 'agree', checked: true });
    invoke.mockClear();
    expect(await write('agree', 'Off')).toEqual({ kind: 'checkbox', name: 'agree', checked: false });
  });
  it('radio', async () => {
    expect(await write('color', 'blue')).toEqual({ kind: 'radio', name: 'color', export: 'blue' });
  });
  it('combo box', async () => {
    expect(await write('country', 'Belgium')).toEqual({ kind: 'choice', name: 'country', value: 'Belgium' });
  });
  it('single-select list box', async () => {
    expect(await write('size', 'Medium')).toEqual({ kind: 'choice', name: 'size', value: 'Medium' });
  });
  it('multi-select list box', async () => {
    expect(await write('toppings', ['Cheese', 'Olives'])).toEqual({
      kind: 'multiChoice', name: 'toppings', values: ['Cheese', 'Olives'],
    });
  });
  it('a refused write is reported, not swallowed', async () => {
    invoke.mockRejectedValueOnce(new Error('read-only'));
    const result = await new TauriFormEngine().setFormFieldValue(doc, 'id-name', 'x');
    expect(result.success).toBe(false);
  });
});
