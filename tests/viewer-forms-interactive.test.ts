// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// Locate FormsModeContent for scoped assertions
const formsStart = rightPanelSource.indexOf('function FormsModeContent(');
const formsEnd   = rightPanelSource.indexOf('\nfunction ', formsStart + 1);
const formsSource = formsEnd === -1
  ? rightPanelSource.slice(formsStart)
  : rightPanelSource.slice(formsStart, formsEnd);

// ---------------------------------------------------------------------------
// CHECKBOX_TYPES constant
// ---------------------------------------------------------------------------

describe('FormsModeContent — CHECKBOX_TYPES constant', () => {
  it('declares CHECKBOX_TYPES as a ReadonlySet of FormFieldType', () => {
    expect(rightPanelSource).toContain(
      "const CHECKBOX_TYPES: ReadonlySet<FormFieldType> = new Set(['checkbox', 'radio']);"
    );
  });

  it('CHECKBOX_TYPES includes checkbox', () => {
    const constStart = rightPanelSource.indexOf('const CHECKBOX_TYPES');
    const constEnd   = rightPanelSource.indexOf(';', constStart) + 1;
    const constLine  = rightPanelSource.slice(constStart, constEnd);
    expect(constLine).toContain("'checkbox'");
  });

  it('CHECKBOX_TYPES includes radio', () => {
    const constStart = rightPanelSource.indexOf('const CHECKBOX_TYPES');
    const constEnd   = rightPanelSource.indexOf(';', constStart) + 1;
    const constLine  = rightPanelSource.slice(constStart, constEnd);
    expect(constLine).toContain("'radio'");
  });
});

// ---------------------------------------------------------------------------
// TEXT_LIKE_TYPES extended to include combo and list
// ---------------------------------------------------------------------------

describe('FormsModeContent — TEXT_LIKE_TYPES includes combo and list', () => {
  it('TEXT_LIKE_TYPES includes combo', () => {
    const constStart = rightPanelSource.indexOf('const TEXT_LIKE_TYPES');
    const constEnd   = rightPanelSource.indexOf(';', constStart) + 1;
    const constLine  = rightPanelSource.slice(constStart, constEnd);
    expect(constLine).toContain("'combo'");
  });

  it('TEXT_LIKE_TYPES includes list', () => {
    const constStart = rightPanelSource.indexOf('const TEXT_LIKE_TYPES');
    const constEnd   = rightPanelSource.indexOf(';', constStart) + 1;
    const constLine  = rightPanelSource.slice(constStart, constEnd);
    expect(constLine).toContain("'list'");
  });

  it('TEXT_LIKE_TYPES still includes the original text-like types', () => {
    const constStart = rightPanelSource.indexOf('const TEXT_LIKE_TYPES');
    const constEnd   = rightPanelSource.indexOf(';', constStart) + 1;
    const constLine  = rightPanelSource.slice(constStart, constEnd);
    expect(constLine).toContain("'text'");
    expect(constLine).toContain("'number'");
    expect(constLine).toContain("'date'");
    expect(constLine).toContain("'time'");
  });
});

// ---------------------------------------------------------------------------
// Edit buffer — handles array values
// ---------------------------------------------------------------------------

describe('FormsModeContent — edit buffer handles array field values', () => {
  it('useEffect sets editValue using Array.isArray guard for multi-value fields', () => {
    const effectStart = formsSource.indexOf('setEditValue(f ?');
    const effectEnd   = formsSource.indexOf(';', effectStart) + 1;
    const effectLine  = formsSource.slice(effectStart, effectEnd);
    expect(effectLine).toContain('Array.isArray(f.value)');
    expect(effectLine).toContain("f.value.join(', ')");
  });
});

// ---------------------------------------------------------------------------
// Checkbox/radio: click-to-toggle in field item onClick
// ---------------------------------------------------------------------------

