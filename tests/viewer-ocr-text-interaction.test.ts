// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * OCR Text Interaction Parity — Batch 8
 *
 * Ensures the text interaction layer works correctly with OCR-derived text:
 * - groupOcrWordBoxes produces a valid PageTextStructure
 * - OCR targets are correctly identified as low-confidence when appropriate
 * - Hit testing works on OCR groupings
 * - Empty/sparse OCR data degrades gracefully (no crash)
 * - Overlay can be passed an OCR structure without errors
 */

import { describe, it, expect } from 'vitest';
import { groupOcrWordBoxes } from '../src/viewer/text/textGrouping';
import { hitTestText } from '../src/viewer/text/textHoverHitTest';
import { isLowConfidence, OCR_LOW_CONFIDENCE_THRESHOLD } from '../src/viewer/text/textInteractionModel';
import type { OcrWordBox } from '../src/viewer/text/textInteractionModel';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const ZOOM = 1;

function ocrBox(text: string, x0: number, y0: number, x1: number, y1: number, conf = 0.9): OcrWordBox {
  return { text, confidence: conf, x0, y0, x1, y1, renderedWidth: PAGE_WIDTH, renderedHeight: PAGE_HEIGHT };
}

// ---------------------------------------------------------------------------
// groupOcrWordBoxes produces valid structure
// ---------------------------------------------------------------------------

describe('OCR text parity — grouping', () => {
  it('produces empty structure for no OCR boxes', () => {
    const result = groupOcrWordBoxes([], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.spans).toHaveLength(0);
    expect(result.lines).toHaveLength(0);
    expect(result.paragraphs).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });

  it('single OCR word produces one span, line, paragraph, block', () => {
    const result = groupOcrWordBoxes([ocrBox('hello', 50, 100, 120, 120)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.spans).toHaveLength(1);
    expect(result.lines).toHaveLength(1);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.blocks).toHaveLength(1);
  });

  it('source is ocr on all targets', () => {
    const result = groupOcrWordBoxes([ocrBox('word', 10, 10, 60, 30)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.source).toBe('ocr');
    expect(result.spans[0]?.source).toBe('ocr');
    expect(result.lines[0]?.source).toBe('ocr');
    expect(result.paragraphs[0]?.source).toBe('ocr');
  });

  it('confidence is preserved on span targets', () => {
    const result = groupOcrWordBoxes([ocrBox('low', 10, 10, 60, 30, 0.45)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.spans[0]?.confidence).toBeCloseTo(0.45);
  });

  it('words on same horizontal line grouped into one line', () => {
    const boxes = [
      ocrBox('hello', 10, 100, 60, 120),
      ocrBox('world', 65, 100, 130, 120),
    ];
    const result = groupOcrWordBoxes(boxes, 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.spans).toHaveLength(2);
  });

  it('words on different lines are in different lines', () => {
    const boxes = [
      ocrBox('line1', 10, 100, 80, 120),
      ocrBox('line2', 10, 200, 80, 220), // y offset of 80px = big gap
    ];
    const result = groupOcrWordBoxes(boxes, 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.lines).toHaveLength(2);
  });

  it('handles sparse OCR (one word per line, many lines)', () => {
    const boxes = Array.from({ length: 10 }, (_, i) =>
      ocrBox(`word${i}`, 10, i * 50, 80, i * 50 + 20),
    );
    const result = groupOcrWordBoxes(boxes, 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.spans).toHaveLength(10);
    expect(result.lines).toHaveLength(10);
    expect(result.paragraphs.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Low confidence detection
// ---------------------------------------------------------------------------

describe('OCR text parity — confidence handling', () => {
  it('isLowConfidence returns true below threshold', () => {
    const result = groupOcrWordBoxes([ocrBox('uncertain', 10, 10, 60, 30, 0.3)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(isLowConfidence(result.spans[0]!)).toBe(true);
  });

  it('isLowConfidence returns false above threshold', () => {
    const result = groupOcrWordBoxes([ocrBox('clear', 10, 10, 60, 30, 0.95)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(isLowConfidence(result.spans[0]!)).toBe(false);
  });

  it('isLowConfidence returns false for digital spans (no confidence)', () => {
    const result = groupOcrWordBoxes([ocrBox('text', 10, 10, 60, 30)], 0, PAGE_WIDTH, PAGE_HEIGHT);
    // change source to digital to test the digital guard
    const digitalSpan = { ...result.spans[0]!, source: 'digital' as const };
    expect(isLowConfidence(digitalSpan)).toBe(false);
  });

  it('OCR_LOW_CONFIDENCE_THRESHOLD is defined and numeric', () => {
    expect(typeof OCR_LOW_CONFIDENCE_THRESHOLD).toBe('number');
    expect(OCR_LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(OCR_LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Hit testing on OCR structure
// ---------------------------------------------------------------------------

describe('OCR text parity — hit testing', () => {
  it('hits paragraph on OCR structure at correct DOM coordinates', () => {
    // Single OCR word at pixel (50,100)-(120,120) in a 595×842 page
    const boxes = [ocrBox('hello', 50, 100, 120, 120)];
    const structure = groupOcrWordBoxes(boxes, 0, PAGE_WIDTH, PAGE_HEIGHT);

    // PDF rect after conversion: x=50, y=842-120=722, w=70, h=20
    // DOM centre: domX=(50+35)*1=85, domY=(842-722-20/2)*1=107 ≈ (842-732)*1=110
    const pdfY = PAGE_HEIGHT - 120; // = 722
    const pdfHeight = 20;
    const domX = (50 + 35) * ZOOM;
    const domY = (PAGE_HEIGHT - pdfY - pdfHeight / 2) * ZOOM; // centre

    const result = hitTestText(domX, domY, structure, PAGE_HEIGHT, ZOOM);
    expect(result).not.toBeNull();
    expect(result?.paragraph?.source).toBe('ocr');
  });

  it('returns null outside all OCR rects', () => {
    const boxes = [ocrBox('word', 50, 100, 120, 120)];
    const structure = groupOcrWordBoxes(boxes, 0, PAGE_WIDTH, PAGE_HEIGHT);
    // Far outside the rect
    const result = hitTestText(0, 0, structure, PAGE_HEIGHT, ZOOM);
    expect(result).toBeNull();
  });

  it('does not crash on empty OCR structure', () => {
    const empty = groupOcrWordBoxes([], 0, PAGE_WIDTH, PAGE_HEIGHT);
    expect(() => hitTestText(100, 100, empty, PAGE_HEIGHT, ZOOM)).not.toThrow();
  });

  it('does not crash on null structure', () => {
    expect(() => hitTestText(100, 100, null, PAGE_HEIGHT, ZOOM)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Span id format consistency with digital
// ---------------------------------------------------------------------------

describe('OCR text parity — id format', () => {
  it('OCR span ids follow p{page}:s{idx} format', () => {
    const result = groupOcrWordBoxes([ocrBox('a', 0, 0, 10, 10)], 3, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.spans[0]?.id).toBe('p3:s0');
  });

  it('OCR paragraph ids follow p{page}:par{idx} format', () => {
    const result = groupOcrWordBoxes([ocrBox('a', 0, 0, 10, 10)], 2, PAGE_WIDTH, PAGE_HEIGHT);
    expect(result.paragraphs[0]?.id).toBe('p2:par0');
  });
});
