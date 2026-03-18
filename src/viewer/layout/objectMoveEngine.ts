// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Move Engine — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 3
 *
 * Handles drag-to-move interactions for layout objects.
 * Computes the updated position for a layout object after a drag operation,
 * validates the new position against page boundaries and locked content,
 * and produces a MoveResult that the mutation backend uses to update the
 * PDF content stream's transformation matrix.
 *
 * Design:
 *   - All coordinates in PDF page space (points, origin bottom-left).
 *   - Drag delta is expressed in PDF page space (caller converts from DOM).
 *   - The updated transform matrix is computed by translating the original.
 *   - Collision awareness: object cannot be moved outside the page boundary.
 *   - Protected layers: objects in locked layers cannot be moved.
 *
 * Transform matrix update:
 *   Original matrix M = [a, b, c, d, e, f]
 *   Translated by (dx, dy): e' = e + dx,  f' = f + dy
 *   All other components are unchanged.
 */

import type { LayoutObject, LayoutRect, TransformMatrix } from './objectDetection';

// ---------------------------------------------------------------------------
// Move result
// ---------------------------------------------------------------------------

export type MoveOutcome =
  | 'moved'            // move applied successfully
  | 'clamped'          // move applied but clamped to page boundary
  | 'blocked-locked'   // object is in a locked/protected layer
  | 'blocked-non-movable'; // object type does not support moving

export interface MoveResult {
  readonly outcome: MoveOutcome;
  /** Updated bounding rect in PDF page space (null when blocked). */
  readonly newRect: LayoutRect | null;
  /** Updated transform matrix (null when blocked). */
  readonly newMatrix: TransformMatrix | null;
  /** Actual delta applied (may differ from requested when clamped). */
  readonly appliedDelta: { dx: number; dy: number };
  /** Human-readable reason code for blocked or clamped results. */
  readonly reasonCode: string;
}

// ---------------------------------------------------------------------------
// Move options
// ---------------------------------------------------------------------------

export interface MoveOptions {
  /**
   * Page bounding box in PDF points.
   * Object cannot move outside this area. Typically { x:0, y:0, width:W, height:H }.
   */
  readonly pageBounds: LayoutRect;
  /**
   * Whether the object is in a locked layer.
   * When true, all moves are blocked regardless of other options.
   */
  readonly locked?: boolean;
  /**
   * Snap grid size in PDF points. When provided, delta is snapped to the grid.
   * Set to 0 or omit for free movement.
   */
  readonly snapGrid?: number;
}

// ---------------------------------------------------------------------------
// Transform matrix translation
// ---------------------------------------------------------------------------

/**
 * Translate an affine transform matrix by (dx, dy).
 * Components e and f are the translation components.
 */
export function translateMatrix(
  matrix: TransformMatrix,
  dx: number,
  dy: number,
): TransformMatrix {
  return [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4] + dx, matrix[5] + dy];
}

// ---------------------------------------------------------------------------
// Snap to grid
// ---------------------------------------------------------------------------

/**
 * Snap a value to the nearest grid increment.
 * Returns the value unchanged when gridSize <= 0.
 */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

// ---------------------------------------------------------------------------
// Clamp delta to page bounds
// ---------------------------------------------------------------------------

/**
 * Clamp the requested (dx, dy) so that the moved rect stays within pageBounds.
 * Returns the clamped delta.
 */
