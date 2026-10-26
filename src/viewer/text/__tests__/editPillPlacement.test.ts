// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { placeEditPill, clampPillIntoViewport } from '../editPillPlacement';

const PILL = { width: 450, height: 40 };
const overlaps = (
  a: { top: number; left: number; height: number; width: number },
  b: { top: number; left: number; height: number; width: number },
) =>
  a.left < b.left + b.width && a.left + a.width > b.left &&
  a.top < b.top + b.height && a.top + a.height > b.top;

describe('placeEditPill', () => {
  it('sits above the paragraph when there is room', () => {
    const p = { left: 100, top: 200, width: 300, height: 20 };
    const r = placeEditPill(p, PILL, 12, null);
    expect(r.side).toBe('above');
    expect(r.top).toBe(148);
  });

  it('flips below when the line is near the page top, never overlapping the editor', () => {
    for (const top of [0, 10, 30, 51]) {
      const p = { left: 100, top, width: 300, height: 20 };
      const r = placeEditPill(p, PILL, 12, { width: 794, height: 1123 });
      expect(r.side, `top=${top}`).toBe('below');
      expect(overlaps({ ...r, ...PILL }, p), `top=${top}`).toBe(false);
    }
  });

  it('is exactly at the edge: 52px of room still fits above', () => {
    const r = placeEditPill({ left: 0, top: 52, width: 300, height: 20 }, PILL, 12, null);
    expect(r).toMatchObject({ side: 'above', top: 0 });
  });

  it('clamps horizontally inside a narrow page', () => {
    const p = { left: 500, top: 300, width: 200, height: 20 };
    const r = placeEditPill(p, PILL, 12, { width: 600, height: 800 });
    expect(r.left).toBe(150);
    expect(r.left + PILL.width).toBeLessThanOrEqual(600);
    expect(placeEditPill({ left: 0, top: 300, width: 60, height: 20 }, PILL, 12, null).left).toBe(0);
  });

  it('at small-window zoom the pill never lands on the paragraph', () => {
    // 0.6 zoom page: a first line 30pt from the top.
    const p = { left: 60, top: 18, width: 180, height: 9 };
    const r = placeEditPill(p, PILL, 12, { width: 357, height: 505 });
    expect(overlaps({ ...r, ...PILL }, p)).toBe(false);
  });
});

describe('clampPillIntoViewport', () => {
  // J-40 at 1028x729: the side panel leaves a 470..1028 strip; the page starts at 500.
  const view = { left: 470, right: 1028 };

  it('pulls a pill whose Save end is clipped back into the visible strip', () => {
    const left = clampPillIntoViewport(300, 450, 500, view);
    expect(500 + left + 450).toBeLessThanOrEqual(1028 - 8);
    expect(500 + left).toBeGreaterThanOrEqual(470 + 8);
  });

  it('leaves a pill that is fully visible where it is', () => {
    expect(clampPillIntoViewport(20, 450, 500, view)).toBe(20);
  });

  it('follows a page scrolled sideways (page origin left of the strip)', () => {
    const left = clampPillIntoViewport(100, 450, 300, view);
    expect(300 + left).toBeGreaterThanOrEqual(478);
  });

  it('aligns to the left edge when the strip is narrower than the pill', () => {
    const left = clampPillIntoViewport(50, 450, 500, { left: 470, right: 700 });
    expect(500 + left).toBe(478);
  });
});
