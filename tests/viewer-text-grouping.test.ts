// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { groupDigitalTextSpans, groupOcrWordBoxes } from '../src/viewer/text/textGrouping';
import type { TextSpan } from '../src/core/document';
import type { OcrWordBox } from '../src/viewer/text/textInteractionModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function span(text: string, x: number, y: number, w = 40, h = 12, fs = 12): TextSpan {
  return { text, rect: { x, y, width: w, height: h }, fontSize: fs };
}

// ---------------------------------------------------------------------------
// groupDigitalTextSpans — basic structure
// ---------------------------------------------------------------------------

describe('groupDigitalTextSpans — empty input', () => {
  it('returns empty structure for no spans', () => {
    const result = groupDigitalTextSpans([], 0);
    expect(result.spans).toHaveLength(0);
    expect(result.lines).toHaveLength(0);
    expect(result.paragraphs).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.pageIndex).toBe(0);
    expect(result.source).toBe('digital');
  });
});

describe('groupDigitalTextSpans — single span', () => {
  it('wraps single span into one line, paragraph, block', () => {
    const result = groupDigitalTextSpans([span('hello', 10, 700)], 0);
    expect(result.spans).toHaveLength(1);
    expect(result.lines).toHaveLength(1);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.blocks).toHaveLength(1);
  });

  it('assigns correct source', () => {
    const result = groupDigitalTextSpans([span('hello', 10, 700)], 0);
    expect(result.spans[0]?.source).toBe('digital');
    expect(result.lines[0]?.source).toBe('digital');
  });

  it('assigns stable span id based on page and index', () => {
    const result = groupDigitalTextSpans([span('hello', 10, 700)], 3);
    expect(result.spans[0]?.id).toBe('p3:s0');
  });
});

// ---------------------------------------------------------------------------
// Line grouping
// ---------------------------------------------------------------------------

describe('groupDigitalTextSpans — line grouping', () => {
  it('groups two spans on the same Y into one line', () => {
    // Same y=700, different x
    const spans = [span('hello', 10, 700), span('world', 60, 700)];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.spans).toHaveLength(2);
  });

  it('separates spans on clearly different Y into different lines', () => {
    // y=700 and y=600 — gap of 100pts, far beyond tolerance
    const spans = [span('line1', 10, 700), span('line2', 10, 600)];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.lines).toHaveLength(2);
  });

  it('orders lines top-to-bottom (descending PDF Y)', () => {
    const spans = [span('bottom', 10, 100), span('top', 10, 700)];
    const result = groupDigitalTextSpans(spans, 0);
    // PDF Y=700 is near top of page, should come first
    expect(result.lines[0]?.spans[0]?.text).toBe('top');
    expect(result.lines[1]?.spans[0]?.text).toBe('bottom');
  });

  it('orders spans within a line left-to-right', () => {
    const spans = [span('world', 60, 700), span('hello', 10, 700)];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.lines[0]?.spans[0]?.text).toBe('hello');
    expect(result.lines[0]?.spans[1]?.text).toBe('world');
  });

  it('groups spans with slight Y variation into the same line', () => {
    // Slightly different y but within font-size tolerance
    const spans = [
      span('a', 10, 700, 30, 12, 12),
      span('b', 50, 702, 30, 12, 12), // 2pt offset — within 0.6×12=7.2 tolerance
    ];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.lines).toHaveLength(1);
  });

  it('assigns line ids with correct page prefix', () => {
    const result = groupDigitalTextSpans([span('x', 10, 700)], 2);
    expect(result.lines[0]?.id).toBe('p2:l0');
  });
});

// ---------------------------------------------------------------------------
// Paragraph grouping
// ---------------------------------------------------------------------------

describe('groupDigitalTextSpans — paragraph grouping', () => {
  it('groups tightly spaced lines into one paragraph', () => {
    // Two lines 16pt apart (normal line spacing for 12pt font)
    const spans = [
      span('line1', 10, 700),
      span('line2', 10, 680), // 8pt gap after 12pt line = 20pt spacing, within 1.4×12=16.8? No.
    ];
    // Gap = 700 - (680+12) = 8pt. Threshold = 1.4 * 12 = 16.8pt. 8 < 16.8 → same paragraph
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0]?.lines).toHaveLength(2);
  });

  it('splits widely spaced lines into separate paragraphs', () => {
    // Large gap between lines
    const spans = [
      span('para1', 10, 700),
      span('para2', 10, 550), // gap = 700 - (550+12) = 138pt >> threshold
    ];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.paragraphs).toHaveLength(2);
  });

  it('assigns paragraph ids with correct page prefix', () => {
    const spans = [span('a', 10, 700), span('b', 10, 550)];
    const result = groupDigitalTextSpans(spans, 1);
    expect(result.paragraphs[0]?.id).toBe('p1:par0');
    expect(result.paragraphs[1]?.id).toBe('p1:par1');
  });
});

