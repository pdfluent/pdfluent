// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const leftNavSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

describe('viewer FieldsPanel — v2 left rail', () => {
  it('renders empty state when no form fields are present', () => {
    expect(leftNavSource).toContain('Geen formuliervelden gevonden.');
    expect(leftNavSource).toContain('FileInputIcon');
  });

  it('renders a field row with name/label, type badge, and page number', () => {
    // Label or name displayed in truncated span
    expect(leftNavSource).toContain('field.label || field.name');
    // Type badge using FIELD_TYPE_LABELS lookup
    expect(leftNavSource).toContain('FIELD_TYPE_LABELS[field.type]');
    // Page number (1-based)
    expect(leftNavSource).toContain('field.pageIndex + 1');
  });

  it('exposes all FormFieldType labels in FIELD_TYPE_LABELS', () => {
    // All 14 FormFieldType values must have a Dutch label in the map
    const expectedLabels = [
      'Tekst', 'Selectievakje', 'Keuzerondje', 'Lijst', 'Vervolgkeuzelijst',
      'Handtekening', 'Knop', 'Datum', 'Tijd', 'Getal',
      'Wachtwoord', 'Bestand', 'Barcode', 'Opgemaakte tekst',
    ];
    for (const label of expectedLabels) {
      expect(leftNavSource).toContain(label);
    }
  });

  it('accepts formFields prop in LeftNavRailProps', () => {
    expect(leftNavSource).toContain('formFields: FormField[]');
  });

  it('passes formFields to FieldsPanel via PanelContent', () => {
    expect(leftNavSource).toContain('formFields={formFields}');
  });

  it('no longer has the TODO(pdfluent-viewer) marker for FieldsPanel', () => {
    expect(leftNavSource).not.toContain('TODO(pdfluent-viewer): implement form fields panel');
  });
});

describe('viewer ViewerApp — formFields state wiring', () => {
  it('declares formFields state', () => {
    expect(viewerAppSource).toContain('useState<FormField[]>([])');
  });

  it('resets formFields when document changes', () => {
    expect(viewerAppSource).toContain('setFormFields([])');
  });

  it('populates formFields from engine.form.getAllFormFields after load', () => {
    expect(viewerAppSource).toContain('engine.form.getAllFormFields(pdfDoc)');
  });

  it('passes formFields into LeftNavRail', () => {
    expect(viewerAppSource).toContain('formFields={formFields}');
  });
});
