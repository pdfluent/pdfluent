// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Resize Engine — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 4
 *
 * Verified:
 * - computeResizeRect correctly adjusts rect for all 8 handles
 * - computeResize produces correct newRect and newMatrix for a simple resize
 * - computeResize blocks non-resizable objects
 * - computeResize blocks locked objects
 * - Minimum size clamping prevents rect below MIN_OBJECT_SIZE
 * - Page boundary clamping prevents rect exceeding page bounds
 * - computeResizeMatrix correctly scales a and d, translates e and f
 * - keepAspect=true maintains the aspect ratio for corner handles
 */

import { describe, it, expect } from 'vitest';
import {
  computeResize,
  computeResizeRect,
  computeResizeMatrix,
  clampRectToMinSize,
  clampRectToPage,
  MIN_OBJECT_SIZE,
} from '../src/viewer/layout/objectResizeEngine';
import type { ResizeOptions } from '../src/viewer/layout/objectResizeEngine';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX } from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE = { x: 0, y: 0, width: 595, height: 842 };
const DEFAULT_OPTIONS: ResizeOptions = { pageBounds: PAGE };

function makeObj(rect = { x: 100, y: 200, width: 200, height: 100 }): LayoutObject {
  return {
    id: 'obj0',
    pageIndex: 0,
    type: 'image',
    rect,
    matrix: IDENTITY_MATRIX,
    movable: true,
    resizable: true,
    replaceable: true,
    source: {
      id: 'obj0',
      pageIndex: 0,
      rawType: 'ximage',
      rect,
      matrix: IDENTITY_MATRIX,
    },
  };
}

// ---------------------------------------------------------------------------
// MIN_OBJECT_SIZE
// ---------------------------------------------------------------------------

