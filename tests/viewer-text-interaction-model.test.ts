// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  OCR_LOW_CONFIDENCE_THRESHOLD,
  ocrBoxToPdfRect,
  unionRects,
  pdfRectToDom,
  isSpanTarget,
  isLineTarget,
  isParagraphTarget,
  isBlockTarget,
  isLowConfidence,
  type TextSpanTarget,
  type TextLineTarget,
  type TextParagraphTarget,
  type TextBlockTarget,
  type OcrWordBox,
} from '../src/viewer/text/textInteractionModel';

// ---------------------------------------------------------------------------
// ocrBoxToPdfRect
// ---------------------------------------------------------------------------

describe('ocrBoxToPdfRect', () => {
  const pageWidthPt = 595;
  const pageHeightPt = 842;

  it('converts pixel box to PDF space proportionally', () => {
    const box: OcrWordBox = {
      text: 'hello',
      confidence: 0.9,
      x0: 100, y0: 200, x1: 200, y1: 220,
      renderedWidth: 595, renderedHeight: 842,
    };
    const rect = ocrBoxToPdfRect(box, pageWidthPt, pageHeightPt);
    expect(rect.x).toBeCloseTo(100);
    expect(rect.width).toBeCloseTo(100);
    // y = pageHeightPt - y1 * scaleY = 842 - 220 * 1 = 622
    expect(rect.y).toBeCloseTo(622);
    expect(rect.height).toBeCloseTo(20);
  });

  it('scales correctly when rendered size differs from page size', () => {
    const box: OcrWordBox = {
      text: 'world',
      confidence: 0.8,
      x0: 0, y0: 0, x1: 1190, y1: 1684,
      renderedWidth: 1190, renderedHeight: 1684,
    };
    const rect = ocrBoxToPdfRect(box, pageWidthPt, pageHeightPt);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(595);
    expect(rect.height).toBeCloseTo(842);
  });

  it('handles single-character box near top of page', () => {
    // y0=10, y1=30 in a 842-pixel-high render → height = 20px = 20pt
    const box: OcrWordBox = {
      text: 'A',
      confidence: 1.0,
      x0: 50, y0: 10, x1: 60, y1: 30,
      renderedWidth: 595, renderedHeight: 842,
    };
    const rect = ocrBoxToPdfRect(box, pageWidthPt, pageHeightPt);
    // y = 842 - 30 = 812
    expect(rect.y).toBeCloseTo(812);
    expect(rect.height).toBeCloseTo(20);
  });
});

// ---------------------------------------------------------------------------
// unionRects
// ---------------------------------------------------------------------------

describe('unionRects', () => {
  it('returns null for empty array', () => {
    expect(unionRects([])).toBeNull();
  });

  it('returns the single rect unchanged', () => {
    const r = { x: 10, y: 20, width: 100, height: 30 };
    const result = unionRects([r]);
    expect(result).toEqual(r);
  });

  it('computes the union of two non-overlapping rects', () => {
    const a = { x: 0, y: 0, width: 50, height: 20 };
    const b = { x: 60, y: 5, width: 40, height: 15 };
    const result = unionRects([a, b]);
    expect(result).toEqual({ x: 0, y: 0, width: 100, height: 20 });
  });

  it('computes the union of overlapping rects', () => {
    // a covers x:[10..40], y:[10..20]
    // b covers x:[20..50], y:[5..25]
    // union:   x:[10..50], y:[5..25] → x=10, y=5, width=40, height=20
    const a = { x: 10, y: 10, width: 30, height: 10 };
    const b = { x: 20, y: 5, width: 30, height: 20 };
    const result = unionRects([a, b]);
    expect(result).toEqual({ x: 10, y: 5, width: 40, height: 20 });
  });

  it('handles many rects', () => {
    const rects = [
      { x: 5, y: 5, width: 10, height: 10 },
      { x: 0, y: 0, width: 5, height: 5 },
      { x: 20, y: 20, width: 5, height: 5 },
    ];
    const result = unionRects(rects);
    expect(result).toEqual({ x: 0, y: 0, width: 25, height: 25 });
  });
});

// ---------------------------------------------------------------------------
// pdfRectToDom
// ---------------------------------------------------------------------------

