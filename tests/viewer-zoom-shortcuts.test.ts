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

// Locate the zoom key effect for scoped assertions
const effectStart = viewerAppSource.indexOf('Zoom keyboard shortcuts');
const effectEnd = viewerAppSource.indexOf('// Go-to-page keyboard shortcut', effectStart);
const effectBody = viewerAppSource.slice(effectStart, effectEnd);

// ---------------------------------------------------------------------------
// Modifier key requirement
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: modifier key guard', () => {
  it('requires metaKey or ctrlKey to be held', () => {
    expect(effectBody).toContain('e.metaKey || e.ctrlKey');
  });

  it('returns early when no modifier is active', () => {
    expect(effectBody).toContain('if (!(e.metaKey || e.ctrlKey)) return');
  });
});

// ---------------------------------------------------------------------------
// pageCount guard
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: pageCount guard', () => {
  it('returns early when pageCount is 0', () => {
    expect(effectBody).toContain('if (pageCount === 0) return');
  });
});

// ---------------------------------------------------------------------------
// Key → action mappings
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: key mappings', () => {
  it("maps '=' to zoom in", () => {
    expect(effectBody).toContain("e.key === '='");
  });

  it("maps '+' to zoom in (alias)", () => {
    expect(effectBody).toContain("e.key === '+'");
  });

  it("maps '-' to zoom out", () => {
    expect(effectBody).toContain("e.key === '-'");
  });

  it("maps '0' to zoom reset", () => {
    expect(effectBody).toContain("e.key === '0'");
  });
});

// ---------------------------------------------------------------------------
// Zoom bounds
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: zoom bounds', () => {
  it('clamps zoom in at 4 (400%)', () => {
    expect(effectBody).toContain('Math.min(4,');
  });

  it('clamps zoom out at 0.25 (25%)', () => {
    expect(effectBody).toContain('Math.max(0.25,');
  });

  it('resets zoom to exactly 1.0 on ⌘0', () => {
    expect(effectBody).toContain('setZoom(1.0)');
  });

  it('increments zoom by 0.25 on zoom in', () => {
    expect(effectBody).toContain('z + 0.25');
  });

  it('decrements zoom by 0.25 on zoom out', () => {
    expect(effectBody).toContain('z - 0.25');
  });
});

// ---------------------------------------------------------------------------
// preventDefault
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: preventDefault', () => {
  it('calls e.preventDefault() to suppress browser zoom', () => {
    expect(effectBody).toContain('e.preventDefault()');
  });

  it('calls e.preventDefault() at least three times (one per key branch)', () => {
    const count = (effectBody.match(/e\.preventDefault\(\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Listener registration and cleanup
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: listener lifecycle', () => {
  it('registers keydown listener for zoom shortcuts', () => {
    expect(effectBody).toContain("window.addEventListener('keydown', handleZoomKey)");
  });

  it('removes listener on cleanup', () => {
    expect(effectBody).toContain("window.removeEventListener('keydown', handleZoomKey)");
  });

  it('useEffect depends on pageCount', () => {
    expect(effectBody).toContain('}, [pageCount])');
  });
});

// ---------------------------------------------------------------------------
// No regressions with existing shortcuts
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom shortcuts: no regressions', () => {
  it('⌘K handler is still present', () => {
    expect(viewerAppSource).toContain("e.key === 'k'");
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('⌘S handler is still present in TopBar', () => {
    const topBarSource = readFileSync(
      new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
      'utf8'
    );
    expect(topBarSource).toContain("e.key === 's'");
    expect(topBarSource).toContain('handleSaveRef');
  });

  it('mode switching handler is still present', () => {
    expect(viewerAppSource).toContain('handleModeKey');
    expect(viewerAppSource).toContain("'1': 'read'");
  });
});
