// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const overlaySource = readFileSync(
  new URL('../src/viewer/components/FormFieldOverlay.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// FormFieldOverlay — field type constants
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — field type constants', () => {
  it('defines CHECKBOX_FIELD_TYPES Set', () => {
    expect(overlaySource).toContain('CHECKBOX_FIELD_TYPES');
    expect(overlaySource).toContain("'checkbox'");
    expect(overlaySource).toContain("'radio'");
  });

  it('defines SELECT_FIELD_TYPES Set', () => {
    expect(overlaySource).toContain('SELECT_FIELD_TYPES');
    expect(overlaySource).toContain("'combo'");
    expect(overlaySource).toContain("'list'");
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — props interface
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — props interface', () => {
  it('accepts fields prop typed as FormField[]', () => {
    expect(overlaySource).toContain('fields: FormField[]');
  });

  it('accepts pageHeightPt prop for coordinate transform', () => {
    expect(overlaySource).toContain('pageHeightPt: number');
  });

  it('accepts zoom prop', () => {
    expect(overlaySource).toContain('zoom: number');
  });

  it('accepts onSetFieldValue callback', () => {
    expect(overlaySource).toContain('onSetFieldValue: (fieldId: string, value: FormFieldValue) => void');
  });

  it('accepts activeFieldIdx prop', () => {
    expect(overlaySource).toContain('activeFieldIdx: number');
  });

  it('accepts onFieldSelect callback', () => {
    expect(overlaySource).toContain('onFieldSelect: (idx: number) => void');
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — coordinate transform
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — PDF-to-DOM coordinate transform', () => {
  it('applies y-flip: domY = (pageHeightPt - rect.y - rect.height) * zoom', () => {
    expect(overlaySource).toContain('pageHeightPt - field.rect.y - field.rect.height');
    expect(overlaySource).toContain('* zoom');
  });

  it('applies x transform: domX = rect.x * zoom', () => {
    expect(overlaySource).toContain('field.rect.x * zoom');
  });

  it('applies width/height scale by zoom', () => {
    expect(overlaySource).toContain('field.rect.width * zoom');
    expect(overlaySource).toContain('field.rect.height * zoom');
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — element rendering
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — element rendering', () => {
  it('renders container with data-testid="form-field-overlay"', () => {
    expect(overlaySource).toContain('data-testid="form-field-overlay"');
  });

  it('renders checkbox/radio fields with data-testid="form-field-checkbox"', () => {
    expect(overlaySource).toContain('data-testid="form-field-checkbox"');
  });

  it('renders select fields with data-testid="form-field-select"', () => {
    expect(overlaySource).toContain('data-testid="form-field-select"');
  });

  it('renders text-like fields with data-testid="form-field-input"', () => {
    expect(overlaySource).toContain('data-testid="form-field-input"');
  });

  it('skips invisible fields (field.visible guard)', () => {
    expect(overlaySource).toContain('field.visible');
  });

  it('returns null when fields array is empty', () => {
    expect(overlaySource).toContain('fields.length === 0');
    expect(overlaySource).toContain('return null');
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — required field indicator
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — required field styling', () => {
  it('applies red border to required fields', () => {
    expect(overlaySource).toContain('field.required');
    expect(overlaySource).toContain('220, 38, 38');
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — Tab navigation
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — Tab/Shift+Tab navigation', () => {
  it('handles Tab key to advance to next field', () => {
    expect(overlaySource).toContain("e.key === 'Tab'");
    expect(overlaySource).toContain('e.shiftKey');
  });

  it('prevents default on Tab to stop browser tab-out', () => {
    const tabStart = overlaySource.indexOf("e.key === 'Tab'");
    const tabEnd = tabStart + 200;
    const tabBlock = overlaySource.slice(tabStart, tabEnd);
    expect(tabBlock).toContain('e.preventDefault()');
  });

  it('wraps around within the fields array', () => {
    expect(overlaySource).toContain('fields.length');
    expect(overlaySource).toContain('% fields.length');
  });

  it('calls onFieldSelect with new index', () => {
    expect(overlaySource).toContain('onFieldSelect(next)');
  });
});

// ---------------------------------------------------------------------------
// FormFieldOverlay — read-only guard
// ---------------------------------------------------------------------------

describe('FormFieldOverlay — read-only guard', () => {
  it('does not call onSetFieldValue for readOnly fields on checkbox toggle', () => {
    const checkboxStart = overlaySource.indexOf("CHECKBOX_FIELD_TYPES.has(field.type)");
    const checkboxEnd = checkboxStart + 1200;
    const checkboxBlock = overlaySource.slice(checkboxStart, checkboxEnd);
    expect(checkboxBlock).toContain('!field.readOnly');
  });

  it('does not call onSetFieldValue for readOnly fields on text change', () => {
    const inputStart = overlaySource.indexOf('data-testid="form-field-input"');
    const inputEnd = inputStart + 400;
    const inputBlock = overlaySource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('!field.readOnly');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — FormFieldOverlay wiring', () => {
  it('imports FormFieldOverlay', () => {
    expect(viewerAppSource).toContain("import { FormFieldOverlay }");
    expect(viewerAppSource).toContain("FormFieldOverlay");
  });

  it('renders FormFieldOverlay only in forms mode', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const precedingBlock = viewerAppSource.slice(Math.max(0, overlayStart - 100), overlayStart);
    expect(precedingBlock).toContain("mode === 'forms'");
  });

  it('passes fields filtered by current pageIndex', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const overlayEnd = viewerAppSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = viewerAppSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('f.pageIndex === pageIndex');
  });

  it('passes pageHeightPt from current page size', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const overlayEnd = viewerAppSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = viewerAppSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('pageHeightPt=');
  });

  it('passes zoom', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const overlayEnd = viewerAppSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = viewerAppSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('zoom={zoom}');
  });

  it('passes onSetFieldValue={handleSetFieldValue}', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const overlayEnd = viewerAppSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = viewerAppSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('onSetFieldValue={handleSetFieldValue}');
  });

  it('passes activeFieldIdx and onFieldSelect', () => {
    const overlayStart = viewerAppSource.indexOf('<FormFieldOverlay');
    const overlayEnd = viewerAppSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = viewerAppSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('activeFieldIdx={activeFieldIdx}');
    expect(overlayEl).toContain('onFieldSelect={handleFieldNav}');
  });
});