describe('FormsModeContent — checkbox/radio toggle on field item click', () => {
  it('field item onClick checks CHECKBOX_TYPES.has(field.type)', () => {
    expect(formsSource).toContain('CHECKBOX_TYPES.has(field.type)');
  });

  it('field item onClick calls onSetFieldValue with boolean toggle', () => {
    expect(formsSource).toContain('onSetFieldValue(field.id, !(field.value as boolean))');
  });

  it('field item onClick calls onFieldSelect when not active for checkboxes', () => {
    const onClickStart = formsSource.indexOf('onClick={() => {');
    const onClickEnd   = formsSource.indexOf('}}', onClickStart) + 2;
    const onClickBody  = formsSource.slice(onClickStart, onClickEnd);
    expect(onClickBody).toContain('if (!isActive) onFieldSelect(idx)');
    expect(onClickBody).toContain('CHECKBOX_TYPES.has(field.type)');
    expect(onClickBody).toContain('onSetFieldValue(field.id, !(field.value as boolean))');
  });

  it('field item onClick guards against readOnly fields', () => {
    const onClickStart = formsSource.indexOf('onClick={() => {');
    const onClickEnd   = formsSource.indexOf('}}', onClickStart) + 2;
    const onClickBody  = formsSource.slice(onClickStart, onClickEnd);
    expect(onClickBody).toContain('!field.readOnly');
  });
});

// ---------------------------------------------------------------------------
// Checkbox/radio visual indicator
// ---------------------------------------------------------------------------

describe('FormsModeContent — field-checkbox-indicator', () => {
  it('renders field-checkbox-indicator span for checkbox/radio fields', () => {
    expect(formsSource).toContain('data-testid="field-checkbox-indicator"');
  });

  it('indicator is conditional on CHECKBOX_TYPES.has(field.type)', () => {
    const indicatorPos   = formsSource.indexOf('data-testid="field-checkbox-indicator"');
    const checkboxTypePos = formsSource.lastIndexOf('CHECKBOX_TYPES.has(field.type)', indicatorPos);
    expect(checkboxTypePos).toBeGreaterThan(-1);
    expect(indicatorPos - checkboxTypePos).toBeLessThan(300);
  });

  it('indicator uses rounded-full for radio type', () => {
    const indicatorStart = formsSource.indexOf('data-testid="field-checkbox-indicator"');
    const indicatorEnd   = formsSource.indexOf('</span>', indicatorStart) + 7;
    const indicatorEl    = formsSource.slice(indicatorStart, indicatorEnd);
    expect(indicatorEl).toContain("field.type === 'radio' ? 'rounded-full'");
  });

  it('indicator applies bg-primary when field.value is truthy', () => {
    const indicatorStart = formsSource.indexOf('data-testid="field-checkbox-indicator"');
    const indicatorEnd   = formsSource.indexOf('</span>', indicatorStart) + 7;
    const indicatorEl    = formsSource.slice(indicatorStart, indicatorEnd);
    expect(indicatorEl).toContain('field.value ? ');
    expect(indicatorEl).toContain('bg-primary border-primary');
  });

  it('renders CheckIcon inside indicator for checked checkbox', () => {
    const indicatorStart = formsSource.indexOf('data-testid="field-checkbox-indicator"');
    const indicatorEnd   = formsSource.indexOf('</span>', indicatorStart) + 7;
    const indicatorEl    = formsSource.slice(indicatorStart, indicatorEnd);
    expect(indicatorEl).toContain('CheckIcon');
    expect(indicatorEl).toContain("field.type === 'checkbox'");
  });

  it('shows Ingeschakeld/Uitgeschakeld label next to indicator', () => {
    const indicatorPos = formsSource.indexOf('data-testid="field-checkbox-indicator"');
    const labelPos     = formsSource.indexOf('Ingeschakeld', indicatorPos);
    expect(labelPos).toBeGreaterThan(-1);
    expect(labelPos - indicatorPos).toBeLessThan(700);
  });
});

