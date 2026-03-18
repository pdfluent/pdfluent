// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Alignment Guides — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 6
 *
 * Computes visual alignment guides that appear while dragging objects.
 * Guides snap the object being dragged to:
 *   - Edge alignment with other objects (left, right, top, bottom edges)
 *   - Center alignment with other objects (horizontal, vertical centerlines)
 *   - Page margin alignment (left, right, top, bottom margins)
 *   - Page center alignment (horizontal and vertical page centerlines)
 *
 * Each guide is a line (horizontal or vertical) in PDF page space.
 * The UI layer renders guides as thin coloured overlays on the page canvas.
 *
 * Snap threshold: the dragged object snaps to a guide when its edge or center
 * comes within SNAP_THRESHOLD PDF points of the guide position. The dragged
 * object's position is adjusted by the snap delta.
 *
 * Coordinate system: PDF page space (origin bottom-left, y upward).
 */

import type { LayoutRect } from './objectDetection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum distance (in PDF points) at which snapping activates. */
export const SNAP_THRESHOLD = 6;

/** Standard page margins in PDF points (used for margin guides). */
export const DEFAULT_MARGIN_PT = 36; // 0.5 inch

// ---------------------------------------------------------------------------
// Guide types
// ---------------------------------------------------------------------------

export type GuideOrientation = 'horizontal' | 'vertical';

export type GuideSource =
  | 'object-edge'    // aligned to another object's edge
  | 'object-center'  // aligned to another object's center
  | 'page-margin'    // aligned to a page margin
  | 'page-center';   // aligned to the page center

export interface AlignmentGuide {
  /** Whether the guide is horizontal (y=constant) or vertical (x=constant). */
  readonly orientation: GuideOrientation;
  /**
   * Position of the guide in PDF page space.
   * For horizontal guides: the y coordinate.
   * For vertical guides: the x coordinate.
   */
  readonly position: number;
  /** Which edge/center this guide represents. */
  readonly source: GuideSource;
  /**
   * The snap delta to apply to the dragged object's position.
   * Positive = move right/up; negative = move left/down.
   */
  readonly snapDelta: number;
}

// ---------------------------------------------------------------------------
// Page margin guides
// ---------------------------------------------------------------------------

/**
 * Compute alignment guides for page margins.
 * Returns guides for all four margins and both page centerlines.
 */
