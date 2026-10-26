// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The document the S5 walk opens carries the two things some controls can only act
// on: a text box and a placed image (scripts/quality/suite/make_ui_walk_doc.py).
// The Rust side reads it with the app's own engine in
// src-tauri/tests/document_operations.rs (ui_walk_document_*).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const pdf = readFileSync(resolve(ROOT, 'src-tauri/tests/fixtures/ui-walk-doc.pdf')).toString('latin1');

describe('the UI walk document', () => {
  it('is a PDF with a text box and a placed image', () => {
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toMatch(/\/Subtype\s*\/FreeText/);
    expect(pdf).toMatch(/\/Subtype\s*\/Stamp/);
    expect(pdf).toMatch(/\/Name\s*\/Image/);
  });
  it('keeps the golden sample\'s three pages', () => {
    expect(pdf).toMatch(/\/Count\s+3/);
  });
  it('is what the generator writes, so the checked-in file and the script cannot drift', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/quality/suite/make_ui_walk_doc.py'), 'utf8');
    expect(script).toContain('ui-walk-doc.pdf');
    expect(script).toContain('Name.Image');
  });
});