describe('pdfRectToDom', () => {
  it('converts PDF rect to DOM coordinates at zoom 1', () => {
    const rect = { x: 10, y: 100, width: 50, height: 20 };
    const dom = pdfRectToDom(rect, 842, 1);
    // domY = (842 - 100 - 20) * 1 = 722
    expect(dom.left).toBeCloseTo(10);
    expect(dom.top).toBeCloseTo(722);
    expect(dom.width).toBeCloseTo(50);
    expect(dom.height).toBeCloseTo(20);
  });

  it('scales all dimensions by zoom', () => {
    const rect = { x: 10, y: 100, width: 50, height: 20 };
    const dom = pdfRectToDom(rect, 842, 2);
    expect(dom.left).toBeCloseTo(20);
    expect(dom.top).toBeCloseTo(1444);
    expect(dom.width).toBeCloseTo(100);
    expect(dom.height).toBeCloseTo(40);
  });

  it('returns top=0 for rect at the very top of the page', () => {
    const pageHeightPt = 842;
    // A rect at y=(pageHeightPt - height) sits at the top (domY=0)
    const h = 30;
    const rect = { x: 0, y: pageHeightPt - h, width: 100, height: h };
    const dom = pdfRectToDom(rect, pageHeightPt, 1);
    expect(dom.top).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type guards', () => {
  const span: TextSpanTarget = {
    kind: 'span', id: 'p0:s0', source: 'digital',
    text: 'hello', rect: { x: 0, y: 0, width: 50, height: 12 }, fontSize: 12,
  };
  const line: TextLineTarget = {
    kind: 'line', id: 'p0:l0', source: 'digital',
    spans: [span], rect: { x: 0, y: 0, width: 50, height: 12 }, baselineY: 0,
  };
  const para: TextParagraphTarget = {
    kind: 'paragraph', id: 'p0:par0', source: 'digital',
    lines: [line], rect: { x: 0, y: 0, width: 50, height: 12 },
  };
  const block: TextBlockTarget = {
    kind: 'block', id: 'p0:b0', source: 'digital',
    paragraphs: [para], rect: { x: 0, y: 0, width: 50, height: 12 },
  };

  it('isSpanTarget identifies span', () => {
    expect(isSpanTarget(span)).toBe(true);
    expect(isSpanTarget(line)).toBe(false);
    expect(isSpanTarget(para)).toBe(false);
    expect(isSpanTarget(block)).toBe(false);
  });

  it('isLineTarget identifies line', () => {
    expect(isLineTarget(line)).toBe(true);
    expect(isLineTarget(span)).toBe(false);
  });

  it('isParagraphTarget identifies paragraph', () => {
    expect(isParagraphTarget(para)).toBe(true);
    expect(isParagraphTarget(span)).toBe(false);
  });

  it('isBlockTarget identifies block', () => {
    expect(isBlockTarget(block)).toBe(true);
    expect(isBlockTarget(para)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLowConfidence
// ---------------------------------------------------------------------------

describe('isLowConfidence', () => {
  const base: Omit<TextSpanTarget, 'source' | 'confidence'> = {
    kind: 'span', id: 'p0:s0', text: 'word',
    rect: { x: 0, y: 0, width: 40, height: 10 }, fontSize: 10,
  };

  it('returns false for digital text regardless of confidence field', () => {
    expect(isLowConfidence({ ...base, source: 'digital' })).toBe(false);
    expect(isLowConfidence({ ...base, source: 'digital', confidence: 0.1 })).toBe(false);
  });

  it('returns false for OCR text above threshold', () => {
    expect(isLowConfidence({ ...base, source: 'ocr', confidence: OCR_LOW_CONFIDENCE_THRESHOLD + 0.01 })).toBe(false);
    expect(isLowConfidence({ ...base, source: 'ocr', confidence: 1.0 })).toBe(false);
  });

  it('returns true for OCR text below threshold', () => {
    expect(isLowConfidence({ ...base, source: 'ocr', confidence: OCR_LOW_CONFIDENCE_THRESHOLD - 0.01 })).toBe(true);
    expect(isLowConfidence({ ...base, source: 'ocr', confidence: 0.0 })).toBe(true);
  });

  it('returns false for OCR text with missing confidence', () => {
    expect(isLowConfidence({ ...base, source: 'ocr' })).toBe(false);
  });

  it('OCR_LOW_CONFIDENCE_THRESHOLD is 0.6', () => {
    expect(OCR_LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// Source readiness: module exports
// ---------------------------------------------------------------------------

describe('textInteractionModel — module exports', () => {
  it('exports OCR_LOW_CONFIDENCE_THRESHOLD', () => {
    expect(typeof OCR_LOW_CONFIDENCE_THRESHOLD).toBe('number');
  });

  it('exports ocrBoxToPdfRect function', () => {
    expect(typeof ocrBoxToPdfRect).toBe('function');
  });

  it('exports unionRects function', () => {
    expect(typeof unionRects).toBe('function');
  });

  it('exports pdfRectToDom function', () => {
    expect(typeof pdfRectToDom).toBe('function');
  });
});
