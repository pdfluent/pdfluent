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

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: localStorage key', () => {
  it("uses the key 'pdfluent.viewer.zoom'", () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.zoom'");
  });

  it('uses the key consistently for both read and write', () => {
    const occurrences = (viewerAppSource.match(/'pdfluent\.viewer\.zoom'/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Lazy useState initializer — restore on mount
// ---------------------------------------------------------------------------

// Locate the lazy initializer block
const initStart = viewerAppSource.indexOf('const [zoom, setZoom] = useState(');
const initEnd = viewerAppSource.indexOf('});', initStart) + 3;
const initBlock = viewerAppSource.slice(initStart, initEnd);

describe('ViewerApp — zoom persistence: lazy initializer', () => {
  it('uses a lazy useState initializer (function form)', () => {
    expect(initBlock).toContain('useState(() =>');
  });

  it('reads from localStorage on init', () => {
    expect(initBlock).toContain('localStorage.getItem');
    expect(initBlock).toContain("'pdfluent.viewer.zoom'");
  });

  it('parses the stored value with parseFloat', () => {
    expect(initBlock).toContain('parseFloat(');
  });

  it('validates the stored value is within 0.25–4.0 before using it', () => {
    expect(initBlock).toContain('>= 0.25');
    expect(initBlock).toContain('<= 4');
  });

  it('falls back to 1.0 when value is invalid or missing', () => {
    expect(initBlock).toContain('return 1.0');
  });

  it('wraps localStorage access in try/catch', () => {
    expect(initBlock).toContain('try {');
    expect(initBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Persist effect — write on change
// ---------------------------------------------------------------------------

// Locate the persist effect
const persistStart = viewerAppSource.indexOf('Persist zoom to localStorage');
const persistEnd = viewerAppSource.indexOf('}, [zoom])');
const persistBlock = viewerAppSource.slice(persistStart, persistEnd + '}, [zoom])'.length);

describe('ViewerApp — zoom persistence: write effect', () => {
  it('writes zoom to localStorage when zoom changes', () => {
    expect(persistBlock).toContain('localStorage.setItem');
    expect(persistBlock).toContain("'pdfluent.viewer.zoom'");
  });

  it('stores zoom as a string', () => {
    expect(persistBlock).toContain('String(zoom)');
  });

  it('useEffect depends on [zoom]', () => {
    expect(persistBlock).toContain('}, [zoom])');
  });

  it('wraps write in try/catch', () => {
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Document-open behavior: zoom no longer resets to 1.0
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: no reset on document open', () => {
  it('does not call setZoom(1.0) in the document-load effect', () => {
    // Locate the document-load effect body
    const effectStart = viewerAppSource.indexOf('Reset to page 0 and populate derived document data');
    const effectEnd = viewerAppSource.indexOf('}, [pdfDoc?.id])', effectStart);
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).not.toContain('setZoom(1.0)');
  });

  it('still sets pageIndex on document open (via restoredPage, defaulting to 0)', () => {
    const effectStart = viewerAppSource.indexOf('Reset to page 0 and populate derived document data');
    const effectEnd = viewerAppSource.indexOf('}, [pdfDoc?.id])', effectStart);
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    // restoredPage defaults to 0 and is used as setPageIndex argument
    expect(effectBody).toContain('restoredPage = 0');
    expect(effectBody).toContain('setPageIndex(restoredPage)');
  });
});

// ---------------------------------------------------------------------------
// No regressions with zoom interactions
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: no regressions', () => {
  it('keyboard zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('scroll-to-zoom still present', () => {
    expect(viewerAppSource).toContain('handleWheel');
    expect(viewerAppSource).toContain('{ passive: false }');
  });

  it('zoom reset button still present', () => {
    expect(viewerAppSource).toContain('zoom-reset-btn');
  });

  it('zoom-reset-btn now opens the presets popover', () => {
    // The percentage button toggles the zoom presets popover
    const testidIdx = viewerAppSource.indexOf('zoom-reset-btn');
    const btnStart = viewerAppSource.lastIndexOf('<button', testidIdx);
    const btnEnd = viewerAppSource.indexOf('</button>', testidIdx);
    const resetBtn = viewerAppSource.slice(btnStart, btnEnd);
    expect(resetBtn).toContain('setZoomPresetsOpen(o => !o)');
  });
});
