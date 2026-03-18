// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Resize Engine — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 4
 *
 * Handles resize-handle drag interactions for images and shapes.
 * Computes the updated bounding rect and transform matrix after a resize
 * operation, applying: proportional scaling (optional), minimum size rules,
 * page boundary clamping, and locked-layer protection.
 *
 * Supported object types: images, shapes.
 * Unsupported types (text_block, vector_graphics, form_widget) are blocked.
 *
 * Resize handle convention (8-handle):
 *   nw | n | ne
 *   w  |   | e
 *   sw | s | se
 *
 * For each handle, only specific dimensions change:
 *   Corner (nw/ne/sw/se): both width and height change
 *   Edge n/s: only height changes (top/bottom)
 *   Edge e/w: only width changes (right/left)
 *
 * Transform matrix update:
 *   The object's transform encodes position via (e, f).
 *   When resizing from the left (w/nw/sw) the x-origin shifts.
 *   When resizing from the bottom (sw/s/se in PDF space) the y-origin shifts.
 *   Scale components (a, d) are updated proportionally when keepAspect=true.
 */

import type { LayoutObject, LayoutRect, TransformMatrix } from './objectDetection';
import type { ResizeHandle } from '../components/ObjectSelectionOverlay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum allowed size in PDF points for any dimension after resize. */
export const MIN_OBJECT_SIZE = 10;

// ---------------------------------------------------------------------------
// Resize result
// ---------------------------------------------------------------------------

export type ResizeOutcome =
  | 'resized'                // resize applied successfully
  | 'clamped-min-size'       // resize applied but clamped to minimum size
  | 'clamped-page-boundary'  // resize applied but clamped to page boundary
  | 'blocked-not-resizable'  // object type does not support resizing
  | 'blocked-locked';        // object is in a locked layer

export interface ResizeResult {
  readonly outcome: ResizeOutcome;
  /** Updated bounding rect (null when blocked). */
  readonly newRect: LayoutRect | null;
  /** Updated transform matrix (null when blocked). */
  readonly newMatrix: TransformMatrix | null;
  /** Reason code for tracing/messaging. */
  readonly reasonCode: string;
}

// ---------------------------------------------------------------------------
// Resize options
// ---------------------------------------------------------------------------

export interface ResizeOptions {
  /** Page bounding box in PDF points. */
  readonly pageBounds: LayoutRect;
  /** Whether the object is in a locked layer. */
  readonly locked?: boolean;
  /** Maintain aspect ratio during resize (default: false). */
  readonly keepAspect?: boolean;
}

// ---------------------------------------------------------------------------
// Compute new rect from handle drag
// ---------------------------------------------------------------------------

/**
 * Compute the updated bounding rect given the original rect, the active
 * resize handle, and the drag delta in PDF page space.
 *
 * Delta signs: positive dx = move right, positive dy = move up (PDF space).
 */
export function computeResizeRect(
  originalRect: LayoutRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
): LayoutRect {
  let { x, y, width, height } = originalRect;

  // Apply handle-specific adjustments
  switch (handle) {
    case 'e':
      width += dx;
      break;
    case 'w':
      x += dx;
      width -= dx;
      break;
    case 'n':
      // In PDF space, n = top = increasing y
      y += dy;
      height -= dy;
      break;
    case 's':
      height += dy;
      break;
    case 'ne':
      width += dx;
      y += dy;
      height -= dy;
      break;
    case 'nw':
      x += dx;
      width -= dx;
      y += dy;
      height -= dy;
      break;
    case 'se':
      width += dx;
      height += dy;
      break;
    case 'sw':
      x += dx;
      width -= dx;
      height += dy;
      break;
  }

  // Proportional scaling: apply aspect ratio correction
  if (keepAspect && originalRect.width > 0 && originalRect.height > 0) {
    const aspectRatio = originalRect.width / originalRect.height;
    // For corner handles, use width as the authoritative dimension
    if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
      const scaledHeight = width / aspectRatio;
      const heightDiff = scaledHeight - height;
      // Adjust y for top handles
      if (['nw', 'ne'].includes(handle)) {
        y -= heightDiff;
      }
      height = scaledHeight;
    }
  }

  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Clamp rect to minimum size
// ---------------------------------------------------------------------------

/**
 * Clamp a rect to ensure width and height are at least MIN_OBJECT_SIZE.
 * Returns { rect, clamped } where clamped=true if any dimension was adjusted.
 */
