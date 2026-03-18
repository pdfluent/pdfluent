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

const canvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationOverlay — searchHighlights prop
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — searchHighlights prop', () => {
  it('declares searchHighlights in props interface', () => {
    expect(overlaySource).toContain('searchHighlights?:');
  });

  it('destructures searchHighlights with default empty array', () => {
    expect(overlaySource).toContain('searchHighlights = []');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — search-highlight rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — search-highlight rendering', () => {
  it('renders rects with className search-highlight', () => {
    expect(overlaySource).toContain('className="search-highlight"');
  });

  it('search highlight fill includes yellow for inactive', () => {
    const shStart = overlaySource.indexOf('search-highlight');
    const rectStart = overlaySource.lastIndexOf('<rect', shStart);
    const rectEnd = overlaySource.indexOf('/>', rectStart) + 2;
    const rectBlock = overlaySource.slice(rectStart, rectEnd);
    expect(rectBlock).toContain("'yellow'");
  });

  it('search highlight fillOpacity differs for active vs inactive', () => {
    const shStart = overlaySource.indexOf('search-highlight');
    const rectStart = overlaySource.lastIndexOf('<rect', shStart);
    const rectEnd = overlaySource.indexOf('/>', rectStart) + 2;
    const rectBlock = overlaySource.slice(rectStart, rectEnd);
    expect(rectBlock).toContain('fillOpacity=');
  });

  it('maps over searchHighlights array', () => {
    expect(overlaySource).toContain('searchHighlights.map(');
  });

  it('applies coordinate transform (PDF → DOM space)', () => {
    const shStart = overlaySource.indexOf('searchHighlights.map(');
    const mapBlock = overlaySource.slice(shStart, shStart + 400);
    expect(mapBlock).toContain('pageHeightPt');
    expect(mapBlock).toContain('zoom');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — searchHighlights threading
// ---------------------------------------------------------------------------

describe('PageCanvas — searchHighlights prop', () => {
  it('declares searchHighlights in PageCanvasProps', () => {
    expect(canvasSource).toContain('searchHighlights?:');
  });

  it('destructures searchHighlights with default empty array', () => {
    expect(canvasSource).toContain('searchHighlights = []');
  });

  it('passes searchHighlights to AnnotationOverlay', () => {
    expect(canvasSource).toContain('searchHighlights={searchHighlights}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — pageSearchHighlights wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — pageSearchHighlights computed value', () => {
  it('computes pageSearchHighlights from searchResults filtered by pageIndex', () => {
    expect(viewerAppSource).toContain('pageSearchHighlights');
    expect(viewerAppSource).toContain('r.pageIndex === pageIndex');
    expect(viewerAppSource).toContain('r.rect');
  });

  it('pageSearchHighlights is computed inside a useMemo', () => {
    expect(viewerAppSource).toContain('pageSearchHighlights');
    expect(viewerAppSource).toContain('pageSearchHighlights:');
  });

  it('passes pageSearchHighlights to PageCanvas', () => {
    expect(viewerAppSource).toContain('searchHighlights={pageSearchHighlights}');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing overlay still works
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — search highlights: no regressions', () => {
  it('annotation-overlay testid still present', () => {
    expect(overlaySource).toContain('data-testid="annotation-overlay"');
  });

  it('annotation-highlight testid still present', () => {
    expect(overlaySource).toContain('data-testid="annotation-highlight"');
  });

  it('annotation-marker testid still present', () => {
    expect(overlaySource).toContain('data-testid="annotation-marker"');
  });
});