// ---------------------------------------------------------------------------
// Combo/list: text input is shown (via TEXT_LIKE_TYPES extension)
// ---------------------------------------------------------------------------

describe('FormsModeContent — combo and list use text input fallback', () => {
  it('canEdit condition still uses TEXT_LIKE_TYPES.has(field.type)', () => {
    expect(formsSource).toContain('TEXT_LIKE_TYPES.has(field.type)');
  });

  it('canEdit is derived from isActive, TEXT_LIKE_TYPES, and readOnly', () => {
    expect(formsSource).toContain(
      'const canEdit = isActive && TEXT_LIKE_TYPES.has(field.type) && !field.readOnly;'
    );
  });

  it('field-value-input still rendered when canEdit is true', () => {
    expect(formsSource).toContain('data-testid="field-value-input"');
  });
});

// ---------------------------------------------------------------------------
// Escape handler — handles array values
// ---------------------------------------------------------------------------

describe('FormsModeContent — Escape handler resets to array-aware current value', () => {
  it('Escape handler uses Array.isArray guard when resetting editValue', () => {
    const escapeStart = formsSource.indexOf("e.key === 'Escape'");
    const escapeEnd   = formsSource.indexOf('}', escapeStart + 10) + 1;
    const escapeBlock = formsSource.slice(escapeStart, escapeEnd);
    expect(escapeBlock).toContain('Array.isArray(field.value)');
    expect(escapeBlock).toContain("field.value.join(', ')");
  });
});

// ---------------------------------------------------------------------------
// No-regression: existing forms behavior unchanged
// ---------------------------------------------------------------------------

describe('FormsModeContent — no regressions', () => {
  it('forms-field-item testid still present', () => {
    expect(formsSource).toContain('data-testid="forms-field-item"');
  });

  it('field-value-input Enter key still calls onSetFieldValue', () => {
    const enterStart = formsSource.indexOf("e.key === 'Enter'");
    const enterEnd   = formsSource.indexOf('}', enterStart + 10) + 1;
    const enterBlock = formsSource.slice(enterStart, enterEnd);
    expect(enterBlock).toContain('onSetFieldValue(field.id, editValue)');
  });

  it('field-required-badge still rendered', () => {
    expect(formsSource).toContain('data-testid="field-required-badge"');
  });

  it('field-error-badge still rendered', () => {
    expect(formsSource).toContain('data-testid="field-error-badge"');
  });

  it('field-validation-error still rendered', () => {
    expect(formsSource).toContain('data-testid="field-validation-error"');
  });

  it('form-submit-btn still present', () => {
    expect(formsSource).toContain('data-testid="form-submit-btn"');
  });

  it('forms-completion-summary still present', () => {
    expect(formsSource).toContain('data-testid="forms-completion-summary"');
  });

  it('field-filled-indicator still present', () => {
    expect(formsSource).toContain('data-testid="field-filled-indicator"');
  });

  it('isFieldFilled still handles boolean values', () => {
    expect(formsSource).toContain('if (typeof v === \'boolean\') return v;');
  });

  it('CHECKBOX_TYPES and TEXT_LIKE_TYPES are mutually exclusive for all handled types', () => {
    // Ensure no type appears in both sets
    expect(rightPanelSource).toContain("new Set(['checkbox', 'radio'])");
    expect(rightPanelSource).toContain("new Set(['text', 'number', 'date', 'time', 'combo', 'list'])");
    // None of the checkbox types should appear in TEXT_LIKE_TYPES
    const textLikeLine = rightPanelSource.slice(
      rightPanelSource.indexOf('const TEXT_LIKE_TYPES'),
      rightPanelSource.indexOf(';', rightPanelSource.indexOf('const TEXT_LIKE_TYPES')) + 1
    );
    expect(textLikeLine).not.toContain("'checkbox'");
    expect(textLikeLine).not.toContain("'radio'");
  });
});
