// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const documentModelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

// Locate FormsModeContent function bounds for scoped assertions
const formsStart = panelSource.indexOf('function FormsModeContent');
const formsEnd = panelSource.indexOf('\nfunction ', formsStart + 1);
const formsSource = formsEnd === -1
  ? panelSource.slice(formsStart)
  : panelSource.slice(formsStart, formsEnd);

// ---------------------------------------------------------------------------
// FormField model — required and value fields
// ---------------------------------------------------------------------------

describe('forms field status — document model', () => {
  it('FormField has required field in model', () => {
    const fieldStart = documentModelSource.indexOf('interface FormField');
    const requiredIdx = documentModelSource.indexOf('required:', fieldStart);
    expect(requiredIdx).toBeGreaterThan(fieldStart);
  });

  it('FormField has value field in model', () => {
    const fieldStart = documentModelSource.indexOf('interface FormField');
    const valueIdx = documentModelSource.indexOf('value:', fieldStart);
    expect(valueIdx).toBeGreaterThan(fieldStart);
  });
});

// ---------------------------------------------------------------------------
// Completion summary
// ---------------------------------------------------------------------------

describe('forms field status — completion summary', () => {
  it('has data-testid="forms-completion-summary"', () => {
    expect(formsSource).toContain('data-testid="forms-completion-summary"');
  });

  it('completion summary is conditional on required fields existing', () => {
    expect(formsSource).toContain('formFields.some(f => f.required)');
  });

  it('completion summary shows count of required fields filled', () => {
    expect(formsSource).toContain('verplichte velden ingevuld');
  });

  it('filters for required AND filled', () => {
    expect(formsSource).toContain('f.required && isFieldFilled(f)');
  });
});

// ---------------------------------------------------------------------------
// Per-field badges
// ---------------------------------------------------------------------------

describe('forms field status — per-field indicators', () => {
  it('has data-testid="field-required-badge"', () => {
    expect(formsSource).toContain('data-testid="field-required-badge"');
  });

  it('required badge shows asterisk', () => {
    expect(formsSource).toContain('field.required');
  });

  it('has data-testid="field-filled-indicator"', () => {
    expect(formsSource).toContain('data-testid="field-filled-indicator"');
  });

  it('filled indicator uses green color', () => {
    expect(formsSource).toContain('bg-green-500');
  });

  it('has data-testid="field-empty-required-indicator"', () => {
    expect(formsSource).toContain('data-testid="field-empty-required-indicator"');
  });

  it('empty required indicator uses amber color', () => {
    expect(formsSource).toContain('bg-amber-400');
  });
});

// ---------------------------------------------------------------------------
// Regressions — existing forms mode tests
// ---------------------------------------------------------------------------

describe('forms field status — no regressions', () => {
  it('FIELD_TYPE_LABELS still present', () => {
    expect(panelSource).toContain('FIELD_TYPE_LABELS');
  });

  it('forms-field-item testid still present', () => {
    expect(formsSource).toContain('data-testid="forms-field-item"');
  });

  it('FormsModeContent still exists', () => {
    expect(panelSource).toContain('function FormsModeContent');
  });

  it('Formuliervelden section title still present', () => {
    expect(panelSource).toContain('Formuliervelden');
  });

  it('field type label still shown', () => {
    expect(formsSource).toContain('FIELD_TYPE_LABELS[field.type]');
  });

  it('page index still shown as p.{field.pageIndex + 1}', () => {
    expect(formsSource).toContain('field.pageIndex + 1');
  });
});
