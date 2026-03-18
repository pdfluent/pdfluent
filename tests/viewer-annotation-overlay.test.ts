// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const overlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationOverlay component
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — structure', () => {
  it('has data-testid="annotation-overlay" on svg root', () => {
    expect(overlaySource).toContain('data-testid="annotation-overlay"');
  });

  it('has data-testid="annotation-highlight" on each rect', () => {
    expect(overlaySource).toContain('data-testid="annotation-highlight"');
  });

  it('is an SVG element', () => {
    expect(overlaySource).toContain('<svg');
  });

  it('svg has position: absolute', () => {
    expect(overlaySource).toContain("position: 'absolute'");
  });

  it('svg has pointerEvents: none', () => {
    expect(overlaySource).toContain("pointerEvents: 'none'");
  });

  it('highlight rects use rgba yellow fill', () => {
    expect(overlaySource).toContain('rgba(255, 220, 0, 0.35)');
  });

  it('highlight rects have rx="2" for rounded corners', () => {
    expect(overlaySource).toContain('rx="2"');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay coordinate transform
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — coordinate transform', () => {
  it('computes domX = h.x * zoom', () => {
    expect(overlaySource).toContain('h.x * zoom');
  });

  it('computes domY using pageHeightPt to flip Y axis', () => {
    expect(overlaySource).toContain('pageHeightPt - h.y - h.height');
  });

  it('computes domW = h.width * zoom', () => {
    expect(overlaySource).toContain('h.width * zoom');
  });

  it('computes domH = h.height * zoom', () => {
    expect(overlaySource).toContain('h.height * zoom');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay props
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — props', () => {
  it('accepts highlights prop', () => {
    expect(overlaySource).toContain('highlights');
  });

  it('accepts pageWidthPt prop', () => {
    expect(overlaySource).toContain('pageWidthPt');
  });

  it('accepts pageHeightPt prop', () => {
    expect(overlaySource).toContain('pageHeightPt');
  });

  it('accepts zoom prop', () => {
    expect(overlaySource).toContain('zoom');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — AnnotationOverlay integration
// ---------------------------------------------------------------------------

describe('PageCanvas — AnnotationOverlay integration', () => {
  it('imports AnnotationOverlay', () => {
    expect(pageCanvasSource).toContain('AnnotationOverlay');
  });

  it('renders AnnotationOverlay inside page-view wrapper', () => {
    const wrapperIdx = pageCanvasSource.indexOf('page-view');
    const overlayIdx = pageCanvasSource.indexOf('<AnnotationOverlay', wrapperIdx);
    expect(overlayIdx).toBeGreaterThan(wrapperIdx);
  });

  it('AnnotationOverlay rendered before TextLayer (lower z-index)', () => {
    const overlayIdx = pageCanvasSource.indexOf('<AnnotationOverlay');
    const textLayerIdx = pageCanvasSource.indexOf('<TextLayer');
    expect(overlayIdx).toBeLessThan(textLayerIdx);
  });

  it('passes highlights prop to AnnotationOverlay', () => {
    const overlayIdx = pageCanvasSource.indexOf('<AnnotationOverlay');
    const end = pageCanvasSource.indexOf('/>', overlayIdx);
    const block = pageCanvasSource.slice(overlayIdx, end);
    expect(block).toContain('highlights={highlights}');
  });

  it('accepts highlights prop', () => {
    expect(pageCanvasSource).toContain('highlights');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — activeHighlights wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — activeHighlights wiring', () => {
  it('computes activeHighlights with useMemo', () => {
    expect(viewerAppSource).toContain('activeHighlights');
    expect(viewerAppSource).toContain('useMemo');
  });

  it('guards on activeCommentIdx < 0', () => {
    expect(viewerAppSource).toContain('activeCommentIdx < 0');
  });

  it('checks c.pageIndex !== pageIndex before highlighting', () => {
    expect(viewerAppSource).toContain('c.pageIndex !== pageIndex');
  });

  it('guards against missing rect', () => {
    expect(viewerAppSource).toContain('c.rect');
  });

  it('passes highlights to PageCanvas', () => {
    expect(viewerAppSource).toContain('highlights={activeHighlights}');
  });
});
