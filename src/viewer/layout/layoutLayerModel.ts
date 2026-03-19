// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Layer Model — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 7
 *
 * Detects object stacking order and layer groupings for the layout editor.
 *
 * In PDF, content objects are painted in the order they appear in the
 * content stream. Objects painted later appear on top (higher z-order).
 * Optional Content Groups (OCGs) define named layers that can be
 * toggled visible/invisible.
 *
 * This module:
 *   - Assigns z-order indices based on paint order
 *   - Groups objects into LayerGroup (OCG or implicit default layer)
 *   - Exposes visibility and lock state per layer
 *   - Provides helpers to query relative z-order and find objects in layers
 *
 * Implicit layer: objects without an OCG membership are in the default layer.
 * The default layer is always visible and never locked.
 */

import i18n from '../../i18n';
import type { LayoutObject } from './objectDetection';

// ---------------------------------------------------------------------------
// Z-order
// ---------------------------------------------------------------------------

export interface LayeredObject {
  /** The original layout object. */
  readonly object: LayoutObject;
  /** Z-order: 0 = bottom, higher = on top. Derived from paint order. */
  readonly zOrder: number;
  /** Layer group this object belongs to (null = default implicit layer). */
  readonly layerGroupId: string | null;
}

// ---------------------------------------------------------------------------
// Layer group
// ---------------------------------------------------------------------------

export interface LayerGroup {
  /** Unique identifier for the layer (OCG reference or 'default'). */
  readonly id: string;
  /** Human-readable layer name. */
  readonly name: string;
  /** Whether this layer is currently visible. */
  readonly visible: boolean;
  /** Whether this layer is locked (objects cannot be moved/edited). */
  readonly locked: boolean;
  /** Objects in this layer, ordered by z-order ascending. */
  readonly objects: readonly LayeredObject[];
}

// ---------------------------------------------------------------------------
// Layer model
// ---------------------------------------------------------------------------

export interface LayerModel {
  /** All layered objects, sorted by z-order ascending. */
  readonly layeredObjects: readonly LayeredObject[];
  /** All layer groups (including 'default'). */
  readonly groups: readonly LayerGroup[];
  /** Page index this model covers. */
  readonly pageIndex: number;
}

// ---------------------------------------------------------------------------
// Raw OCG membership hint (from Rust backend)
// ---------------------------------------------------------------------------

export interface OcgMembership {
  /** Object id. */
  readonly objectId: string;
  /** OCG reference name (null = default layer). */
  readonly ocgId: string | null;
}

// ---------------------------------------------------------------------------
// Build layer model from layout objects
// ---------------------------------------------------------------------------

/**
 * Build a LayerModel from a list of layout objects and optional OCG memberships.
 *
 * Object order in `objects` represents paint order (index 0 = bottom of stack).
 * OCG memberships override the default layer assignment.
 *
 * @param objects    Layout objects on this page in paint order
 * @param memberships  Optional OCG membership for each object
 * @param ocgState   Visibility/lock state per OCG id
 * @param pageIndex  Zero-based page index
 */
export function buildLayerModel(
  objects: readonly LayoutObject[],
  memberships: readonly OcgMembership[] = [],
  ocgState: Record<string, { visible: boolean; locked: boolean; name: string }> = {},
  pageIndex = 0,
): LayerModel {
  // Build membership lookup
  const membershipMap = new Map<string, string | null>();
  for (const m of memberships) {
    membershipMap.set(m.objectId, m.ocgId);
  }

  // Assign z-order (paint order = z-order)
  const layeredObjects: LayeredObject[] = objects.map((obj, idx) => ({
    object: obj,
    zOrder: idx,
    layerGroupId: membershipMap.get(obj.id) ?? null,
  }));

  // Group objects by layer
  const groupMap = new Map<string, LayeredObject[]>();
  groupMap.set('default', []);

  for (const lo of layeredObjects) {
    const gid = lo.layerGroupId ?? 'default';
    if (!groupMap.has(gid)) {
      groupMap.set(gid, []);
    }
    groupMap.get(gid)!.push(lo);
  }

  // Build layer group records
  const groups: LayerGroup[] = [];
  for (const [gid, gObjects] of groupMap) {
    if (gid === 'default') {
      groups.push({
        id: 'default',
        name: i18n.t('leftNav.defaultLayer'),
        visible: true,
        locked: false,
        objects: gObjects,
      });
    } else {
      const state = ocgState[gid] ?? { visible: true, locked: false, name: gid };
      groups.push({
        id: gid,
        name: state.name,
        visible: state.visible,
        locked: state.locked,
        objects: gObjects,
      });
    }
  }

  // Sort groups: default first, then by id
  groups.sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    return a.id.localeCompare(b.id);
  });

  return { layeredObjects, groups, pageIndex };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Return the z-order of an object by id, or -1 if not found. */
export function getZOrder(model: LayerModel, objectId: string): number {
  return model.layeredObjects.find(lo => lo.object.id === objectId)?.zOrder ?? -1;
}

/** Return true when objectA is rendered on top of objectB (higher z-order). */
export function isOnTop(model: LayerModel, objectAId: string, objectBId: string): boolean {
  return getZOrder(model, objectAId) > getZOrder(model, objectBId);
}

/** Return the layer group for a given object id, or null if not found. */
export function getLayerGroupForObject(
  model: LayerModel,
  objectId: string,
): LayerGroup | null {
  const lo = model.layeredObjects.find(l => l.object.id === objectId);
  if (!lo) return null;
  const gid = lo.layerGroupId ?? 'default';
  return model.groups.find(g => g.id === gid) ?? null;
}

/** Return true when the object is in a locked layer. */
export function isObjectLocked(model: LayerModel, objectId: string): boolean {
  const group = getLayerGroupForObject(model, objectId);
  return group?.locked ?? false;
}

/** Return true when the object is in a visible layer. */
export function isObjectVisible(model: LayerModel, objectId: string): boolean {
  const group = getLayerGroupForObject(model, objectId);
  return group?.visible ?? true;
}

/** Return all objects in paint order (lowest z-order first). */
export function getObjectsInPaintOrder(model: LayerModel): readonly LayeredObject[] {
  return [...model.layeredObjects].sort((a, b) => a.zOrder - b.zOrder);
}

/** Return objects in a layer by id, sorted by z-order ascending. */
export function getObjectsInLayer(
  model: LayerModel,
  layerId: string,
): readonly LayeredObject[] {
  const group = model.groups.find(g => g.id === layerId);
  if (!group) return [];
  return [...group.objects].sort((a, b) => a.zOrder - b.zOrder);
}