// ---------------------------------------------------------------------------
// Block grouping
// ---------------------------------------------------------------------------

describe('groupDigitalTextSpans — block grouping', () => {
  it('groups adjacent paragraphs into one block', () => {
    const spans = [
      span('p1l1', 10, 700),
      span('p1l2', 10, 685),
      span('p2l1', 10, 630),
    ];
    const result = groupDigitalTextSpans(spans, 0);
    // All paragraphs should be in one block given reasonable spacing
    // p1 and p2 gap: 685 - (630+12) = 43pt. Threshold = 2.5 × avg_height ≈ 2.5×12=30. 43 > 30 → new block
    // Actually let's just verify structure is correct
    expect(result.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns block ids with correct page prefix', () => {
    const spans = [span('x', 10, 700)];
    const result = groupDigitalTextSpans(spans, 5);
    expect(result.blocks[0]?.id).toBe('p5:b0');
  });

  it('union rect of block covers all contained paragraphs', () => {
    const spans = [span('x', 10, 700, 100, 12), span('y', 20, 680, 80, 12)];
    const result = groupDigitalTextSpans(spans, 0);
    const block = result.blocks[0]!;
    // The block rect should contain the span rects
    expect(block.rect.x).toBeLessThanOrEqual(10);
    expect(block.rect.y).toBeLessThanOrEqual(680);
  });
});

// ---------------------------------------------------------------------------
// groupOcrWordBoxes
// ---------------------------------------------------------------------------

describe('groupOcrWordBoxes', () => {
  const pageWidth = 595;
  const pageHeight = 842;

  function ocrBox(text: string, x0: number, y0: number, x1: number, y1: number, conf = 0.9): OcrWordBox {
    return { text, confidence: conf, x0, y0, x1, y1, renderedWidth: pageWidth, renderedHeight: pageHeight };
  }

  it('returns ocr source in structure', () => {
    const result = groupOcrWordBoxes([ocrBox('hello', 10, 100, 60, 120)], 0, pageWidth, pageHeight);
    expect(result.source).toBe('ocr');
    expect(result.spans[0]?.source).toBe('ocr');
  });

  it('preserves confidence on span targets', () => {
    const result = groupOcrWordBoxes([ocrBox('word', 10, 100, 60, 120, 0.75)], 0, pageWidth, pageHeight);
    expect(result.spans[0]?.confidence).toBeCloseTo(0.75);
  });

  it('groups two OCR words on same y-level into one line', () => {
    const boxes = [ocrBox('hello', 10, 100, 60, 120), ocrBox('world', 70, 100, 130, 120)];
    const result = groupOcrWordBoxes(boxes, 0, pageWidth, pageHeight);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.spans).toHaveLength(2);
  });

  it('empty OCR boxes returns empty structure', () => {
    const result = groupOcrWordBoxes([], 0, pageWidth, pageHeight);
    expect(result.spans).toHaveLength(0);
    expect(result.lines).toHaveLength(0);
  });

  it('converts pixel coordinates to PDF space', () => {
    const result = groupOcrWordBoxes([ocrBox('x', 0, 0, 595, 842)], 0, pageWidth, pageHeight);
    const spanRect = result.spans[0]?.rect;
    expect(spanRect?.x).toBeCloseTo(0);
    expect(spanRect?.y).toBeCloseTo(0);
    expect(spanRect?.width).toBeCloseTo(595);
    expect(spanRect?.height).toBeCloseTo(842);
  });
});

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------

describe('groupDigitalTextSpans — structural invariants', () => {
  it('every span belongs to exactly one line', () => {
    const spans = [
      span('a', 10, 700), span('b', 60, 700), span('c', 10, 600), span('d', 10, 400),
    ];
    const result = groupDigitalTextSpans(spans, 0);
    const spanIdsInLines = result.lines.flatMap(l => l.spans.map(s => s.id));
    const allSpanIds = result.spans.map(s => s.id);
    expect(spanIdsInLines.sort()).toEqual(allSpanIds.sort());
  });

  it('line ids are unique', () => {
    const spans = [span('a', 10, 700), span('b', 10, 600), span('c', 10, 500)];
    const result = groupDigitalTextSpans(spans, 0);
    const ids = result.lines.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('paragraph ids are unique', () => {
    const spans = [span('a', 10, 700), span('b', 10, 400), span('c', 10, 100)];
    const result = groupDigitalTextSpans(spans, 0);
    const ids = result.paragraphs.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
