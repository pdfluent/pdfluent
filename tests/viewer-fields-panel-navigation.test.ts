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

// Slice FieldsPanel body for scoped assertions
const fieldsPanelStart = leftNavSource.indexOf('function FieldsPanel(');
const fieldsPanelEnd   = leftNavSource.indexOf('\nfunction ', fieldsPanelStart + 1);
const fieldsPanelBody  = leftNavSource.slice(fieldsPanelStart, fieldsPanelEnd);

// Slice PanelContent body for threading assertions
const panelContentStart = leftNavSource.indexOf('function PanelContent(');
const panelContentEnd   = leftNavSource.indexOf('\n// ── Root', panelContentStart);
const panelContentBody  = leftNavSource.slice(panelContentStart, panelContentEnd);

// ---------------------------------------------------------------------------
// onPageSelect prop threading
// ---------------------------------------------------------------------------

describe('FieldsPanel — onPageSelect prop threading', () => {
  it('FieldsPanel declares onPageSelect in its props', () => {
    expect(fieldsPanelBody).toContain('onPageSelect');
    expect(fieldsPanelBody).toContain('onPageSelect: (index: number) => void');
  });

  it('PanelContent passes onPageSelect to FieldsPanel', () => {
    expect(panelContentBody).toContain('onPageSelect={onPageSelect}');
  });

  it('FieldsPanel case in PanelContent includes onPageSelect', () => {
    const fieldsCase = panelContentBody.indexOf("case 'fields'");
    const onPageSelectInCase = panelContentBody.indexOf('onPageSelect={onPageSelect}', fieldsCase);
    expect(onPageSelectInCase).toBeGreaterThan(fieldsCase);
  });
});

// ---------------------------------------------------------------------------
// Clickable field row
// ---------------------------------------------------------------------------

describe('FieldsPanel — clickable field rows', () => {
  it('renders field rows as <button> elements', () => {
    // The row container is now a button, not a div
    expect(fieldsPanelBody).toContain('<button');
  });

  it('field rows have data-testid="field-row"', () => {
    expect(fieldsPanelBody).toContain('data-testid="field-row"');
  });

  it('field row has cursor-pointer styling', () => {
    expect(fieldsPanelBody).toContain('cursor-pointer');
  });

  it('field row button has text-left alignment', () => {
    expect(fieldsPanelBody).toContain('text-left');
  });

  it('field row button spans full width', () => {
    expect(fieldsPanelBody).toContain('w-full');
  });
});

// ---------------------------------------------------------------------------
// Correct pageIndex passed on click
// ---------------------------------------------------------------------------

describe('FieldsPanel — page navigation on click', () => {
  it('onClick calls onPageSelect with field.pageIndex', () => {
    expect(fieldsPanelBody).toContain('onPageSelect(field.pageIndex)');
  });

  it('onClick is on the field row button', () => {
    const buttonIdx = fieldsPanelBody.indexOf('<button');
    const onClickIdx = fieldsPanelBody.indexOf('onClick', buttonIdx);
    const pageSelectIdx = fieldsPanelBody.indexOf('onPageSelect(field.pageIndex)', onClickIdx);
    // onClick handler calls onPageSelect(field.pageIndex)
    expect(pageSelectIdx).toBeGreaterThan(buttonIdx);
  });

  it('passes field.pageIndex (0-based) directly without offset', () => {
    // Should be field.pageIndex, not field.pageIndex - 1 or field.pageIndex + 1
    expect(fieldsPanelBody).toContain('onPageSelect(field.pageIndex)');
    expect(fieldsPanelBody).not.toContain('onPageSelect(field.pageIndex - 1)');
    expect(fieldsPanelBody).not.toContain('onPageSelect(field.pageIndex + 1)');
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing field rendering
// ---------------------------------------------------------------------------

describe('FieldsPanel — no regressions to rendering', () => {
  it('still renders field label or name', () => {
    expect(fieldsPanelBody).toContain('field.label || field.name');
  });

  it('still renders type badge via FIELD_TYPE_LABELS', () => {
    expect(fieldsPanelBody).toContain('FIELD_TYPE_LABEL_KEYS[field.type]');
  });

  it('still renders 1-based page number', () => {
    expect(fieldsPanelBody).toContain('field.pageIndex + 1');
  });

  it('still uses field.id as key', () => {
    expect(fieldsPanelBody).toContain('key={field.id}');
  });

  it('still renders the empty state', () => {
    expect(fieldsPanelBody).toContain("t('leftNav.noFormFields'");
  });

  it('still has hover background on field rows', () => {
    expect(fieldsPanelBody).toContain('hover:bg-muted/50');
  });
});

// ---------------------------------------------------------------------------
// Multiple fields on the same page
// ---------------------------------------------------------------------------

describe('FieldsPanel — multiple fields on same page', () => {
  it('uses field.id as unique key (not pageIndex) — stable with duplicates', () => {
    // key is field.id, not field.pageIndex, so two fields on the same page have distinct keys
    expect(fieldsPanelBody).toContain('key={field.id}');
    expect(fieldsPanelBody).not.toContain('key={field.pageIndex}');
  });

  it('each row independently calls onPageSelect with its own field.pageIndex', () => {
    // The onClick lambda closes over `field`, so each row navigates to its own page
    expect(fieldsPanelBody).toContain('onClick={() => { onPageSelect(field.pageIndex); }}');
  });
});