describe('objectResizeEngine — MIN_OBJECT_SIZE', () => {
  it('is a positive number', () => {
    expect(MIN_OBJECT_SIZE).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeResizeRect — handle-by-handle
// ---------------------------------------------------------------------------

describe('objectResizeEngine — computeResizeRect handles', () => {
  const r = { x: 100, y: 200, width: 200, height: 100 };

  it('e handle: width increases by dx, x/y/height unchanged', () => {
    const nr = computeResizeRect(r, 'e', 20, 0, false);
    expect(nr.width).toBe(220);
    expect(nr.x).toBe(100);
    expect(nr.y).toBe(200);
    expect(nr.height).toBe(100);
  });

  it('w handle: x increases, width decreases by dx', () => {
    const nr = computeResizeRect(r, 'w', 20, 0, false);
    expect(nr.x).toBe(120);
    expect(nr.width).toBe(180);
  });

  it('n handle (top in PDF space): y increases, height decreases by dy', () => {
    const nr = computeResizeRect(r, 'n', 0, 10, false);
    expect(nr.y).toBe(210);
    expect(nr.height).toBe(90);
  });

  it('s handle: height increases by dy', () => {
    const nr = computeResizeRect(r, 's', 0, 20, false);
    expect(nr.height).toBe(120);
    expect(nr.y).toBe(200);
  });

  it('se handle: width and height both increase', () => {
    const nr = computeResizeRect(r, 'se', 10, 15, false);
    expect(nr.width).toBe(210);
    expect(nr.height).toBe(115);
  });

  it('nw handle: x increases, width decreases; y increases, height decreases', () => {
    const nr = computeResizeRect(r, 'nw', 10, 5, false);
    expect(nr.x).toBe(110);
    expect(nr.width).toBe(190);
    expect(nr.y).toBe(205);
    expect(nr.height).toBe(95);
  });

  it('ne handle: width increases; y increases, height decreases', () => {
    const nr = computeResizeRect(r, 'ne', 10, 5, false);
    expect(nr.width).toBe(210);
    expect(nr.y).toBe(205);
    expect(nr.height).toBe(95);
  });

  it('sw handle: x increases, width decreases; height increases', () => {
    const nr = computeResizeRect(r, 'sw', 10, 15, false);
    expect(nr.x).toBe(110);
    expect(nr.width).toBe(190);
    expect(nr.height).toBe(115);
  });
});

// ---------------------------------------------------------------------------
// computeResizeRect — keepAspect
// ---------------------------------------------------------------------------

describe('objectResizeEngine — keepAspect', () => {
  it('se handle with keepAspect=true maintains aspect ratio', () => {
    // original: 200x100 → aspect = 2:1
    const r = { x: 0, y: 0, width: 200, height: 100 };
    const nr = computeResizeRect(r, 'se', 20, 0, true); // width → 220
    // height should be 220/2 = 110
    expect(nr.width).toBe(220);
    expect(nr.height).toBeCloseTo(110);
  });

  it('nw handle with keepAspect=true maintains aspect ratio', () => {
    const r = { x: 100, y: 200, width: 200, height: 100 };
    const nr = computeResizeRect(r, 'nw', -20, 0, true); // width → 220
    expect(nr.width).toBe(220);
    expect(nr.height).toBeCloseTo(110);
  });

  it('edge handle (e) with keepAspect=true is unaffected (only corners snap ratio)', () => {
    const r = { x: 0, y: 0, width: 200, height: 100 };
    const nr = computeResizeRect(r, 'e', 20, 0, true);
    // Edge handle doesn't apply aspect correction in our implementation
    expect(nr.width).toBe(220);
  });
});

// ---------------------------------------------------------------------------
// clampRectToMinSize
// ---------------------------------------------------------------------------

describe('objectResizeEngine — clampRectToMinSize', () => {
  it('rect above minimum is unchanged', () => {
    const { rect, clamped } = clampRectToMinSize({ x: 0, y: 0, width: 100, height: 50 });
    expect(clamped).toBe(false);
    expect(rect.width).toBe(100);
  });

  it('width below MIN_OBJECT_SIZE is clamped', () => {
    const { rect, clamped } = clampRectToMinSize({ x: 0, y: 0, width: 3, height: 50 });
    expect(clamped).toBe(true);
    expect(rect.width).toBe(MIN_OBJECT_SIZE);
  });

  it('height below MIN_OBJECT_SIZE is clamped', () => {
    const { rect, clamped } = clampRectToMinSize({ x: 0, y: 0, width: 50, height: 2 });
    expect(clamped).toBe(true);
    expect(rect.height).toBe(MIN_OBJECT_SIZE);
  });

  it('both dimensions below minimum are both clamped', () => {
    const { rect, clamped } = clampRectToMinSize({ x: 0, y: 0, width: 1, height: 1 });
    expect(clamped).toBe(true);
    expect(rect.width).toBe(MIN_OBJECT_SIZE);
    expect(rect.height).toBe(MIN_OBJECT_SIZE);
  });
});

// ---------------------------------------------------------------------------
// clampRectToPage
// ---------------------------------------------------------------------------

describe('objectResizeEngine — clampRectToPage', () => {
  it('in-bounds rect is unchanged', () => {
    const { rect, clamped } = clampRectToPage({ x: 10, y: 10, width: 100, height: 50 }, PAGE);
    expect(clamped).toBe(false);
    expect(rect.width).toBe(100);
  });

  it('rect exceeding right boundary is clamped', () => {
    const { rect, clamped } = clampRectToPage({ x: 500, y: 0, width: 200, height: 50 }, PAGE);
    expect(clamped).toBe(true);
    expect(rect.x + rect.width).toBe(595);
  });

  it('rect exceeding top boundary is clamped', () => {
    const { rect, clamped } = clampRectToPage({ x: 0, y: 800, width: 100, height: 100 }, PAGE);
    expect(clamped).toBe(true);
    expect(rect.y + rect.height).toBe(842);
  });
});

// ---------------------------------------------------------------------------
// computeResizeMatrix
// ---------------------------------------------------------------------------

describe('objectResizeEngine — computeResizeMatrix', () => {
  it('scale and translation updated, shear preserved', () => {
    const originalRect = { x: 100, y: 200, width: 200, height: 100 };
    const newRect = { x: 100, y: 200, width: 250, height: 150 };
    const m = computeResizeMatrix(IDENTITY_MATRIX, originalRect, newRect);
    expect(m[0]).toBeCloseTo(1.25); // scaleX = 250/200
    expect(m[3]).toBeCloseTo(1.5);  // scaleY = 150/100
    expect(m[4]).toBe(0);           // e: 0 + (100-100) = 0
    expect(m[5]).toBe(0);           // f: 0 + (200-200) = 0
    expect(m[1]).toBe(0);           // shear unchanged
    expect(m[2]).toBe(0);
  });

  it('translation components updated when origin shifts', () => {
    const originalRect = { x: 100, y: 200, width: 200, height: 100 };
    const newRect = { x: 80, y: 200, width: 220, height: 100 };
    const m = computeResizeMatrix(IDENTITY_MATRIX, originalRect, newRect);
    expect(m[4]).toBe(-20); // e += 80 - 100
    expect(m[5]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeResize — integration
// ---------------------------------------------------------------------------

describe('objectResizeEngine — computeResize integration', () => {
  it('normal resize on image returns resized outcome', () => {
    const obj = makeObj();
    const result = computeResize(obj, 'se', 20, 15, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('resized');
    expect(result.newRect!.width).toBe(220);
    expect(result.newRect!.height).toBe(115);
    expect(result.newMatrix).not.toBeNull();
  });

  it('non-resizable object is blocked', () => {
    const obj = makeObj();
    const nonResizable = { ...obj, resizable: false, type: 'text_block' as const };
    const result = computeResize(nonResizable, 'se', 20, 15, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('blocked-not-resizable');
    expect(result.newRect).toBeNull();
  });

  it('locked object is blocked', () => {
    const result = computeResize(makeObj(), 'se', 20, 15, { ...DEFAULT_OPTIONS, locked: true });
    expect(result.outcome).toBe('blocked-locked');
  });

  it('resize below minimum size is clamped', () => {
    // Shrink to near-zero
    const obj = makeObj({ x: 100, y: 200, width: 50, height: 50 });
    const result = computeResize(obj, 'se', -100, -100, DEFAULT_OPTIONS);
    expect(['clamped-min-size', 'resized']).toContain(result.outcome);
    expect(result.newRect!.width).toBeGreaterThanOrEqual(MIN_OBJECT_SIZE);
    expect(result.newRect!.height).toBeGreaterThanOrEqual(MIN_OBJECT_SIZE);
  });
});
