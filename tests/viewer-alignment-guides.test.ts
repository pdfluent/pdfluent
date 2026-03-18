// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Alignment Guides — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 6
 *
 * Verified:
 * - computePageGuides returns 6 guides (4 margins + 2 centers)
 * - computeObjectGuides returns 6 guides per object
 * - computeActiveGuides finds guides within snap threshold
 * - computeActiveGuides produces correct snapDx/snapDy
 * - computeActiveGuides finds no guides when object is far from all guides
 * - buildAllGuides aggregates page + object guides
 * - SNAP_THRESHOLD and DEFAULT_MARGIN_PT constants are correct
 * - Edge alignment: dragged left edge aligns to reference left edge
 * - Center alignment: dragged center aligns to reference center
 * - Page center guide is exactly at page center
 */

import { describe, it, expect } from 'vitest';
import {
  computePageGuides,
  computeObjectGuides,
  computeActiveGuides,
  buildAllGuides,
  SNAP_THRESHOLD,
  DEFAULT_MARGIN_PT,
} from '../src/viewer/layout/layoutAlignmentGuides';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('alignmentGuides — constants', () => {
  it('SNAP_THRESHOLD is a positive number', () => {
    expect(SNAP_THRESHOLD).toBeGreaterThan(0);
  });

  it('DEFAULT_MARGIN_PT is positive', () => {
    expect(DEFAULT_MARGIN_PT).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computePageGuides
// ---------------------------------------------------------------------------

const PAGE = { x: 0, y: 0, width: 595, height: 842 };

describe('alignmentGuides — computePageGuides', () => {
  it('returns 6 guides', () => {
    expect(computePageGuides(PAGE)).toHaveLength(6);
  });

  it('includes 2 page-center guides', () => {
    const centers = computePageGuides(PAGE).filter(g => g.source === 'page-center');
    expect(centers).toHaveLength(2);
  });

  it('includes 4 page-margin guides', () => {
    const margins = computePageGuides(PAGE).filter(g => g.source === 'page-margin');
    expect(margins).toHaveLength(4);
  });

  it('vertical page center is at page width / 2', () => {
    const guide = computePageGuides(PAGE).find(g => g.source === 'page-center' && g.orientation === 'vertical');
    expect(guide!.position).toBe(595 / 2);
  });

  it('horizontal page center is at page height / 2', () => {
    const guide = computePageGuides(PAGE).find(g => g.source === 'page-center' && g.orientation === 'horizontal');
    expect(guide!.position).toBe(842 / 2);
  });

  it('left margin guide is at margin distance from left', () => {
    const guide = computePageGuides(PAGE, 36).find(
      g => g.source === 'page-margin' && g.orientation === 'vertical' && g.position === 36,
    );
    expect(guide).toBeDefined();
  });

  it('custom margin overrides DEFAULT_MARGIN_PT', () => {
    const guides = computePageGuides(PAGE, 50);
    const leftMargin = guides.find(g => g.source === 'page-margin' && g.orientation === 'vertical' && g.position === 50);
    expect(leftMargin).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeObjectGuides
// ---------------------------------------------------------------------------

describe('alignmentGuides — computeObjectGuides', () => {
  const ref = { x: 100, y: 200, width: 150, height: 80 };

  it('returns 6 guides', () => {
    expect(computeObjectGuides(ref)).toHaveLength(6);
  });

  it('includes left edge guide at x', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'vertical' && g.position === 100 && g.source === 'object-edge');
    expect(g).toBeDefined();
  });

  it('includes right edge guide at x + width', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'vertical' && g.position === 250 && g.source === 'object-edge');
    expect(g).toBeDefined();
  });

  it('includes vertical center guide', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'vertical' && g.source === 'object-center');
    expect(g!.position).toBeCloseTo(175); // 100 + 150/2
  });

  it('includes bottom edge guide at y', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'horizontal' && g.position === 200 && g.source === 'object-edge');
    expect(g).toBeDefined();
  });

  it('includes top edge guide at y + height', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'horizontal' && g.position === 280 && g.source === 'object-edge');
    expect(g).toBeDefined();
  });

  it('includes horizontal center guide', () => {
    const g = computeObjectGuides(ref).find(g => g.orientation === 'horizontal' && g.source === 'object-center');
    expect(g!.position).toBeCloseTo(240); // 200 + 80/2
  });
});

// ---------------------------------------------------------------------------
// computeActiveGuides — snapping
// ---------------------------------------------------------------------------

