// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Content Object Detection — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 1
 *
 * Verifies:
 * - classifyRawObject maps each rawType to the correct LayoutObjectType
 * - detectLayoutObjects produces correct counts and filtered objects
 * - Capability flags (movable/resizable/replaceable) are correct per type
 * - Filter helpers (getObjectsByType, getMovableObjects, etc.) work correctly
 * - Rect utilities (overlap, contains, center, translate) are correct
 * - Page filtering: only objects on requested pageIndex are included
 * - IDENTITY_MATRIX constant is correct
 * - All functions handle empty input without crashing
 */

import { describe, it, expect } from 'vitest';
import {
  classifyRawObject,
  detectLayoutObjects,
  getObjectsByType,
  getMovableObjects,
  getResizableObjects,
  getReplaceableObjects,
  findObjectById,
  isValidRect,
  rectCenter,
  translateRect,
  rectsOverlap,
  rectContains,
  IDENTITY_MATRIX,
} from '../src/viewer/layout/objectDetection';
import type {
  RawContentObject,
  LayoutObjectType,
} from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRaw(
  id: string,
  rawType: RawContentObject['rawType'],
  pageIndex = 0,
  hints?: RawContentObject['hints'],
): RawContentObject {
  return {
    id,
    pageIndex,
    rawType,
    rect: { x: 10, y: 10, width: 100, height: 50 },
    matrix: IDENTITY_MATRIX,
    hints,
  };
}

// ---------------------------------------------------------------------------
// IDENTITY_MATRIX
// ---------------------------------------------------------------------------

