// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const navRailSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

describe('LeftNavRail — localStorage key', () => {
  it('uses the key pdfluent.nav.panel', () => {
    expect(navRailSource).toContain("'pdfluent.nav.panel'");
  });

  it('uses the key consistently for both read and write', () => {
    const occurrences = (navRailSource.match(/'pdfluent\.nav\.panel'/g) ?? []).length;
    // getItem, setItem, removeItem = at least 3 occurrences
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Restore valid saved panel
// ---------------------------------------------------------------------------

describe('LeftNavRail — restore valid saved panel', () => {
  it('reads from localStorage on init (lazy useState initializer)', () => {
    expect(navRailSource).toContain('localStorage.getItem');
    // Must be inside a function passed to useState (lazy form)
    const initFnStart = navRailSource.indexOf('useState<NavigationPanel | null>(() =>');
    expect(initFnStart).toBeGreaterThan(-1);
    const getItemInInit = navRailSource.indexOf('localStorage.getItem', initFnStart);
    expect(getItemInInit).toBeGreaterThan(initFnStart);
  });

  it('validates the saved value against PANELS before using it', () => {
    expect(navRailSource).toContain('PANELS.some(p => p.id === saved)');
  });

  it('casts the saved string to NavigationPanel when valid', () => {
    expect(navRailSource).toContain('saved as NavigationPanel');
  });
});

// ---------------------------------------------------------------------------
// Fallback on invalid or missing value
// ---------------------------------------------------------------------------

describe('LeftNavRail — fallback to thumbnails', () => {
  it('returns thumbnails when localStorage is empty or invalid', () => {
    // The initializer must end with returning 'thumbnails' as fallback
    const initFnStart = navRailSource.indexOf('useState<NavigationPanel | null>(() =>');
    const initFnEnd = navRailSource.indexOf('});', initFnStart);
    const initBody = navRailSource.slice(initFnStart, initFnEnd);
    expect(initBody).toContain("return 'thumbnails'");
  });

  it('wraps localStorage access in try/catch for unavailable environments', () => {
    const initFnStart = navRailSource.indexOf('useState<NavigationPanel | null>(() =>');
    const initFnEnd = navRailSource.indexOf('});', initFnStart);
    const initBody = navRailSource.slice(initFnStart, initFnEnd);
    expect(initBody).toContain('try {');
    expect(initBody).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Persist panel changes
// ---------------------------------------------------------------------------

describe('LeftNavRail — persist panel changes', () => {
  it('calls localStorage.setItem when activePanel changes', () => {
    expect(navRailSource).toContain('localStorage.setItem');
  });

  it('writes the activePanel value to storage', () => {
    const setItemCall = navRailSource.indexOf("localStorage.setItem('pdfluent.nav.panel', activePanel)");
    expect(setItemCall).toBeGreaterThan(-1);
  });

  it('persistence is driven by a useEffect on activePanel', () => {
    expect(navRailSource).toContain('}, [activePanel])');
  });

  it('wraps write in try/catch for storage errors', () => {
    const effectStart = navRailSource.indexOf('}, [activePanel])');
    // find the useEffect body before the dep array close
    const effectBody = navRailSource.slice(navRailSource.lastIndexOf('useEffect(', effectStart), effectStart);
    expect(effectBody).toContain('try {');
    expect(effectBody).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Persist close / null state
// ---------------------------------------------------------------------------

describe('LeftNavRail — persist panel close', () => {
  it('removes the key when activePanel is null', () => {
    expect(navRailSource).toContain('localStorage.removeItem');
    expect(navRailSource).toContain("localStorage.removeItem('pdfluent.nav.panel')");
  });

  it('guards removeItem behind activePanel === null check', () => {
    const effectStart = navRailSource.indexOf('}, [activePanel])');
    const effectBody = navRailSource.slice(navRailSource.lastIndexOf('useEffect(', effectStart), effectStart);
    expect(effectBody).toContain('activePanel === null');
  });
});
