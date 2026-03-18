// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

// Locate the page number input for scoped assertions
const inputStart = topBarSource.indexOf('aria-label="Page number"');
const inputTagStart = topBarSource.lastIndexOf('<input', inputStart);
const inputTagEnd = topBarSource.indexOf('/>', inputStart);
const inputElement = topBarSource.slice(inputTagStart, inputTagEnd);

// ---------------------------------------------------------------------------
// onKeyDown handler
// ---------------------------------------------------------------------------

describe('TopBar — page input Enter key: handler present', () => {
  it('has an onKeyDown handler on the page number input', () => {
    expect(inputElement).toContain('onKeyDown');
  });

  it('checks for the Enter key', () => {
    expect(inputElement).toContain("e.key === 'Enter'");
  });

  it('calls blur() on the input when Enter is pressed', () => {
    expect(inputElement).toContain('e.currentTarget.blur()');
  });
});

// ---------------------------------------------------------------------------
// Correct element
// ---------------------------------------------------------------------------

describe('TopBar — page input Enter key: correct element', () => {
  it('onKeyDown is on a number input', () => {
    expect(inputElement).toContain('type="number"');
  });

  it('onKeyDown is on the same element as the pageInputRef', () => {
    expect(inputElement).toContain('ref={pageInputRef}');
  });

  it('onKeyDown is on the same element as onChange', () => {
    expect(inputElement).toContain('onChange={handlePageInputChange}');
  });
});

// ---------------------------------------------------------------------------
// Existing behavior preserved
// ---------------------------------------------------------------------------

describe('TopBar — page input Enter key: existing behavior preserved', () => {
  it('onChange handler is still present', () => {
    expect(inputElement).toContain('onChange={handlePageInputChange}');
  });

  it('min and max attributes are still present', () => {
    expect(inputElement).toContain('min={1}');
    expect(inputElement).toContain('max={pageCount}');
  });

  it('value binding is still present', () => {
    expect(inputElement).toContain('value={pageIndex + 1}');
  });

  it('aria-label is still present', () => {
    expect(inputElement).toContain('aria-label="Page number"');
  });

  it('pageInputRef is still attached', () => {
    expect(inputElement).toContain('ref={pageInputRef}');
  });
});

// ---------------------------------------------------------------------------
// No regressions in TopBar
// ---------------------------------------------------------------------------

describe('TopBar — page input Enter key: no regressions', () => {
  it('⌘S save handler still present', () => {
    expect(topBarSource).toContain("e.key === 's'");
  });

  it('save button still present', () => {
    expect(topBarSource).toContain('SaveIcon');
  });

  it('close document button still present', () => {
    expect(topBarSource).toContain('close-document-btn');
  });

  it('pageInputRef prop still declared', () => {
    expect(topBarSource).toContain('pageInputRef?:');
  });
});
