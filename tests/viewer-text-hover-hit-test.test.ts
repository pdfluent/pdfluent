// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { hitTestText, hitTestTextWithPadding, closestParagraph } from '../src/viewer/text/textHoverHitTest';
import { groupDigitalTextSpans } from '../src/viewer/text/textGrouping';
import type { TextSpan } from '../src/core/document';

const PAGE_HEIGHT = 842;
const ZOOM = 1;

function span(text: string, x: number, y: number, w = 60, h = 12): TextSpan {
  return { text, rect: { x, y, width: w, height: h }, fontSize: 12 };
}

/** Convert PDF rect to DOM coords for hit testing (top-left of rect centre). */
function pdfCentreToDom(x: number, y: number, w: number, h: number, zoom = ZOOM): [number, number] {
  const domX = (x + w / 2) * zoom;
  const domY = (PAGE_HEIGHT - (y + h / 2)) * zoom;
  return [domX, domY];
}

// ---------------------------------------------------------------------------
// null/empty structure
// ---------------------------------------------------------------------------

describe('hitTestText — null/empty structure', () => {
  it('returns null for null structure', () => {
    expect(hitTestText(100, 100, null, PAGE_HEIGHT, ZOOM)).toBeNull();
  });

  it('returns null for empty structure', () => {
    const empty = groupDigitalTextSpans([], 0);
    expect(hitTestText(100, 100, empty, PAGE_HEIGHT, ZOOM)).toBeNull();
  });

  it('returns null when zoom is zero', () => {
    const structure = groupDigitalTextSpans([span('hello', 10, 700)], 0);
    expect(hitTestText(100, 100, structure, PAGE_HEIGHT, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Basic paragraph hit
// ---------------------------------------------------------------------------

describe('hitTestText — paragraph hit', () => {
  const structure = groupDigitalTextSpans([
    span('hello world', 10, 700, 100, 12),
  ], 0);

  it('hits the paragraph when pointer is over the text rect centre', () => {
    const [domX, domY] = pdfCentreToDom(10, 700, 100, 12);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result).not.toBeNull();
    expect(result?.paragraph?.kind).toBe('paragraph');
    expect(result?.line.kind).toBe('line');
  });

  it('hits the line within the paragraph', () => {
    const [domX, domY] = pdfCentreToDom(10, 700, 100, 12);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result?.line.spans[0]?.text).toBe('hello world');
  });

  it('returns null when pointer is far outside all text', () => {
    // DOM point at far left, outside rect x:[10..110]
    const result = hitTestText(0, 100, structure, PAGE_HEIGHT, ZOOM);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple paragraphs — correct paragraph selected
// ---------------------------------------------------------------------------

describe('hitTestText — multiple paragraphs', () => {
  const spans: TextSpan[] = [
    span('para1', 10, 700, 80, 12),  // top paragraph
    span('para2', 10, 400, 80, 12),  // bottom paragraph (large gap → separate para)
  ];
  const structure = groupDigitalTextSpans(spans, 0);

  it('has two paragraphs', () => {
    expect(structure.paragraphs).toHaveLength(2);
  });

  it('hits the top paragraph', () => {
    const [domX, domY] = pdfCentreToDom(10, 700, 80, 12);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result?.paragraph?.id).toBe('p0:par0');
  });

  it('hits the bottom paragraph', () => {
    const [domX, domY] = pdfCentreToDom(10, 400, 80, 12);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result?.paragraph?.id).toBe('p0:par1');
  });

  it('returns null between paragraphs', () => {
    // Y = 550 in PDF space = midway between the two paragraphs, outside both rects
    const domY = (PAGE_HEIGHT - 550) * ZOOM;
    const domX = 50;
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Zoom scaling
// ---------------------------------------------------------------------------

describe('hitTestText — zoom scaling', () => {
  const structure = groupDigitalTextSpans([span('text', 10, 700, 80, 12)], 0);

  it('works at zoom 2', () => {
    const zoom = 2;
    const [domX, domY] = pdfCentreToDom(10, 700, 80, 12, zoom);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, zoom);
    expect(result).not.toBeNull();
    expect(result?.paragraph?.kind).toBe('paragraph');
  });

  it('works at zoom 0.5', () => {
    const zoom = 0.5;
    const [domX, domY] = pdfCentreToDom(10, 700, 80, 12, zoom);
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, zoom);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hitTestTextWithPadding
// ---------------------------------------------------------------------------

describe('hitTestTextWithPadding', () => {
  const structure = groupDigitalTextSpans([span('word', 50, 700, 40, 12)], 0);

  it('misses outside rect with zero padding', () => {
    // 5pt to the left of the rect x=50
    const domX = 44 * ZOOM; // pdfX=44 < rect.x=50
    const domY = (PAGE_HEIGHT - 706) * ZOOM;
    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result).toBeNull();
  });

  it('hits outside rect with sufficient padding', () => {
    // 5pt to the left → needs 6pt padding to include it
    const domX = 44 * ZOOM;
    const domY = (PAGE_HEIGHT - 706) * ZOOM;
    const result = hitTestTextWithPadding(domX, domY, structure, PAGE_HEIGHT, ZOOM, 10);
    expect(result).not.toBeNull();
  });

  it('returns null for null structure', () => {
    expect(hitTestTextWithPadding(100, 100, null, PAGE_HEIGHT, ZOOM, 5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// closestParagraph
// ---------------------------------------------------------------------------

describe('closestParagraph', () => {
  const structure = groupDigitalTextSpans([
    span('top', 10, 700, 80, 12),
    span('bottom', 10, 100, 80, 12),
  ], 0);

  it('returns null for empty structure', () => {
    const empty = groupDigitalTextSpans([], 0);
    expect(closestParagraph(100, 100, empty)).toBeNull();
  });

  it('returns the closest paragraph by centre distance', () => {
    // Centre of top paragraph in PDF space
    const topCx = 50, topCy = 706;
    const result = closestParagraph(topCx, topCy, structure);
    expect(result?.id).toBe('p0:par0');
  });

  it('returns the other paragraph when closer to bottom', () => {
    const botCx = 50, botCy = 106;
    const result = closestParagraph(botCx, botCy, structure);
    expect(result?.id).toBe('p0:par1');
  });
});