describe('alignmentGuides — computeActiveGuides snapping', () => {
  it('returns no active guides when object is far from all guides', () => {
    // Page guides at 36, 559, 421, 806, 297.5, 421 — dragged at 300, 400
    const guides = computePageGuides(PAGE, 36);
    const dragged = { x: 300, y: 400, width: 100, height: 60 };
    const result = computeActiveGuides(dragged, guides);
    // Some edges might be close to page center (297.5 = center x). Let's use a dragged far from all guides
    // dragged left=300, center=350, right=400. No guide is within SNAP_THRESHOLD=6 of these.
    // Actually 297.5 is within SNAP_THRESHOLD of 300. Let me place it truly far from guides.
    const dragged2 = { x: 120, y: 70, width: 80, height: 40 };
    const result2 = computeActiveGuides(dragged2, guides);
    // left=120, right=200, center=160. Guide at 36+84=..no, margin=36 for vertical; dragged has no edges near 36,559,297.5
    // Check manually: 120-6=114, 120+6=126 — none of 36,559,297.5 fall in this range.
    expect(result2.snapDx).toBe(0);
    expect(result2.snapDy).toBe(0);
  });

  it('snaps left edge to vertical guide when within threshold', () => {
    // Guide at x=100. Dragged with left at x=103 (within SNAP_THRESHOLD=6)
    const guides = [{ orientation: 'vertical' as const, position: 100, source: 'object-edge' as const, snapDelta: 0 }];
    const dragged = { x: 103, y: 200, width: 100, height: 50 };
    const result = computeActiveGuides(dragged, guides);
    expect(result.activeGuides.length).toBeGreaterThan(0);
    expect(result.snapDx).toBe(-3); // guide=100 - dragLeft=103 = -3
  });

  it('snaps right edge to vertical guide', () => {
    // Guide at x=200. Dragged right edge at x=202 (within threshold)
    const guides = [{ orientation: 'vertical' as const, position: 200, source: 'object-edge' as const, snapDelta: 0 }];
    const dragged = { x: 100, y: 200, width: 102, height: 50 }; // right = 202
    const result = computeActiveGuides(dragged, guides);
    expect(result.snapDx).toBe(-2); // 200 - 202 = -2
  });

  it('snaps bottom edge to horizontal guide', () => {
    const guides = [{ orientation: 'horizontal' as const, position: 200, source: 'object-edge' as const, snapDelta: 0 }];
    const dragged = { x: 0, y: 204, width: 100, height: 50 }; // bottom=204, within threshold
    const result = computeActiveGuides(dragged, guides);
    expect(result.snapDy).toBe(-4); // 200 - 204 = -4
  });

  it('does not snap when outside threshold', () => {
    const guides = [{ orientation: 'vertical' as const, position: 100, source: 'object-edge' as const, snapDelta: 0 }];
    const dragged = { x: 110, y: 200, width: 100, height: 50 }; // left=110, dist=10 > 6
    const result = computeActiveGuides(dragged, guides, SNAP_THRESHOLD);
    expect(result.snapDx).toBe(0);
  });

  it('center alignment: dragged center snaps to guide', () => {
    // Guide at x=150. Dragged center at x=153 (width=100, x=103)
    const guides = [{ orientation: 'vertical' as const, position: 150, source: 'object-center' as const, snapDelta: 0 }];
    const dragged = { x: 103, y: 200, width: 100, height: 50 }; // center = 153
    const result = computeActiveGuides(dragged, guides);
    expect(result.snapDx).toBe(-3); // 150 - 153 = -3
  });
});

// ---------------------------------------------------------------------------
// buildAllGuides
// ---------------------------------------------------------------------------

describe('alignmentGuides — buildAllGuides', () => {
  it('includes page guides', () => {
    const guides = buildAllGuides(PAGE, []);
    expect(guides.some(g => g.source === 'page-center')).toBe(true);
  });

  it('includes object guides for each object', () => {
    const objects = [
      { x: 50, y: 100, width: 100, height: 50 },
      { x: 300, y: 400, width: 80, height: 40 },
    ];
    const guides = buildAllGuides(PAGE, objects);
    const objectGuides = guides.filter(g => g.source === 'object-edge' || g.source === 'object-center');
    expect(objectGuides).toHaveLength(12); // 6 per object × 2
  });

  it('total guides = 6 page + 6n object', () => {
    const objects = [{ x: 10, y: 10, width: 50, height: 30 }];
    expect(buildAllGuides(PAGE, objects)).toHaveLength(12);
  });

  it('no objects → only 6 page guides', () => {
    expect(buildAllGuides(PAGE, [])).toHaveLength(6);
  });
});
