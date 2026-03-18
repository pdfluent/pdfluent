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

// Locate the page-position persist effect
const persistStart = viewerAppSource.indexOf('Persist current page position per file path');
const persistEnd   = viewerAppSource.indexOf('}, [pageIndex, currentFilePath])') +
                     '}, [pageIndex, currentFilePath])'.length;
const persistBlock = viewerAppSource.slice(persistStart, persistEnd);

// Locate the document-load effect (restore path)
const loadStart  = viewerAppSource.indexOf('Reset to page 0 and populate derived document data');
const loadEnd    = viewerAppSource.indexOf('}, [pdfDoc?.id])', loadStart) + '}, [pdfDoc?.id])'.length;
const loadBlock  = viewerAppSource.slice(loadStart, loadEnd);

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

describe('page position memory — localStorage key', () => {
  it("uses the key 'pdfluent.viewer.pages'", () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.pages'");
  });

  it('uses the key consistently for both read and write', () => {
    const occurrences = (viewerAppSource.match(/'pdfluent\.viewer\.pages'/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Persist effect — write on page change
// ---------------------------------------------------------------------------

describe('page position memory — persist effect', () => {
  it('skips write when currentFilePath is null', () => {
    expect(persistBlock).toContain('if (!currentFilePath) return');
  });

  it('reads existing map from localStorage before writing', () => {
    expect(persistBlock).toContain('localStorage.getItem');
    expect(persistBlock).toContain("'pdfluent.viewer.pages'");
  });

  it('stores pageIndex keyed by currentFilePath', () => {
    expect(persistBlock).toContain('map[currentFilePath] = pageIndex');
  });

  it('writes updated map back to localStorage', () => {
    expect(persistBlock).toContain('localStorage.setItem');
    expect(persistBlock).toContain("'pdfluent.viewer.pages'");
    expect(persistBlock).toContain('JSON.stringify(map)');
  });

  it('caps the map at 50 entries to bound storage size', () => {
    expect(persistBlock).toContain('50');
    expect(persistBlock).toContain('keys.length > 50');
  });

  it('removes the oldest entry when cap is exceeded', () => {
    expect(persistBlock).toContain('keys[0]');
    expect(persistBlock).toContain('delete map[');
  });

  it('wraps all localStorage access in try/catch', () => {
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('} catch {');
  });

  it('useEffect depends on [pageIndex, currentFilePath]', () => {
    expect(persistBlock).toContain('}, [pageIndex, currentFilePath])');
  });
});

// ---------------------------------------------------------------------------
// Document-load effect — restore on open
// ---------------------------------------------------------------------------

describe('page position memory — restore on document open', () => {
  it('declares restoredPage with a default of 0', () => {
    expect(loadBlock).toContain('restoredPage = 0');
  });

  it('only attempts restore when currentFilePath is set', () => {
    expect(loadBlock).toContain('if (currentFilePath)');
  });

  it('reads from localStorage on document open', () => {
    expect(loadBlock).toContain('localStorage.getItem');
    expect(loadBlock).toContain("'pdfluent.viewer.pages'");
  });

  it('parses the stored JSON map', () => {
    expect(loadBlock).toContain('JSON.parse(raw)');
  });

  it('reads the stored page for the current file path', () => {
    expect(loadBlock).toContain('map[currentFilePath]');
  });

  it('validates the stored value is a non-negative number', () => {
    expect(loadBlock).toContain("typeof saved === 'number'");
    expect(loadBlock).toContain('saved >= 0');
  });

  it('clamps the restored page to pageCount - 1', () => {
    expect(loadBlock).toContain('Math.min(saved, pageCount - 1)');
  });

  it('guards against clamping when pageCount is 0', () => {
    expect(loadBlock).toContain('pageCount > 0');
  });

  it('wraps restore in try/catch', () => {
    expect(loadBlock).toContain('try {');
    expect(loadBlock).toContain('} catch {');
  });

  it('calls setPageIndex with the resolved page', () => {
    expect(loadBlock).toContain('setPageIndex(restoredPage)');
  });
});

// ---------------------------------------------------------------------------
// Behavior at boundaries
// ---------------------------------------------------------------------------

describe('page position memory — boundary behavior', () => {
  it('anonymous (ArrayBuffer) sources fall back to page 0 (no currentFilePath)', () => {
    // The guard `if (!currentFilePath) return` in the persist effect covers this.
    // The restore also checks `if (currentFilePath)` before reading.
    expect(persistBlock).toContain('if (!currentFilePath) return');
    expect(loadBlock).toContain('if (currentFilePath)');
  });

  it('still resets derived data (outline, formFields, comments) on every document open', () => {
    expect(loadBlock).toContain('setOutline([])');
    expect(loadBlock).toContain('setFormFields([])');
    expect(loadBlock).toContain('setAllAnnotations([])');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('page position memory — no regressions', () => {
  it('document-load effect still depends on [pdfDoc?.id]', () => {
    expect(loadBlock).toContain('}, [pdfDoc?.id])');
  });

  it('zoom persistence key is unchanged', () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.zoom'");
  });

  it('rail persistence key is unchanged', () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.rail'");
  });

  it('recent command history key is unchanged', () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.commands.recent'");
  });

  it('keyboard zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('floating page indicator still present', () => {
    expect(viewerAppSource).toContain('floating-page-indicator');
  });
});
