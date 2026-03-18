// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Move Engine — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 3
 *
 * Verified:
 * - computeMove applies correct delta to rect and matrix
 * - computeMove clamps to page boundary
 * - computeMove blocks non-movable objects
 * - computeMove blocks locked objects
 * - snapToGrid snaps correctly for various grid sizes
 * - translateMatrix updates only e and f components
 * - clampDeltaToPage handles all four boundary directions
 * - Move session accumulates delta correctly
 * - Zero delta produces a move result with outcome='moved'
 */

import { describe, it, expect } from 'vitest';
import {
  computeMove,
  translateMatrix,
  snapToGrid,
  clampDeltaToPage,
  beginMoveSession,
  updateMoveSession,
} from '../src/viewer/layout/objectMoveEngine';
import type { MoveOptions } from '../src/viewer/layout/objectMoveEngine';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX } from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE: MoveOptions['pageBounds'] = { x: 0, y: 0, width: 595, height: 842 };

function makeObj(overrides: Partial<LayoutObject> = {}): LayoutObject {
  return {
    id: 'obj0',
    pageIndex: 0,
    type: 'image',
    rect: { x: 100, y: 200, width: 100, height: 50 },
    matrix: IDENTITY_MATRIX,
    movable: true,
    resizable: true,
    replaceable: true,
    source: {
      id: 'obj0',
      pageIndex: 0,
      rawType: 'ximage',
      rect: { x: 100, y: 200, width: 100, height: 50 },
      matrix: IDENTITY_MATRIX,
    },
    ...overrides,
  };
}

const DEFAULT_OPTIONS: MoveOptions = { pageBounds: PAGE };

// ---------------------------------------------------------------------------
// translateMatrix
// ---------------------------------------------------------------------------

