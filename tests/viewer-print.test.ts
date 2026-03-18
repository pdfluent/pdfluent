// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const cssSource = readFileSync(
  new URL('../src/styles/global.css', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Print keyboard handler
// ---------------------------------------------------------------------------

describe('print — keyboard handler', () => {
  it('has handlePrintKey function', () => {
    expect(viewerAppSource).toContain('handlePrintKey');
  });

  it('calls window.print()', () => {
    expect(viewerAppSource).toContain('window.print()');
  });

  it('detects metaKey or ctrlKey with key p', () => {
    expect(viewerAppSource).toContain("e.key !== 'p'");
    expect(viewerAppSource).toContain('e.metaKey || e.ctrlKey');
  });

  it('calls e.preventDefault() before printing', () => {
    const printIdx = viewerAppSource.indexOf('handlePrintKey');
    const preventIdx = viewerAppSource.indexOf('e.preventDefault()', printIdx);
    expect(preventIdx).toBeGreaterThan(printIdx);
  });

  it('guards printing when pageCount === 0', () => {
    const printIdx = viewerAppSource.indexOf('handlePrintKey');
    const guardIdx = viewerAppSource.indexOf('pageCount === 0', printIdx);
    expect(guardIdx).toBeGreaterThan(printIdx);
  });

  it('registers keydown listener for print', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handlePrintKey)");
  });

  it('removes keydown listener on cleanup', () => {
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handlePrintKey)");
  });
});

// ---------------------------------------------------------------------------
// Print command in palette
// ---------------------------------------------------------------------------

describe('print — command palette entry', () => {
  it('has a print command in the commands array', () => {
    expect(viewerAppSource).toContain("id: 'print'");
  });

  it('print command label is in Dutch', () => {
    expect(viewerAppSource).toContain('Afdrukken');
  });

  it('print command calls window.print()', () => {
    const printCmdIdx = viewerAppSource.indexOf("id: 'print'");
    const printCallIdx = viewerAppSource.indexOf('window.print()', printCmdIdx);
    expect(printCallIdx).toBeGreaterThan(printCmdIdx);
  });
});

// ---------------------------------------------------------------------------
// data-print-region attribute
// ---------------------------------------------------------------------------

describe('print — data-print-region', () => {
  it('has data-print-region attribute in JSX', () => {
    expect(viewerAppSource).toContain('data-print-region');
  });
});

// ---------------------------------------------------------------------------
// CSS print styles
// ---------------------------------------------------------------------------

describe('print — CSS styles', () => {
  it('has @media print rule in global.css', () => {
    expect(cssSource).toContain('@media print');
  });

  it('hides body children in print mode', () => {
    expect(cssSource).toContain('display: none !important');
  });

  it('shows data-print-region element in print mode', () => {
    expect(cssSource).toContain('[data-print-region]');
    expect(cssSource).toContain('display: block !important');
  });
});
