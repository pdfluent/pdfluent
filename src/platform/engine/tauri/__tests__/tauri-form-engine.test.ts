// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach } from 'vitest';
import { TauriFormEngine } from '../TauriFormEngine';
import type { PdfDocument, FormField } from '../../../../core/document';

// Minimal PdfDocument stub — only formFields matters for these tests
function makeDoc(formFields: FormField[]): PdfDocument {
  return { formFields } as unknown as PdfDocument;
}

function makeField(overrides: Partial<FormField>): FormField {
  return {
    id: 'field_1',
    pageIndex: 0,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    type: 'text',
    name: 'field_name',
    value: '',
    defaultValue: '',
    required: false,
    readOnly: false,
    visible: true,
    label: 'Field Label',
    ...overrides,
  } as FormField;
}

describe('TauriFormEngine — getAllFormFields', () => {
  let engine: TauriFormEngine;

  beforeEach(() => {
    engine = new TauriFormEngine();
  });

  it('returns success with an empty array when document has no form fields', () => {
    const doc = makeDoc([]);

    const result = engine.getAllFormFields(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });

  it('returns all fields from document.formFields', () => {
    const fields = [
      makeField({ id: 'f1', name: 'firstName', type: 'text', pageIndex: 0 }),
      makeField({ id: 'f2', name: 'agree', type: 'checkbox', pageIndex: 1 }),
    ];
    const doc = makeDoc(fields);

    const result = engine.getAllFormFields(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.name).toBe('firstName');
    expect(result.value[1]?.type).toBe('checkbox');
  });

  it('returns a copy — mutating the result does not affect the document', () => {
    const fields = [makeField({ id: 'f1' })];
    const doc = makeDoc(fields);

    const result = engine.getAllFormFields(doc);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Splice the returned array
    result.value.splice(0, 1);

    // Original document is unchanged
    expect(doc.formFields).toHaveLength(1);
  });

  it('preserves field properties: name, type, pageIndex, label', () => {
    const field = makeField({
      id: 'f1',
      name: 'invoiceDate',
      type: 'date',
      pageIndex: 2,
      label: 'Invoice Date',
    });
    const doc = makeDoc([field]);

    const result = engine.getAllFormFields(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const returned = result.value[0];
    expect(returned?.name).toBe('invoiceDate');
    expect(returned?.type).toBe('date');
    expect(returned?.pageIndex).toBe(2);
    expect(returned?.label).toBe('Invoice Date');
  });

  it('handles a document with many fields without error', () => {
    const fields = Array.from({ length: 50 }, (_, i) =>
      makeField({ id: `f${i}`, name: `field_${i}`, pageIndex: Math.floor(i / 5) })
    );
    const doc = makeDoc(fields);

    const result = engine.getAllFormFields(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(50);
  });
});