describe('objectMoveEngine — translateMatrix', () => {
  it('identity + (10, 20) → [1,0,0,1,10,20]', () => {
    expect(translateMatrix(IDENTITY_MATRIX, 10, 20)).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it('only e and f components change', () => {
    const m = translateMatrix([2, 0.5, -0.5, 2, 0, 0], 5, 3);
    expect(m[0]).toBe(2);
    expect(m[1]).toBe(0.5);
    expect(m[2]).toBe(-0.5);
    expect(m[3]).toBe(2);
    expect(m[4]).toBe(5);
    expect(m[5]).toBe(3);
  });

  it('translating by (0, 0) returns same matrix values', () => {
    const m = translateMatrix([1, 0, 0, 1, 50, 30], 0, 0);
    expect(m).toEqual([1, 0, 0, 1, 50, 30]);
  });

  it('accumulating translations adds to e and f', () => {
    const m1 = translateMatrix(IDENTITY_MATRIX, 10, 5);
    const m2 = translateMatrix(m1, 3, -2);
    expect(m2[4]).toBe(13);
    expect(m2[5]).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// snapToGrid
// ---------------------------------------------------------------------------

describe('objectMoveEngine — snapToGrid', () => {
  it('grid=0 returns value unchanged', () => {
    expect(snapToGrid(7.3, 0)).toBe(7.3);
  });

  it('snaps 7 to grid=10 → 10', () => {
    expect(snapToGrid(7, 10)).toBe(10);
  });

  it('snaps 4 to grid=10 → 0', () => {
    expect(snapToGrid(4, 10)).toBe(0);
  });

  it('snaps 25 to grid=10 → 30', () => {
    expect(snapToGrid(25, 10)).toBe(30);
  });

  it('snaps exact multiple unchanged', () => {
    expect(snapToGrid(20, 10)).toBe(20);
  });

  it('snaps negative value correctly', () => {
    expect(snapToGrid(-7, 10)).toBe(-10);
  });
});

// ---------------------------------------------------------------------------
// clampDeltaToPage
// ---------------------------------------------------------------------------

describe('objectMoveEngine — clampDeltaToPage', () => {
  const rect = { x: 100, y: 200, width: 100, height: 50 };

  it('no clamping needed for in-bounds delta', () => {
    const result = clampDeltaToPage(rect, 10, 10, PAGE);
    expect(result.clamped).toBe(false);
    expect(result.dx).toBe(10);
    expect(result.dy).toBe(10);
  });

  it('clamps left boundary (negative dx too large)', () => {
    // rect.x=100, dx=-200 → would go to x=-100 → clamp to x=0, dx=-100
    const result = clampDeltaToPage(rect, -200, 0, PAGE);
    expect(result.clamped).toBe(true);
    expect(result.dx).toBe(-100); // clamp to left edge: 0 - 100 = -100
  });

  it('clamps right boundary (positive dx too large)', () => {
    // rect right edge = 200, move right by 500 → would be 700 > 595 → clamp
    const result = clampDeltaToPage(rect, 500, 0, PAGE);
    expect(result.clamped).toBe(true);
    expect(result.dx).toBe(595 - 100 - 100); // 395
  });

  it('clamps bottom boundary (negative dy too large)', () => {
    // rect.y=200, dy=-300 → would be -100 < 0 → clamp to 0
    const result = clampDeltaToPage(rect, 0, -300, PAGE);
    expect(result.clamped).toBe(true);
    expect(result.dy).toBe(-200);
  });

  it('clamps top boundary (positive dy too large)', () => {
    // rect top = 200+50=250, move up by 700 → 250+700=950 > 842
    const result = clampDeltaToPage(rect, 0, 700, PAGE);
    expect(result.clamped).toBe(true);
    expect(result.dy).toBe(842 - 200 - 50); // 592
  });
});

// ---------------------------------------------------------------------------
// computeMove — normal movement
// ---------------------------------------------------------------------------

describe('objectMoveEngine — computeMove normal', () => {
  it('moves object by (10, 20) — updates rect and matrix', () => {
    const obj = makeObj();
    const result = computeMove(obj, 10, 20, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('moved');
    expect(result.newRect!.x).toBe(110);
    expect(result.newRect!.y).toBe(220);
    expect(result.newRect!.width).toBe(100);
    expect(result.newRect!.height).toBe(50);
    expect(result.newMatrix![4]).toBe(10); // e += 10
    expect(result.newMatrix![5]).toBe(20); // f += 20
  });

  it('zero delta is valid and returns moved', () => {
    const result = computeMove(makeObj(), 0, 0, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('moved');
    expect(result.appliedDelta).toEqual({ dx: 0, dy: 0 });
  });

  it('applied delta matches requested when no clamping', () => {
    const result = computeMove(makeObj(), 15, 25, DEFAULT_OPTIONS);
    expect(result.appliedDelta).toEqual({ dx: 15, dy: 25 });
  });
});

// ---------------------------------------------------------------------------
// computeMove — blocked cases
// ---------------------------------------------------------------------------

describe('objectMoveEngine — computeMove blocked', () => {
  it('non-movable object → blocked-non-movable', () => {
    const obj = makeObj({ movable: false, type: 'form_widget' });
    const result = computeMove(obj, 10, 10, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('blocked-non-movable');
    expect(result.newRect).toBeNull();
    expect(result.newMatrix).toBeNull();
    expect(result.appliedDelta).toEqual({ dx: 0, dy: 0 });
  });

  it('locked object → blocked-locked', () => {
    const obj = makeObj();
    const result = computeMove(obj, 10, 10, { ...DEFAULT_OPTIONS, locked: true });
    expect(result.outcome).toBe('blocked-locked');
    expect(result.newRect).toBeNull();
    expect(result.reasonCode).toBe('layer-locked');
  });
});

// ---------------------------------------------------------------------------
// computeMove — clamping
// ---------------------------------------------------------------------------

describe('objectMoveEngine — computeMove clamped', () => {
  it('moving past left boundary → clamped', () => {
    const obj = makeObj({ rect: { x: 10, y: 200, width: 100, height: 50 } });
    const result = computeMove(obj, -50, 0, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('clamped');
    expect(result.newRect!.x).toBe(0); // clamped to left edge
    expect(result.reasonCode).toBe('clamped-to-page-boundary');
  });

  it('moving past right boundary → clamped', () => {
    const obj = makeObj({ rect: { x: 490, y: 200, width: 100, height: 50 } });
    // x=490 + w=100 = 590 + dx=50 = 640 > 595 → clamp
    const result = computeMove(obj, 50, 0, DEFAULT_OPTIONS);
    expect(result.outcome).toBe('clamped');
    expect(result.newRect!.x + result.newRect!.width).toBe(595);
  });
});

// ---------------------------------------------------------------------------
// computeMove — snap grid
// ---------------------------------------------------------------------------

describe('objectMoveEngine — snap grid', () => {
  it('delta snapped to grid before clamping', () => {
    const obj = makeObj();
    // dx=7 with grid=10 → snapped to 10
    const result = computeMove(obj, 7, 0, { ...DEFAULT_OPTIONS, snapGrid: 10 });
    expect(result.appliedDelta.dx).toBe(10);
  });

  it('delta=4 with grid=10 → snapped to 0', () => {
    const result = computeMove(makeObj(), 4, 0, { ...DEFAULT_OPTIONS, snapGrid: 10 });
    expect(result.appliedDelta.dx).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Move session
// ---------------------------------------------------------------------------

describe('objectMoveEngine — MoveSession', () => {
  it('beginMoveSession captures start rect', () => {
    const obj = makeObj();
    const session = beginMoveSession(obj);
    expect(session.objectId).toBe(obj.id);
    expect(session.startRect).toEqual(obj.rect);
    expect(session.totalDx).toBe(0);
    expect(session.totalDy).toBe(0);
    expect(session.wasClamped).toBe(false);
  });

  it('updateMoveSession accumulates total delta', () => {
    const obj = makeObj();
    const session = beginMoveSession(obj);
    updateMoveSession(session, obj, 10, 5, DEFAULT_OPTIONS);
    updateMoveSession(session, obj, 3, -2, DEFAULT_OPTIONS);
    expect(session.totalDx).toBe(13);
    expect(session.totalDy).toBe(3);
  });

  it('wasClamped is set when any step is clamped', () => {
    const obj = makeObj({ rect: { x: 5, y: 200, width: 100, height: 50 } });
    const session = beginMoveSession(obj);
    // Move far left → clamped
    updateMoveSession(session, obj, -100, 0, DEFAULT_OPTIONS);
    expect(session.wasClamped).toBe(true);
  });
});