export function computePageGuides(
  pageBounds: LayoutRect,
  margin = DEFAULT_MARGIN_PT,
): AlignmentGuide[] {
  const { x, y, width, height } = pageBounds;
  return [
    // Left margin
    { orientation: 'vertical',   position: x + margin,          source: 'page-margin', snapDelta: 0 },
    // Right margin
    { orientation: 'vertical',   position: x + width - margin,  source: 'page-margin', snapDelta: 0 },
    // Bottom margin
    { orientation: 'horizontal', position: y + margin,          source: 'page-margin', snapDelta: 0 },
    // Top margin
    { orientation: 'horizontal', position: y + height - margin, source: 'page-margin', snapDelta: 0 },
    // Vertical page center
    { orientation: 'vertical',   position: x + width / 2,       source: 'page-center', snapDelta: 0 },
    // Horizontal page center
    { orientation: 'horizontal', position: y + height / 2,      source: 'page-center', snapDelta: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Object edge / center guides
// ---------------------------------------------------------------------------

/**
 * Compute alignment guides emitted by a stationary reference object.
 * The dragged object can snap to these guide lines.
 *
 * Emits guides for:
 *   - Left edge, right edge (vertical)
 *   - Bottom edge, top edge (horizontal)
 *   - Horizontal center, vertical center
 */
export function computeObjectGuides(refRect: LayoutRect): AlignmentGuide[] {
  return [
    // Left edge
    { orientation: 'vertical',   position: refRect.x,                          source: 'object-edge',   snapDelta: 0 },
    // Right edge
    { orientation: 'vertical',   position: refRect.x + refRect.width,          source: 'object-edge',   snapDelta: 0 },
    // Bottom edge
    { orientation: 'horizontal', position: refRect.y,                          source: 'object-edge',   snapDelta: 0 },
    // Top edge
    { orientation: 'horizontal', position: refRect.y + refRect.height,         source: 'object-edge',   snapDelta: 0 },
    // Vertical center
    { orientation: 'vertical',   position: refRect.x + refRect.width / 2,     source: 'object-center', snapDelta: 0 },
    // Horizontal center
    { orientation: 'horizontal', position: refRect.y + refRect.height / 2,    source: 'object-center', snapDelta: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Active guide detection
// ---------------------------------------------------------------------------

export interface ActiveGuideResult {
  /** Guides that are currently within snap threshold of the dragged object. */
  readonly activeGuides: AlignmentGuide[];
  /** Snap delta to apply to dx (horizontal snap). */
  readonly snapDx: number;
  /** Snap delta to apply to dy (vertical snap). */
  readonly snapDy: number;
}

/**
 * Compute which guides are active (within snap threshold) for the dragged
 * object at its current position, and the snap deltas to apply.
 *
 * The dragged object's edges and centers are compared against all guide
 * positions. When a match within SNAP_THRESHOLD is found, the snap delta
 * moves the object to exactly align with the guide.
 *
 * Only the nearest snap per axis is applied (to avoid conflicts).
 */
export function computeActiveGuides(
  draggedRect: LayoutRect,
  allGuides: AlignmentGuide[],
  threshold = SNAP_THRESHOLD,
): ActiveGuideResult {
  const activeGuides: AlignmentGuide[] = [];
  let snapDx = 0;
  let snapDy = 0;
  let bestDx = Infinity;
  let bestDy = Infinity;

  // Key positions of the dragged object
  const dragLeft   = draggedRect.x;
  const dragRight  = draggedRect.x + draggedRect.width;
  const dragCenterX = draggedRect.x + draggedRect.width / 2;
  const dragBottom = draggedRect.y;
  const dragTop    = draggedRect.y + draggedRect.height;
  const dragCenterY = draggedRect.y + draggedRect.height / 2;

  for (const guide of allGuides) {
    if (guide.orientation === 'vertical') {
      // Check left edge, right edge, horizontal center against guide.position
      const candidates: { edge: number; delta: number }[] = [
        { edge: dragLeft,    delta: guide.position - dragLeft },
        { edge: dragRight,   delta: guide.position - dragRight },
        { edge: dragCenterX, delta: guide.position - dragCenterX },
      ];
      for (const { delta } of candidates) {
        if (Math.abs(delta) < threshold && Math.abs(delta) < Math.abs(bestDx)) {
          bestDx = delta;
          snapDx = delta;
          activeGuides.push({ ...guide, snapDelta: delta });
        }
      }
    } else {
      // Horizontal guide: check bottom, top, vertical center
      const candidates: { edge: number; delta: number }[] = [
        { edge: dragBottom,  delta: guide.position - dragBottom },
        { edge: dragTop,     delta: guide.position - dragTop },
        { edge: dragCenterY, delta: guide.position - dragCenterY },
      ];
      for (const { delta } of candidates) {
        if (Math.abs(delta) < threshold && Math.abs(delta) < Math.abs(bestDy)) {
          bestDy = delta;
          snapDy = delta;
          activeGuides.push({ ...guide, snapDelta: delta });
        }
      }
    }
  }

  return { activeGuides, snapDx, snapDy };
}

// ---------------------------------------------------------------------------
// All-guides builder
// ---------------------------------------------------------------------------

/**
 * Build the complete set of alignment guides for the current drag operation:
 * page guides + guides from all non-dragged objects on the page.
 */
export function buildAllGuides(
  pageBounds: LayoutRect,
  otherObjectRects: readonly LayoutRect[],
  margin?: number,
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = computePageGuides(pageBounds, margin);
  for (const rect of otherObjectRects) {
    guides.push(...computeObjectGuides(rect));
  }
  return guides;
}
