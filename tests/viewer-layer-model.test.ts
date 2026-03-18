// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Layer Model — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 7
 *
 * Verified:
 * - buildLayerModel assigns z-order by paint order
 * - Objects without OCG membership go into 'default' layer
 * - Objects with OCG membership go into their respective group
 * - Layer visibility and lock state from ocgState
 * - getZOrder returns correct value
 * - isOnTop: higher z-order means on top
 * - isObjectLocked: true when in a locked layer
 * - isObjectVisible: true when in a visible layer
 * - getObjectsInPaintOrder returns sorted by z-order
 * - Default layer is always visible and unlocked
 * - Empty object list produces a model with only default layer
 */

import { describe, it, expect } from 'vitest';
import {
  buildLayerModel,
  getZOrder,
  isOnTop,
  isObjectLocked,
  isObjectVisible,
  getObjectsInPaintOrder,
  getLayerGroupForObject,
  getObjectsInLayer,
} from '../src/viewer/layout/layoutLayerModel';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX } from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(id: string): LayoutObject {
  return {
    id,
    pageIndex: 0,
    type: 'image',
    rect: { x: 0, y: 0, width: 100, height: 50 },
    matrix: IDENTITY_MATRIX,
    movable: true,
    resizable: true,
    replaceable: true,
    source: { id, pageIndex: 0, rawType: 'ximage', rect: { x: 0, y: 0, width: 100, height: 50 }, matrix: IDENTITY_MATRIX },
  };
}

const objs = [makeObj('a'), makeObj('b'), makeObj('c')]; // paint order: a=0, b=1, c=2

// ---------------------------------------------------------------------------
// buildLayerModel — basic
// ---------------------------------------------------------------------------

describe('layerModel — buildLayerModel basic', () => {
  it('empty objects → model with only default layer', () => {
    const model = buildLayerModel([], [], {}, 0);
    expect(model.layeredObjects).toHaveLength(0);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].id).toBe('default');
  });

  it('all objects go to default layer when no memberships', () => {
    const model = buildLayerModel(objs, [], {}, 0);
    const defaultGroup = model.groups.find(g => g.id === 'default')!;
    expect(defaultGroup.objects).toHaveLength(3);
  });

  it('z-order matches paint order index', () => {
    const model = buildLayerModel(objs, [], {}, 0);
    const lo = model.layeredObjects;
    expect(lo.find(l => l.object.id === 'a')!.zOrder).toBe(0);
    expect(lo.find(l => l.object.id === 'b')!.zOrder).toBe(1);
    expect(lo.find(l => l.object.id === 'c')!.zOrder).toBe(2);
  });

  it('pageIndex is preserved', () => {
    expect(buildLayerModel(objs, [], {}, 3).pageIndex).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildLayerModel — OCG membership
// ---------------------------------------------------------------------------

describe('layerModel — OCG membership', () => {
  const memberships = [
    { objectId: 'a', ocgId: null },   // default
    { objectId: 'b', ocgId: 'ocg1' },
    { objectId: 'c', ocgId: 'ocg1' },
  ];
  const ocgState = {
    ocg1: { visible: true, locked: false, name: 'Background' },
  };

  it('objects with ocgId go into respective group', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    const ocg1 = model.groups.find(g => g.id === 'ocg1')!;
    expect(ocg1.objects).toHaveLength(2);
    expect(ocg1.objects.map(o => o.object.id).sort()).toEqual(['b', 'c']);
  });

  it('default layer has only non-OCG objects', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    const defaultGroup = model.groups.find(g => g.id === 'default')!;
    expect(defaultGroup.objects).toHaveLength(1);
    expect(defaultGroup.objects[0].object.id).toBe('a');
  });

  it('OCG name is set from ocgState', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    const ocg1 = model.groups.find(g => g.id === 'ocg1')!;
    expect(ocg1.name).toBe('Background');
  });

  it('unknown OCG (not in ocgState) defaults to visible=true, locked=false', () => {
    const model = buildLayerModel(
      [makeObj('x')],
      [{ objectId: 'x', ocgId: 'mystery-layer' }],
      {}, // no ocgState entry
    );
    const ml = model.groups.find(g => g.id === 'mystery-layer')!;
    expect(ml.visible).toBe(true);
    expect(ml.locked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer visibility / lock
// ---------------------------------------------------------------------------

describe('layerModel — visibility and lock', () => {
  const memberships = [
    { objectId: 'a', ocgId: null },
    { objectId: 'b', ocgId: 'locked-layer' },
    { objectId: 'c', ocgId: 'hidden-layer' },
  ];
  const ocgState = {
    'locked-layer': { visible: true, locked: true, name: 'Locked' },
    'hidden-layer': { visible: false, locked: false, name: 'Hidden' },
  };

  it('default layer is always visible', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    const defaultGroup = model.groups.find(g => g.id === 'default')!;
    expect(defaultGroup.visible).toBe(true);
  });

  it('default layer is never locked', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    expect(model.groups.find(g => g.id === 'default')!.locked).toBe(false);
  });

  it('isObjectLocked returns true for object in locked layer', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    expect(isObjectLocked(model, 'b')).toBe(true);
  });

  it('isObjectLocked returns false for object in default layer', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    expect(isObjectLocked(model, 'a')).toBe(false);
  });

  it('isObjectVisible returns false for object in hidden layer', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    expect(isObjectVisible(model, 'c')).toBe(false);
  });

  it('isObjectVisible returns true for object in visible layer', () => {
    const model = buildLayerModel(objs, memberships, ocgState);
    expect(isObjectVisible(model, 'a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

describe('layerModel — query helpers', () => {
  const model = buildLayerModel(objs);

  it('getZOrder returns correct z-order for each object', () => {
    expect(getZOrder(model, 'a')).toBe(0);
    expect(getZOrder(model, 'b')).toBe(1);
    expect(getZOrder(model, 'c')).toBe(2);
  });

  it('getZOrder returns -1 for unknown object', () => {
    expect(getZOrder(model, 'nonexistent')).toBe(-1);
  });

  it('isOnTop: c is on top of a (z=2 > z=0)', () => {
    expect(isOnTop(model, 'c', 'a')).toBe(true);
  });

  it('isOnTop: a is NOT on top of c', () => {
    expect(isOnTop(model, 'a', 'c')).toBe(false);
  });

  it('getObjectsInPaintOrder returns sorted list', () => {
    const sorted = getObjectsInPaintOrder(model);
    expect(sorted[0].object.id).toBe('a');
    expect(sorted[1].object.id).toBe('b');
    expect(sorted[2].object.id).toBe('c');
  });

  it('getLayerGroupForObject returns default group for ungrouped object', () => {
    const group = getLayerGroupForObject(model, 'a');
    expect(group!.id).toBe('default');
  });

  it('getLayerGroupForObject returns null for unknown object', () => {
    expect(getLayerGroupForObject(model, 'xyz')).toBeNull();
  });

  it('getObjectsInLayer returns objects in requested layer', () => {
    const layerObjects = getObjectsInLayer(model, 'default');
    expect(layerObjects).toHaveLength(3);
  });

  it('getObjectsInLayer returns empty for nonexistent layer', () => {
    expect(getObjectsInLayer(model, 'nonexistent')).toHaveLength(0);
  });
});
