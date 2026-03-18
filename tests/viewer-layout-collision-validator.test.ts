// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Layout Collision Validator — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 8
 *
 * Verified:
 * - validateCollisions: clean report for valid move within page bounds
 * - checkPageBoundary: error when rect extends outside page
 * - checkMinimumSize: error when width or height below MIN_OBJECT_SIZE
 * - checkObjectOverlap: warning when proposed rect overlaps another object
 * - checkAnnotationAlignment: error when form widget leaves annotation bbox
 * - checkClippingRisk: warning when object extends beyond group bbox
 * - Locked layer: immediate error, no further checks
 * - CollisionReport: hasErrors, hasWarnings, clean flags are correct
 * - Multiple issues can be returned in one report
 * - Form widget check is skipped for non-widget objects
 */

import { describe, it, expect } from 'vitest';
import {
  validateCollisions,
  checkPageBoundary,
  checkMinimumSize,
  checkObjectOverlap,
  checkAnnotationAlignment,
  checkClippingRisk,
} from '../src/viewer/layout/layoutCollisionValidator';
import type { CollisionValidationInput } from '../src/viewer/layout/layoutCollisionValidator';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX, MIN_OBJECT_SIZE } from '../src/viewer/layout/objectDetection';
import { MIN_OBJECT_SIZE as RESIZE_MIN } from '../src/viewer/layout/objectResizeEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE = { x: 0, y: 0, width: 595, height: 842 };

function makeObj(id: string, type: LayoutObject['type'] = 'image', rect = { x: 50, y: 100, width: 100, height: 60 }): LayoutObject {
  return {
    id,
    pageIndex: 0,
    type,
    rect,
    matrix: IDENTITY_MATRIX,
    movable: type !== 'form_widget',
    resizable: type === 'image' || type === 'shape',
    replaceable: type === 'image',
    source: { id, pageIndex: 0, rawType: type === 'image' ? 'ximage' : 'text', rect, matrix: IDENTITY_MATRIX },
  };
}

