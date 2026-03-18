// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const annotOverlaySource = readFileSync(
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
// AnnotationOverlay — AnnotationMark interface
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — AnnotationMark interface', () => {
  it('defines AnnotationMark with id and rect', () => {
    expect(annotOverlaySource).toContain('interface AnnotationMark');
    expect(annotOverlaySource).toContain('id: string');
    expect(annotOverlaySource).toContain('rect: { x: number; y: number; width: number; height: number }');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — new props
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — clickableAnnotations + onAnnotationClick props', () => {
  it('declares clickableAnnotations optional prop', () => {
    const ifaceStart = annotOverlaySource.indexOf('interface AnnotationOverlayProps');
    const ifaceEnd = annotOverlaySource.indexOf('\n}', ifaceStart) + 2;
    const iface = annotOverlaySource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('clickableAnnotations?: AnnotationMark[]');
  });

  it('declares onAnnotationClick optional prop', () => {
    const ifaceStart = annotOverlaySource.indexOf('interface AnnotationOverlayProps');
    const ifaceEnd = annotOverlaySource.indexOf('\n}', ifaceStart) + 2;
    const iface = annotOverlaySource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onAnnotationClick?: (annotationId: string) => void');
  });

  it('destructures clickableAnnotations with default empty array', () => {
    expect(annotOverlaySource).toContain('clickableAnnotations = []');
  });

  it('destructures onAnnotationClick', () => {
    expect(annotOverlaySource).toContain('onAnnotationClick');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — marker rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — annotation marker rendering', () => {
  it('renders a rect with data-testid="annotation-marker"', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-marker"');
  });

  it('applies same PDF→DOM y-flip to marker rects', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    // Look backward for coordinate transform — use a wider window because type-specific
    // branching and hover state declarations add more code between coordinates and first marker.
    const precedingSlice = annotOverlaySource.slice(Math.max(0, markerStart - 900), markerStart);
    expect(precedingSlice).toContain('mark.rect.y');
    expect(precedingSlice).toContain('mark.rect.height');
    expect(precedingSlice).toContain('pageHeightPt -');
  });

  it('calls onAnnotationClick with mark.id on click', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    expect(markerEl).toContain('onAnnotationClick?.(mark.id)');
  });

  it('enables pointer events on individual marker rects', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    expect(markerEl).toContain("pointerEvents: 'auto'");
  });

  it('sets cursor pointer on marker rects', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    expect(markerEl).toContain("cursor: 'pointer'");
  });

  it('uses a distinct fill color from the active highlight', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    // Must NOT use the active highlight color
    expect(markerEl).not.toContain('rgba(255, 220, 0, 0.35)');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — layer ordering (markers below highlights)
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — layer ordering', () => {
  it('renders clickable markers before (below) highlights in the SVG', () => {
    // In SVG, later elements are on top. markers must appear first.
    const markerPos = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const highlightPos = annotOverlaySource.indexOf('data-testid="annotation-highlight"');
    expect(markerPos).toBeGreaterThan(-1);
    expect(highlightPos).toBeGreaterThan(-1);
    expect(markerPos).toBeLessThan(highlightPos);
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — backward-compat: existing highlight tests still pass
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — backward-compat: highlights unchanged', () => {
  it('SVG container still has pointerEvents: none', () => {
    expect(annotOverlaySource).toContain("pointerEvents: 'none'");
  });

  it('active highlight still uses rgba(255, 220, 0, 0.35)', () => {
    expect(annotOverlaySource).toContain('rgba(255, 220, 0, 0.35)');
  });

  it('active highlight rect still has annotation-highlight testid', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-highlight"');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — new props forwarded to AnnotationOverlay
// ---------------------------------------------------------------------------

describe('PageCanvas — clickableAnnotations + onAnnotationClick forwarding', () => {
  it('declares clickableAnnotations prop', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('clickableAnnotations?:');
  });

  it('declares onAnnotationClick prop', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onAnnotationClick?: (annotationId: string) => void');
  });

  it('destructures clickableAnnotations with empty default', () => {
    expect(pageCanvasSource).toContain('clickableAnnotations = []');
  });

  it('passes clickableAnnotations to AnnotationOverlay', () => {
    const overlayStart = pageCanvasSource.indexOf('<AnnotationOverlay');
    const overlayEnd = pageCanvasSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = pageCanvasSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('clickableAnnotations={clickableAnnotations}');
  });

  it('passes onAnnotationClick to AnnotationOverlay', () => {
    const overlayStart = pageCanvasSource.indexOf('<AnnotationOverlay');
    const overlayEnd = pageCanvasSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = pageCanvasSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('onAnnotationClick={onAnnotationClick}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — pageAnnotationMarks useMemo
// ---------------------------------------------------------------------------

describe('ViewerApp — pageAnnotationMarks useMemo', () => {
  it('defines pageAnnotationMarks as useMemo', () => {
    expect(viewerAppSource).toContain('const pageAnnotationMarks = useMemo(');
  });

  it('filters to current page (a.pageIndex === pageIndex)', () => {
    const memoStart = viewerAppSource.indexOf('const pageAnnotationMarks = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[allAnnotations, pageIndex]', memoStart) + 28;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('a.pageIndex === pageIndex');
  });

  it('filters out annotations without rect', () => {
    const memoStart = viewerAppSource.indexOf('const pageAnnotationMarks = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[allAnnotations, pageIndex]', memoStart) + 28;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('a.rect');
  });

  it('maps to { id, rect } shape', () => {
    const memoStart = viewerAppSource.indexOf('const pageAnnotationMarks = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[allAnnotations, pageIndex]', memoStart) + 28;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('id: a.id');
    expect(memoBody).toContain('rect: a.rect');
  });

  it('depends on [allAnnotations, pageIndex]', () => {
    expect(viewerAppSource).toContain('[allAnnotations, pageIndex]');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleAnnotationClick
// ---------------------------------------------------------------------------

describe('ViewerApp — handleAnnotationClick', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleAnnotationClick = useCallback(');
  });

  it('finds text comment by annotationId using findIndex (for type=text annotations)', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.findIndex(c => c.id === annotationId)');
  });

  it('returns early when annotation is not found in allAnnotations', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (!ann) return');
  });

  it('calls setActiveCommentIdx with the found index', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveCommentIdx(idx)');
  });

  it('switches mode to review when not already in review mode', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("mode !== 'review'");
    expect(fnBody).toContain("setMode('review')");
  });

  it('passes handleAnnotationClick to PageCanvas as onAnnotationClick', () => {
    expect(viewerAppSource).toContain('onAnnotationClick={handleAnnotationClick}');
  });

  it('passes pageAnnotationMarks to PageCanvas as clickableAnnotations', () => {
    expect(viewerAppSource).toContain('clickableAnnotations={pageAnnotationMarks}');
  });
});

// ---------------------------------------------------------------------------
// No-regression: existing overlay and annotation paths still intact
// ---------------------------------------------------------------------------

describe('No-regression — existing annotation overlay paths', () => {
  it('activeHighlights useMemo still defined', () => {
    expect(viewerAppSource).toContain('const activeHighlights = useMemo(');
  });

  it('highlights={activeHighlights} still passed to PageCanvas', () => {
    expect(viewerAppSource).toContain('highlights={activeHighlights}');
  });

  it('handleCommentNav still defined', () => {
    expect(viewerAppSource).toContain('const handleCommentNav = useCallback(');
  });

  it('handleDeleteComment still defined', () => {
    expect(viewerAppSource).toContain('const handleDeleteComment = useCallback(');
  });

  it('onDeleteComment still wired to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteComment={handleDeleteComment}');
  });
});
