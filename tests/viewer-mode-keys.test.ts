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

// Locate the mode-key effect for scoped assertions
const effectStart = viewerAppSource.indexOf('Mode switching keyboard shortcuts');
const effectEnd = viewerAppSource.indexOf('// Zoom keyboard shortcuts', effectStart);
const effectBody = viewerAppSource.slice(effectStart, effectEnd);

// ---------------------------------------------------------------------------
// Key → mode mappings
// ---------------------------------------------------------------------------

describe('ViewerApp — mode switching key mappings', () => {
  it("maps '1' to read", () => {
    expect(effectBody).toContain("'1': 'read'");
  });

  it("maps '2' to review", () => {
    expect(effectBody).toContain("'2': 'review'");
  });

  it("maps '3' to edit", () => {
    expect(effectBody).toContain("'3': 'edit'");
  });

  it("maps '4' to organize", () => {
    expect(effectBody).toContain("'4': 'organize'");
  });

  it("maps '5' to forms", () => {
    expect(effectBody).toContain("'5': 'forms'");
  });

  it("maps '6' to protect", () => {
    expect(effectBody).toContain("'6': 'protect'");
  });

  it("maps '7' to convert", () => {
    expect(effectBody).toContain("'7': 'convert'");
  });

  it('calls setMode with the resolved mode', () => {
    expect(effectBody).toContain('setMode(mode)');
  });
});

// ---------------------------------------------------------------------------
// Guard: modifier keys
// ---------------------------------------------------------------------------

describe('ViewerApp — mode key guard: modifier keys', () => {
  it('ignores when metaKey is held', () => {
    expect(effectBody).toContain('e.metaKey');
  });

  it('ignores when ctrlKey is held', () => {
    expect(effectBody).toContain('e.ctrlKey');
  });

  it('ignores when altKey is held', () => {
    expect(effectBody).toContain('e.altKey');
  });

  it('returns early when any modifier is active', () => {
    expect(effectBody).toContain('if (e.metaKey || e.ctrlKey || e.altKey) return');
  });
});

// ---------------------------------------------------------------------------
// Guard: focused form elements
// ---------------------------------------------------------------------------

describe('ViewerApp — mode key guard: input focus', () => {
  it('reads tagName from the event target', () => {
    expect(effectBody).toContain('e.target');
    expect(effectBody).toContain('tagName');
  });

  it('ignores keys when focus is inside an INPUT', () => {
    expect(effectBody).toContain("tag === 'INPUT'");
  });

  it('ignores keys when focus is inside a TEXTAREA', () => {
    expect(effectBody).toContain("tag === 'TEXTAREA'");
  });

  it('ignores keys when focus is inside a SELECT', () => {
    expect(effectBody).toContain("tag === 'SELECT'");
  });
});

// ---------------------------------------------------------------------------
// No regression with existing keyboard handlers
// ---------------------------------------------------------------------------

describe('ViewerApp — mode keys do not conflict with existing shortcuts', () => {
  it('mode key handler does not call e.preventDefault()', () => {
    // Number keys have no browser default to suppress
    expect(effectBody).not.toContain('e.preventDefault()');
  });

  it('mode key useEffect uses empty dependency array (stable setMode)', () => {
    expect(effectBody).toContain('}, [])');
  });

  it('existing ⌘K handler is unaffected (still present in source)', () => {
    expect(viewerAppSource).toContain("e.key === 'k'");
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('existing page nav handler is unaffected (still present in source)', () => {
    expect(viewerAppSource).toContain("case 'ArrowRight'");
    expect(viewerAppSource).toContain('setPageIndex');
  });
});

// ---------------------------------------------------------------------------
// Listener cleanup
// ---------------------------------------------------------------------------

describe('ViewerApp — mode key listener cleanup', () => {
  it('registers keydown listener for mode switching', () => {
    expect(effectBody).toContain("window.addEventListener('keydown', handleModeKey)");
  });

  it('removes listener on cleanup', () => {
    expect(effectBody).toContain("window.removeEventListener('keydown', handleModeKey)");
  });
});