function makeInput(overrides: Partial<CollisionValidationInput> = {}): CollisionValidationInput {
  return {
    subject: makeObj('obj0'),
    proposedRect: { x: 60, y: 110, width: 100, height: 60 },
    pageBounds: PAGE,
    otherObjects: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CollisionReport structure
// ---------------------------------------------------------------------------

describe('collisionValidator — report structure', () => {
  it('clean report when no issues', () => {
    const report = validateCollisions(makeInput());
    expect(report.clean).toBe(true);
    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.issues).toHaveLength(0);
  });

  it('hasErrors=true when any error present', () => {
    const report = validateCollisions(makeInput({ locked: true }));
    expect(report.hasErrors).toBe(true);
    expect(report.clean).toBe(false);
  });

  it('hasWarnings=true when only warnings present', () => {
    const other = makeObj('other', 'image', { x: 60, y: 110, width: 50, height: 30 }); // overlaps proposed
    const report = validateCollisions(makeInput({ otherObjects: [other] }));
    expect(report.hasWarnings).toBe(true);
    expect(report.hasErrors).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPageBoundary
// ---------------------------------------------------------------------------

describe('collisionValidator — checkPageBoundary', () => {
  it('returns null when rect is within page', () => {
    expect(checkPageBoundary({ x: 10, y: 10, width: 100, height: 50 }, PAGE)).toBeNull();
  });

  it('returns error when rect extends past right edge', () => {
    const issue = checkPageBoundary({ x: 540, y: 0, width: 100, height: 50 }, PAGE);
    expect(issue).not.toBeNull();
    expect(issue!.severity).toBe('error');
    expect(issue!.code).toBe('page-boundary-violation');
  });

  it('returns error when rect extends past top edge', () => {
    const issue = checkPageBoundary({ x: 0, y: 820, width: 100, height: 50 }, PAGE);
    expect(issue!.severity).toBe('error');
  });

  it('returns error when rect extends past left edge (x < 0)', () => {
    const issue = checkPageBoundary({ x: -10, y: 0, width: 50, height: 50 }, PAGE);
    expect(issue!.severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// checkMinimumSize
// ---------------------------------------------------------------------------

describe('collisionValidator — checkMinimumSize', () => {
  it('returns null for valid size', () => {
    expect(checkMinimumSize({ x: 0, y: 0, width: 100, height: 50 })).toBeNull();
  });

  it('returns error when width is too small', () => {
    const issue = checkMinimumSize({ x: 0, y: 0, width: RESIZE_MIN - 1, height: 50 });
    expect(issue!.severity).toBe('error');
    expect(issue!.code).toBe('minimum-size-violation');
  });

  it('returns error when height is too small', () => {
    const issue = checkMinimumSize({ x: 0, y: 0, width: 50, height: 1 });
    expect(issue!.severity).toBe('error');
  });

  it('exactly MIN_OBJECT_SIZE passes', () => {
    expect(checkMinimumSize({ x: 0, y: 0, width: RESIZE_MIN, height: RESIZE_MIN })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkObjectOverlap
// ---------------------------------------------------------------------------

describe('collisionValidator — checkObjectOverlap', () => {
  it('returns empty array when no other objects', () => {
    expect(checkObjectOverlap('a', { x: 0, y: 0, width: 50, height: 50 }, [])).toHaveLength(0);
  });

  it('returns warning when proposed rect overlaps another object', () => {
    const other = makeObj('b', 'image', { x: 30, y: 30, width: 50, height: 50 }); // overlaps (0-50 vs 30-80)
    const issues = checkObjectOverlap('a', { x: 0, y: 0, width: 50, height: 50 }, [other]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe('object-overlap');
    expect(issues[0].involvedIds).toContain('a');
    expect(issues[0].involvedIds).toContain('b');
  });

  it('ignores the subject itself', () => {
    const self = makeObj('a', 'image', { x: 0, y: 0, width: 50, height: 50 });
    const issues = checkObjectOverlap('a', { x: 0, y: 0, width: 50, height: 50 }, [self]);
    expect(issues).toHaveLength(0);
  });

  it('returns one warning per overlapping object', () => {
    const b = makeObj('b', 'image', { x: 10, y: 10, width: 30, height: 30 });
    const c = makeObj('c', 'image', { x: 20, y: 20, width: 30, height: 30 });
    const issues = checkObjectOverlap('a', { x: 0, y: 0, width: 50, height: 50 }, [b, c]);
    expect(issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// checkAnnotationAlignment
// ---------------------------------------------------------------------------

describe('collisionValidator — checkAnnotationAlignment', () => {
  const widget = makeObj('w', 'form_widget');

  it('returns null for non-widget objects', () => {
    const img = makeObj('img', 'image');
    expect(checkAnnotationAlignment(img, { x: 0, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: 200, height: 100 })).toBeNull();
  });

  it('returns null when annotationBBox is null', () => {
    expect(checkAnnotationAlignment(widget, { x: 0, y: 0, width: 50, height: 50 }, null)).toBeNull();
  });

  it('returns null when widget stays within annotation bbox', () => {
    expect(checkAnnotationAlignment(
      widget,
      { x: 10, y: 10, width: 30, height: 20 },
      { x: 0, y: 0, width: 100, height: 50 },
    )).toBeNull();
  });

  it('returns error when widget extends outside annotation bbox', () => {
    const issue = checkAnnotationAlignment(
      widget,
      { x: 80, y: 0, width: 50, height: 20 }, // extends past right edge of bbox
      { x: 0, y: 0, width: 100, height: 50 },
    );
    expect(issue!.severity).toBe('error');
    expect(issue!.code).toBe('annotation-misalignment');
  });
});

// ---------------------------------------------------------------------------
// checkClippingRisk
// ---------------------------------------------------------------------------

describe('collisionValidator — checkClippingRisk', () => {
  const obj = makeObj('x');

  it('returns null when groupBBox is null', () => {
    expect(checkClippingRisk(obj, { x: 0, y: 0, width: 50, height: 50 }, null)).toBeNull();
  });

  it('returns null when object is within group bbox', () => {
    expect(checkClippingRisk(
      obj,
      { x: 10, y: 10, width: 30, height: 20 },
      { x: 0, y: 0, width: 100, height: 50 },
    )).toBeNull();
  });

  it('returns warning when object extends beyond group bbox', () => {
    const issue = checkClippingRisk(
      obj,
      { x: 90, y: 0, width: 50, height: 20 }, // extends past right edge
      { x: 0, y: 0, width: 100, height: 50 },
    );
    expect(issue!.severity).toBe('warning');
    expect(issue!.code).toBe('clipping-risk');
  });
});

// ---------------------------------------------------------------------------
// validateCollisions — locked layer
// ---------------------------------------------------------------------------

describe('collisionValidator — locked layer short-circuit', () => {
  it('locked=true returns single error and no other checks', () => {
    const report = validateCollisions(makeInput({
      locked: true,
      // Also set an out-of-page rect — but it should not be checked
      proposedRect: { x: -100, y: -100, width: 10, height: 10 },
    }));
    expect(report.hasErrors).toBe(true);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('locked-layer');
  });
});

// ---------------------------------------------------------------------------
// validateCollisions — multiple issues
// ---------------------------------------------------------------------------

describe('collisionValidator — multiple issues', () => {
  it('out-of-page AND overlap produce two issues', () => {
    const other = makeObj('other', 'image', { x: 580, y: 0, width: 50, height: 50 }); // overlaps and partly outside page
    const report = validateCollisions({
      subject: makeObj('obj'),
      proposedRect: { x: 560, y: 0, width: 100, height: 50 }, // extends past 595
      pageBounds: PAGE,
      otherObjects: [other],
    });
    expect(report.issues.some(i => i.code === 'page-boundary-violation')).toBe(true);
    expect(report.issues.some(i => i.code === 'object-overlap')).toBe(true);
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(true);
  });
});
