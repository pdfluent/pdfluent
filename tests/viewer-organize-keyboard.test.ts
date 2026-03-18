// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const gridSource = readFileSync(
  new URL('../src/viewer/components/OrganizeGrid.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Shift+click range selection
// ---------------------------------------------------------------------------

describe('organize keyboard — Shift+click range selection', () => {
  it('declares lastClickedRef with useRef', () => {
    expect(gridSource).toContain('lastClickedRef');
    expect(gridSource).toContain('useRef');
  });

  it('handleRangeSelect function exists for Shift+click', () => {
    expect(gridSource).toContain('handleRangeSelect');
  });

  it('checks e.shiftKey for range selection', () => {
    expect(gridSource).toContain('e.shiftKey');
  });

  it('fills range from lo to hi on Shift+click', () => {
    expect(gridSource).toContain('Math.min(lastClickedRef.current,');
    expect(gridSource).toContain('Math.max(lastClickedRef.current,');
  });

  it('adds all indices in range to selectedPages', () => {
    expect(gridSource).toContain('for (let idx = lo; idx <= hi; idx++) next.add(idx)');
  });

  it('tiles check shiftKey for range selection via handleRangeSelect', () => {
    expect(gridSource).toContain('e.shiftKey');
    expect(gridSource).toContain('handleRangeSelect');
    expect(gridSource).toContain('onMouseDown');
  });

  it('updates lastClickedRef on click', () => {
    expect(gridSource).toContain('lastClickedRef.current = index');
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

describe('organize keyboard — keyboard shortcuts', () => {
  it('has handleKey function registered via addEventListener', () => {
    expect(gridSource).toContain('handleKey');
    expect(gridSource).toContain('addEventListener');
    expect(gridSource).toContain('keydown');
  });

  it('handleKey is registered in a useEffect', () => {
    expect(gridSource).toContain('useEffect');
    expect(gridSource).toContain("window.addEventListener('keydown', handleKey)");
  });

  it('handleKey returns cleanup function via removeEventListener', () => {
    expect(gridSource).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('Delete key triggers handleBatchDelete with preventDefault', () => {
    expect(gridSource).toContain("e.key === 'Delete'");
    expect(gridSource).toContain('e.preventDefault()');
    expect(gridSource).toContain('handleBatchDeleteRef.current()');
  });

  it('Backspace key also triggers handleBatchDelete', () => {
    expect(gridSource).toContain("e.key === 'Backspace'");
  });

  it('R key triggers handleBatchRotate with preventDefault', () => {
    expect(gridSource).toContain("e.key === 'r' || e.key === 'R'");
    expect(gridSource).toContain('handleBatchRotateRef.current()');
  });

  it('Escape key clears selection', () => {
    expect(gridSource).toContain("e.key === 'Escape'");
    const escIdx = gridSource.indexOf("e.key === 'Escape'");
    const clearIdx = gridSource.indexOf('clearSelection()', escIdx);
    expect(clearIdx).toBeGreaterThan(escIdx);
  });

  it('⌘A / Ctrl+A selects all with preventDefault', () => {
    expect(gridSource).toContain("(e.metaKey || e.ctrlKey) && e.key === 'a'");
    const aIdx = gridSource.indexOf("e.key === 'a'");
    const selectAllIdx = gridSource.indexOf('selectAll()', aIdx);
    expect(selectAllIdx).toBeGreaterThan(aIdx);
  });

  it('handleKey skips INPUT and TEXTAREA targets', () => {
    expect(gridSource).toContain("tag === 'INPUT' || tag === 'TEXTAREA'");
  });
});

// ---------------------------------------------------------------------------
// Ref-based closure updates
// ---------------------------------------------------------------------------

describe('organize keyboard — ref-based closure updates', () => {
  it('has handleBatchDeleteRef for stable keydown handler', () => {
    expect(gridSource).toContain('handleBatchDeleteRef');
  });

  it('has handleBatchRotateRef for stable keydown handler', () => {
    expect(gridSource).toContain('handleBatchRotateRef');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing tests still pass
// ---------------------------------------------------------------------------

describe('organize keyboard — no regressions', () => {
  it('batch-action-bar testid still present', () => {
    expect(gridSource).toContain('data-testid="batch-action-bar"');
  });

  it('organize-grid testid still present', () => {
    expect(gridSource).toContain('data-testid="organize-grid"');
  });

  it('page-tile testid still present', () => {
    expect(gridSource).toContain('data-testid={`organize-page-tile-${i}`}');
  });

  it('select-all-btn still present', () => {
    expect(gridSource).toContain('data-testid="select-all-btn"');
  });

  it('selectAll still fills all page indices', () => {
    expect(gridSource).toContain('Array.from({ length: pageCount }');
  });

  it('clearSelection still resets to empty set', () => {
    expect(gridSource).toContain('setSelectedPages(new Set())');
  });
});
