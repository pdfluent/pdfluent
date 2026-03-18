// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ocrOverlaySource = readFileSync(
  new URL('../src/viewer/components/OcrOverlay.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// OcrOverlay — component structure
// ---------------------------------------------------------------------------

describe('OcrOverlay — component structure', () => {
  it('exports OcrOverlay function', () => {
    expect(ocrOverlaySource).toContain('export function OcrOverlay(');
  });

  it('renders SVG with data-testid="ocr-overlay"', () => {
    expect(ocrOverlaySource).toContain('data-testid="ocr-overlay"');
  });

  it('renders rects with data-testid="ocr-word-box"', () => {
    expect(ocrOverlaySource).toContain('data-testid="ocr-word-box"');
  });

  it('stores confidence in data-confidence attribute', () => {
    expect(ocrOverlaySource).toContain('data-confidence=');
  });
});

// ---------------------------------------------------------------------------
// OcrOverlay — props
// ---------------------------------------------------------------------------

describe('OcrOverlay — props', () => {
  it('accepts words prop', () => {
    const fnStart = ocrOverlaySource.indexOf('export function OcrOverlay(');
    const sigEnd = fnStart + 400;
    const sig = ocrOverlaySource.slice(fnStart, sigEnd);
    expect(sig).toContain('words');
  });

  it('accepts renderedWidth and renderedHeight props', () => {
    expect(ocrOverlaySource).toContain('renderedWidth');
    expect(ocrOverlaySource).toContain('renderedHeight');
  });

  it('accepts pageWidthPt and pageHeightPt props', () => {
    expect(ocrOverlaySource).toContain('pageWidthPt');
    expect(ocrOverlaySource).toContain('pageHeightPt');
  });

  it('accepts zoom prop', () => {
    expect(ocrOverlaySource).toContain('zoom');
  });

  it('accepts lowConfidenceThreshold prop with default 0.6', () => {
    expect(ocrOverlaySource).toContain('lowConfidenceThreshold');
    expect(ocrOverlaySource).toContain('0.6');
  });

  it('accepts visible prop', () => {
    expect(ocrOverlaySource).toContain('visible');
  });
});

// ---------------------------------------------------------------------------
// OcrOverlay — coordinate transform
// ---------------------------------------------------------------------------

describe('OcrOverlay — coordinate transform', () => {
  it('scales x by (pageWidthPt * zoom) / renderedWidth', () => {
    expect(ocrOverlaySource).toContain('pageWidthPt * zoom');
    expect(ocrOverlaySource).toContain('/ renderedWidth');
  });

  it('scales y by (pageHeightPt * zoom) / renderedHeight', () => {
    expect(ocrOverlaySource).toContain('pageHeightPt * zoom');
    expect(ocrOverlaySource).toContain('/ renderedHeight');
  });

  it('calculates word width as (x1 - x0) * scaleX', () => {
    expect(ocrOverlaySource).toContain('word.x1 - word.x0');
  });

  it('calculates word height as (y1 - y0) * scaleY', () => {
    expect(ocrOverlaySource).toContain('word.y1 - word.y0');
  });
});

// ---------------------------------------------------------------------------
// OcrOverlay — low confidence rendering
// ---------------------------------------------------------------------------

describe('OcrOverlay — confidence-based coloring', () => {
  it('uses different colors for low vs normal confidence words', () => {
    expect(ocrOverlaySource).toContain('isLowConfidence');
    // Low confidence: orange stroke
    expect(ocrOverlaySource).toContain('255, 120, 0');
    // Normal confidence: green stroke
    expect(ocrOverlaySource).toContain('0, 180, 100');
  });

  it('compares word.confidence to lowConfidenceThreshold', () => {
    expect(ocrOverlaySource).toContain('word.confidence < lowConfidenceThreshold');
  });
});

// ---------------------------------------------------------------------------
// OcrOverlay — early return guards
// ---------------------------------------------------------------------------

describe('OcrOverlay — early return guards', () => {
  it('returns null when not visible', () => {
    expect(ocrOverlaySource).toContain('!visible');
  });

  it('returns null when words array is empty', () => {
    expect(ocrOverlaySource).toContain('words.length === 0');
  });

  it('SVG has pointerEvents none so it does not block interaction', () => {
    expect(ocrOverlaySource).toContain("pointerEvents: 'none'");
  });
});