describe('objectDetection — IDENTITY_MATRIX', () => {
  it('has 6 components', () => {
    expect(IDENTITY_MATRIX).toHaveLength(6);
  });

  it('is [1, 0, 0, 1, 0, 0]', () => {
    expect(IDENTITY_MATRIX).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// classifyRawObject
// ---------------------------------------------------------------------------

describe('classifyRawObject — type mapping', () => {
  it('text → text_block', () => {
    expect(classifyRawObject(makeRaw('a', 'text'))).toBe('text_block');
  });

  it('ximage → image', () => {
    expect(classifyRawObject(makeRaw('a', 'ximage'))).toBe('image');
  });

  it('widget → form_widget', () => {
    expect(classifyRawObject(makeRaw('a', 'widget'))).toBe('form_widget');
  });

  it('path with filled=true → shape', () => {
    expect(classifyRawObject(makeRaw('a', 'path', 0, { filled: true }))).toBe('shape');
  });

  it('path with filled=false → vector_graphics', () => {
    expect(classifyRawObject(makeRaw('a', 'path', 0, { filled: false }))).toBe('vector_graphics');
  });

  it('path with no hints → vector_graphics (filled is undefined)', () => {
    expect(classifyRawObject(makeRaw('a', 'path'))).toBe('vector_graphics');
  });

  it('path with stroked only → vector_graphics', () => {
    expect(classifyRawObject(makeRaw('a', 'path', 0, { stroked: true }))).toBe('vector_graphics');
  });
});

// ---------------------------------------------------------------------------
// detectLayoutObjects — basic
// ---------------------------------------------------------------------------

describe('detectLayoutObjects — empty input', () => {
  it('returns empty objects array', () => {
    const result = detectLayoutObjects([], 0);
    expect(result.objects).toHaveLength(0);
  });

  it('returns all zero counts', () => {
    const result = detectLayoutObjects([], 0);
    expect(result.counts.text_block).toBe(0);
    expect(result.counts.image).toBe(0);
    expect(result.counts.shape).toBe(0);
    expect(result.counts.vector_graphics).toBe(0);
    expect(result.counts.form_widget).toBe(0);
  });

  it('returns correct pageIndex', () => {
    expect(detectLayoutObjects([], 3).pageIndex).toBe(3);
  });
});

describe('detectLayoutObjects — single object', () => {
  it('text object is detected', () => {
    const result = detectLayoutObjects([makeRaw('t0', 'text')], 0);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].type).toBe('text_block');
    expect(result.counts.text_block).toBe(1);
  });

  it('image object is detected', () => {
    const result = detectLayoutObjects([makeRaw('i0', 'ximage')], 0);
    expect(result.objects[0].type).toBe('image');
    expect(result.counts.image).toBe(1);
  });

  it('shape object is detected', () => {
    const result = detectLayoutObjects([makeRaw('s0', 'path', 0, { filled: true })], 0);
    expect(result.objects[0].type).toBe('shape');
    expect(result.counts.shape).toBe(1);
  });
});

describe('detectLayoutObjects — mixed objects', () => {
  const raw = [
    makeRaw('t0', 'text', 0),
    makeRaw('i0', 'ximage', 0),
    makeRaw('s0', 'path', 0, { filled: true }),
    makeRaw('v0', 'path', 0, { stroked: true }),
    makeRaw('w0', 'widget', 0),
  ];

  it('detects 5 objects', () => {
    expect(detectLayoutObjects(raw, 0).objects).toHaveLength(5);
  });

  it('counts are correct', () => {
    const counts = detectLayoutObjects(raw, 0).counts;
    expect(counts.text_block).toBe(1);
    expect(counts.image).toBe(1);
    expect(counts.shape).toBe(1);
    expect(counts.vector_graphics).toBe(1);
    expect(counts.form_widget).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectLayoutObjects — page filtering
// ---------------------------------------------------------------------------

describe('detectLayoutObjects — page filtering', () => {
  const raw = [
    makeRaw('p0o0', 'text', 0),
    makeRaw('p1o0', 'ximage', 1),
    makeRaw('p1o1', 'text', 1),
    makeRaw('p2o0', 'widget', 2),
  ];

  it('returns only page 0 objects when pageIndex=0', () => {
    const result = detectLayoutObjects(raw, 0);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].id).toBe('p0o0');
  });

  it('returns only page 1 objects when pageIndex=1', () => {
    const result = detectLayoutObjects(raw, 1);
    expect(result.objects).toHaveLength(2);
  });

  it('returns empty for pageIndex with no objects', () => {
    expect(detectLayoutObjects(raw, 5).objects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Capabilities: movable / resizable / replaceable
// ---------------------------------------------------------------------------

describe('objectDetection — capabilities by type', () => {
  const types: LayoutObjectType[] = ['text_block', 'image', 'shape', 'vector_graphics', 'form_widget'];

  function detectSingle(rawType: RawContentObject['rawType'], hints?: RawContentObject['hints']) {
    return detectLayoutObjects([makeRaw('x', rawType, 0, hints)], 0).objects[0];
  }

  it('text_block: movable=true, resizable=false, replaceable=false', () => {
    const obj = detectSingle('text');
    expect(obj.movable).toBe(true);
    expect(obj.resizable).toBe(false);
    expect(obj.replaceable).toBe(false);
  });

  it('image: movable=true, resizable=true, replaceable=true', () => {
    const obj = detectSingle('ximage');
    expect(obj.movable).toBe(true);
    expect(obj.resizable).toBe(true);
    expect(obj.replaceable).toBe(true);
  });

  it('shape: movable=true, resizable=true, replaceable=false', () => {
    const obj = detectSingle('path', { filled: true });
    expect(obj.movable).toBe(true);
    expect(obj.resizable).toBe(true);
    expect(obj.replaceable).toBe(false);
  });

  it('vector_graphics: movable=true, resizable=false, replaceable=false', () => {
    const obj = detectSingle('path');
    expect(obj.movable).toBe(true);
    expect(obj.resizable).toBe(false);
    expect(obj.replaceable).toBe(false);
  });

  it('form_widget: movable=false, resizable=false, replaceable=false', () => {
    const obj = detectSingle('widget');
    expect(obj.movable).toBe(false);
    expect(obj.resizable).toBe(false);
    expect(obj.replaceable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

describe('objectDetection — filter helpers', () => {
  const raw = [
    makeRaw('t0', 'text', 0),
    makeRaw('i0', 'ximage', 0),
    makeRaw('s0', 'path', 0, { filled: true }),
    makeRaw('v0', 'path', 0),
    makeRaw('w0', 'widget', 0),
  ];
  const { objects } = detectLayoutObjects(raw, 0);

  it('getObjectsByType(text_block) returns 1 result', () => {
    expect(getObjectsByType(objects, 'text_block')).toHaveLength(1);
  });

  it('getObjectsByType(image) returns 1 result', () => {
    expect(getObjectsByType(objects, 'image')).toHaveLength(1);
  });

  it('getMovableObjects excludes form_widget', () => {
    const movable = getMovableObjects(objects);
    expect(movable.every(o => o.type !== 'form_widget')).toBe(true);
    expect(movable).toHaveLength(4);
  });

  it('getResizableObjects returns only image and shape', () => {
    const resizable = getResizableObjects(objects);
    expect(resizable).toHaveLength(2);
    const types = resizable.map(o => o.type).sort();
    expect(types).toEqual(['image', 'shape']);
  });

  it('getReplaceableObjects returns only image', () => {
    const replaceable = getReplaceableObjects(objects);
    expect(replaceable).toHaveLength(1);
    expect(replaceable[0].type).toBe('image');
  });

  it('findObjectById returns correct object', () => {
    const found = findObjectById(objects, 'i0');
    expect(found).not.toBeNull();
    expect(found!.type).toBe('image');
  });

  it('findObjectById returns null for unknown id', () => {
    expect(findObjectById(objects, 'nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rect utilities
// ---------------------------------------------------------------------------

describe('objectDetection — isValidRect', () => {
  it('positive dimensions → valid', () => {
    expect(isValidRect({ x: 0, y: 0, width: 100, height: 50 })).toBe(true);
  });

  it('zero width → invalid', () => {
    expect(isValidRect({ x: 0, y: 0, width: 0, height: 50 })).toBe(false);
  });

  it('zero height → invalid', () => {
    expect(isValidRect({ x: 0, y: 0, width: 100, height: 0 })).toBe(false);
  });

  it('negative dimensions → invalid', () => {
    expect(isValidRect({ x: 0, y: 0, width: -10, height: 50 })).toBe(false);
  });
});

describe('objectDetection — rectCenter', () => {
  it('center of [0,0,100,50] is (50,25)', () => {
    expect(rectCenter({ x: 0, y: 0, width: 100, height: 50 })).toEqual({ x: 50, y: 25 });
  });

  it('center of [10,20,80,60] is (50,50)', () => {
    expect(rectCenter({ x: 10, y: 20, width: 80, height: 60 })).toEqual({ x: 50, y: 50 });
  });
});

describe('objectDetection — translateRect', () => {
  it('translating by (10,20) offsets x and y', () => {
    const r = translateRect({ x: 5, y: 5, width: 100, height: 50 }, 10, 20);
    expect(r).toEqual({ x: 15, y: 25, width: 100, height: 50 });
  });

  it('translating by (0,0) returns same coordinates', () => {
    const r = translateRect({ x: 5, y: 5, width: 100, height: 50 }, 0, 0);
    expect(r).toEqual({ x: 5, y: 5, width: 100, height: 50 });
  });

  it('negative translation moves rect left/down', () => {
    const r = translateRect({ x: 50, y: 50, width: 100, height: 50 }, -10, -20);
    expect(r.x).toBe(40);
    expect(r.y).toBe(30);
  });
});

describe('objectDetection — rectsOverlap', () => {
  it('clearly overlapping rects return true', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
    )).toBe(true);
  });

  it('non-overlapping rects (side by side) return false', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 60, y: 0, width: 50, height: 50 },
    )).toBe(false);
  });

  it('touching edges only → false (strict overlap)', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
    )).toBe(false);
  });

  it('one rect inside another → true', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 50, y: 50, width: 50, height: 50 },
    )).toBe(true);
  });

  it('completely separate (above/below) → false', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 60, width: 100, height: 50 },
    )).toBe(false);
  });
});

describe('objectDetection — rectContains', () => {
  it('inner fully inside outer → true', () => {
    expect(rectContains(
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 50, y: 50, width: 50, height: 50 },
    )).toBe(true);
  });

  it('inner touching outer boundary → true (on boundary is contained)', () => {
    expect(rectContains(
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 0, y: 0, width: 200, height: 200 },
    )).toBe(true);
  });

  it('inner exceeds outer → false', () => {
    expect(rectContains(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 150, height: 50 },
    )).toBe(false);
  });

  it('inner partially outside → false', () => {
    expect(rectContains(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 80, y: 80, width: 50, height: 50 },
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source reference round-trip
// ---------------------------------------------------------------------------

describe('objectDetection — source reference', () => {
  it('detected object preserves source raw descriptor', () => {
    const raw = makeRaw('img0', 'ximage');
    const result = detectLayoutObjects([raw], 0);
    expect(result.objects[0].source).toBe(raw);
  });

  it('source id matches detected object id', () => {
    const raw = makeRaw('txt0', 'text');
    const { objects } = detectLayoutObjects([raw], 0);
    expect(objects[0].id).toBe(raw.id);
    expect(objects[0].source.id).toBe(raw.id);
  });
});