export function clampRectToMinSize(rect: LayoutRect): { rect: LayoutRect; clamped: boolean } {
  let { x, y, width, height } = rect;
  let clamped = false;

  if (width < MIN_OBJECT_SIZE) {
    width = MIN_OBJECT_SIZE;
    clamped = true;
  }
  if (height < MIN_OBJECT_SIZE) {
    height = MIN_OBJECT_SIZE;
    clamped = true;
  }

  return { rect: { x, y, width, height }, clamped };
}

// ---------------------------------------------------------------------------
// Clamp rect to page bounds
// ---------------------------------------------------------------------------

/**
 * Clamp a rect so it does not extend outside the page boundary.
 * Returns { rect, clamped }.
 */
export function clampRectToPage(
  rect: LayoutRect,
  pageBounds: LayoutRect,
): { rect: LayoutRect; clamped: boolean } {
  let { x, y, width, height } = rect;
  let clamped = false;

  // Left
  if (x < pageBounds.x) {
    width -= pageBounds.x - x;
    x = pageBounds.x;
    clamped = true;
  }
  // Bottom
  if (y < pageBounds.y) {
    height -= pageBounds.y - y;
    y = pageBounds.y;
    clamped = true;
  }
  // Right
  if (x + width > pageBounds.x + pageBounds.width) {
    width = pageBounds.x + pageBounds.width - x;
    clamped = true;
  }
  // Top
  if (y + height > pageBounds.y + pageBounds.height) {
    height = pageBounds.y + pageBounds.height - y;
    clamped = true;
  }

  return { rect: { x, y, width, height }, clamped };
}

// ---------------------------------------------------------------------------
// Updated transform matrix from original rect → new rect
// ---------------------------------------------------------------------------

/**
 * Compute the updated transform matrix for the resized object.
 * Updates the scale (a, d) and translation (e, f) components.
 * Shear components (b, c) are preserved unchanged.
 *
 * Scale factors: scaleX = newWidth / originalWidth,  scaleY = newHeight / originalHeight
 * Translation: e' = originalE + (newX - originalX),  f' = originalF + (newY - originalY)
 */
export function computeResizeMatrix(
  originalMatrix: TransformMatrix,
  originalRect: LayoutRect,
  newRect: LayoutRect,
): TransformMatrix {
  const scaleX = originalRect.width > 0 ? newRect.width / originalRect.width : 1;
  const scaleY = originalRect.height > 0 ? newRect.height / originalRect.height : 1;

  const newA = originalMatrix[0] * scaleX;
  const newD = originalMatrix[3] * scaleY;
  const newE = originalMatrix[4] + (newRect.x - originalRect.x);
  const newF = originalMatrix[5] + (newRect.y - originalRect.y);

  return [newA, originalMatrix[1], originalMatrix[2], newD, newE, newF];
}

// ---------------------------------------------------------------------------
// Main resize function
// ---------------------------------------------------------------------------

/**
 * Compute the result of resizing a layout object by dragging a handle.
 *
 * @param obj     The object being resized
 * @param handle  Which resize handle is being dragged
 * @param dx      Horizontal drag delta in PDF points
 * @param dy      Vertical drag delta in PDF points
 * @param options Resize constraints
 */
export function computeResize(
  obj: LayoutObject,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options: ResizeOptions,
): ResizeResult {
  // Non-resizable objects
  if (!obj.resizable) {
    return {
      outcome: 'blocked-not-resizable',
      newRect: null,
      newMatrix: null,
      reasonCode: 'object-type-not-resizable',
    };
  }

  // Locked layer
  if (options.locked === true) {
    return {
      outcome: 'blocked-locked',
      newRect: null,
      newMatrix: null,
      reasonCode: 'layer-locked',
    };
  }

  // Compute new rect from handle drag
  const rawRect = computeResizeRect(obj.rect, handle, dx, dy, options.keepAspect ?? false);

  // Clamp to min size
  const minClamped = clampRectToMinSize(rawRect);

  // Clamp to page bounds
  const pageClamped = clampRectToPage(minClamped.rect, options.pageBounds);

  const finalRect = pageClamped.rect;
  const isClamped = minClamped.clamped || pageClamped.clamped;

  const newMatrix = computeResizeMatrix(obj.matrix, obj.rect, finalRect);

  return {
    outcome: isClamped
      ? (minClamped.clamped ? 'clamped-min-size' : 'clamped-page-boundary')
      : 'resized',
    newRect: finalRect,
    newMatrix,
    reasonCode: isClamped
      ? (minClamped.clamped ? 'clamped-to-min-size' : 'clamped-to-page-boundary')
      : 'ok',
  };
}
