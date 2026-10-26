// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-46, J-55: a selected shape moves and resizes, and what reaches
// update_annotation_rect is in PDF space.

import { describe, it, expect } from 'vitest';
import {
  hexToPdfColor,
  isMovableAnnotation,
  MIN_ANNOTATION_SIZE,
  moveRect,
  nudgeForKey,
  resizeRect,
  screenDeltaToPdf,
  toBackendRect,
} from '../annotationGeometry';

const R = { x: 100, y: 100, width: 50, height: 40 };

describe('annotation geometry', () => {
  it('moves without changing size', () => {
    expect(moveRect(R, 10, -5)).toEqual({ x: 110, y: 95, width: 50, height: 40 });
  });

  it('resizes from each corner and keeps the opposite one fixed', () => {
    expect(resizeRect(R, 'se', 10, -10)).toEqual({ x: 100, y: 90, width: 60, height: 50 });
    expect(resizeRect(R, 'nw', -10, 10)).toEqual({ x: 90, y: 100, width: 60, height: 50 });
    expect(resizeRect(R, 'ne', 5, 5)).toEqual({ x: 100, y: 100, width: 55, height: 45 });
    expect(resizeRect(R, 'sw', 5, 5)).toEqual({ x: 105, y: 105, width: 45, height: 35 });
  });

  it('never shrinks below the minimum or turns inside out', () => {
    const r = resizeRect(R, 'se', -500, 500);
    expect(r.width).toBe(MIN_ANNOTATION_SIZE);
    expect(r.height).toBe(MIN_ANNOTATION_SIZE);
    expect(r.x).toBe(100);
  });

  it('turns screen deltas into PDF deltas', () => {
    expect(screenDeltaToPdf(20, 10, 2)).toEqual({ dx: 10, dy: -5 });
  });

  it('nudges with the arrow keys only', () => {
    expect(nudgeForKey('ArrowUp', false)).toEqual({ dx: 0, dy: 1 });
    expect(nudgeForKey('ArrowLeft', true)).toEqual({ dx: -10, dy: 0 });
    expect(nudgeForKey('a', false)).toBeNull();
  });

  it('gives the backend [x0, y0, x1, y1]', () => {
    expect(toBackendRect(R)).toEqual([100, 100, 150, 140]);
  });

  it('lets shapes, stamps and text boxes move, not text markup', () => {
    for (const t of ['square', 'circle', 'line', 'ink', 'stamp', 'freetext']) expect(isMovableAnnotation(t)).toBe(true);
    for (const t of ['highlight', 'underline', 'strikeout', 'text', undefined]) expect(isMovableAnnotation(t)).toBe(false);
  });

  it('reads colour swatches as 0..1 triples', () => {
    expect(hexToPdfColor('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToPdfColor('nope')).toBeNull();
  });
});