export function clampDeltaToPage(
  rect: LayoutRect,
  dx: number,
  dy: number,
  pageBounds: LayoutRect,
): { dx: number; dy: number; clamped: boolean } {
  let clampedDx = dx;
  let clampedDy = dy;
  let clamped = false;

  // Left boundary
  if (rect.x + dx < pageBounds.x) {
    clampedDx = pageBounds.x - rect.x;
    clamped = true;
  }
  // Right boundary
  if (rect.x + rect.width + dx > pageBounds.x + pageBounds.width) {
    clampedDx = pageBounds.x + pageBounds.width - rect.x - rect.width;
    clamped = true;
  }
  // Bottom boundary (PDF y increases upward)
  if (rect.y + dy < pageBounds.y) {
    clampedDy = pageBounds.y - rect.y;
    clamped = true;
  }
  // Top boundary
  if (rect.y + rect.height + dy > pageBounds.y + pageBounds.height) {
    clampedDy = pageBounds.y + pageBounds.height - rect.y - rect.height;
    clamped = true;
  }

  return { dx: clampedDx, dy: clampedDy, clamped };
}

// ---------------------------------------------------------------------------
// Main move function
// ---------------------------------------------------------------------------

/**
 * Compute the result of moving a layout object by (dx, dy) in PDF page space.
 *
 * @param obj      The object to move
 * @param dx       Requested horizontal delta in PDF points
 * @param dy       Requested vertical delta in PDF points
 * @param options  Page bounds, lock state, and snap settings
 */
export function computeMove(
  obj: LayoutObject,
  dx: number,
  dy: number,
  options: MoveOptions,
): MoveResult {
  // Non-movable objects
  if (!obj.movable) {
    return {
      outcome: 'blocked-non-movable',
      newRect: null,
      newMatrix: null,
      appliedDelta: { dx: 0, dy: 0 },
      reasonCode: 'object-type-not-movable',
    };
  }

  // Locked layer
  if (options.locked === true) {
    return {
      outcome: 'blocked-locked',
      newRect: null,
      newMatrix: null,
      appliedDelta: { dx: 0, dy: 0 },
      reasonCode: 'layer-locked',
    };
  }

  // Apply snap grid
  const snappedDx = snapToGrid(dx, options.snapGrid ?? 0);
  const snappedDy = snapToGrid(dy, options.snapGrid ?? 0);

  // Clamp to page bounds
  const clamped = clampDeltaToPage(obj.rect, snappedDx, snappedDy, options.pageBounds);

  const newRect: LayoutRect = {
    x: obj.rect.x + clamped.dx,
    y: obj.rect.y + clamped.dy,
    width: obj.rect.width,
    height: obj.rect.height,
  };

  const newMatrix = translateMatrix(obj.matrix, clamped.dx, clamped.dy);

  return {
    outcome: clamped.clamped ? 'clamped' : 'moved',
    newRect,
    newMatrix,
    appliedDelta: { dx: clamped.dx, dy: clamped.dy },
    reasonCode: clamped.clamped ? 'clamped-to-page-boundary' : 'ok',
  };
}

// ---------------------------------------------------------------------------
// Move session — tracks a drag from start to end
// ---------------------------------------------------------------------------

export interface MoveSession {
  /** The object being dragged. */
  readonly objectId: string;
  /** Object rect at drag start. */
  readonly startRect: LayoutRect;
  /** Accumulated total delta since drag start. */
  totalDx: number;
  totalDy: number;
  /** Whether the session has produced at least one clamped result. */
  wasClamped: boolean;
}

/** Start a new move session for the given object. */
export function beginMoveSession(obj: LayoutObject): MoveSession {
  return {
    objectId: obj.id,
    startRect: { ...obj.rect },
    totalDx: 0,
    totalDy: 0,
    wasClamped: false,
  };
}

/**
 * Update a move session with a new incremental drag delta.
 * Returns the MoveResult for the latest step.
 * The session accumulates total delta from the drag start.
 */
export function updateMoveSession(
  session: MoveSession,
  obj: LayoutObject,
  incrementalDx: number,
  incrementalDy: number,
  options: MoveOptions,
): MoveResult {
  session.totalDx += incrementalDx;
  session.totalDy += incrementalDy;
  const result = computeMove(obj, incrementalDx, incrementalDy, options);
  if (result.outcome === 'clamped') {
    session.wasClamped = true;
  }
  return result;
}
