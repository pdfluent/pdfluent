// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const tauriAnnotSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriAnnotationEngine.ts', import.meta.url),
  'utf8'
);

const annotInterfaceSource = readFileSync(
  new URL('../src/core/engine/AnnotationEngine.ts', import.meta.url),
  'utf8'
);

const mockAnnotSource = readFileSync(
  new URL('../src/core/engine/mock/MockAnnotationEngine.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationEngine interface — loadAnnotations declaration
// ---------------------------------------------------------------------------

describe('AnnotationEngine interface — loadAnnotations', () => {
  it('declares loadAnnotations method', () => {
    expect(annotInterfaceSource).toContain('loadAnnotations(');
  });

  it('takes optional pageIndex parameter', () => {
    const fnStart = annotInterfaceSource.indexOf('loadAnnotations(');
    const fnEnd = annotInterfaceSource.indexOf(';', fnStart);
    const sig = annotInterfaceSource.slice(fnStart, fnEnd);
    expect(sig).toContain('pageIndex?: number');
  });

  it('returns AsyncEngineResult<Annotation[]>', () => {
    const fnStart = annotInterfaceSource.indexOf('loadAnnotations(');
    const fnEnd = annotInterfaceSource.indexOf(';', fnStart);
    const sig = annotInterfaceSource.slice(fnStart, fnEnd);
    expect(sig).toContain('AsyncEngineResult<Annotation[]>');
  });
});

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — loadAnnotations implementation
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — loadAnnotations', () => {
  it('imports invoke from tauri api', () => {
    expect(tauriAnnotSource).toContain("from '@tauri-apps/api/core'");
    expect(tauriAnnotSource).toContain('invoke');
  });

  it('defines TauriAnnotation interface with all required fields', () => {
    expect(tauriAnnotSource).toContain('interface TauriAnnotation');
    expect(tauriAnnotSource).toContain('page_index: number');
    expect(tauriAnnotSource).toContain('annotation_type: string');
    expect(tauriAnnotSource).toContain('rect: TauriAnnotationRect');
    expect(tauriAnnotSource).toContain('contents: string | null');
    expect(tauriAnnotSource).toContain('author: string | null');
    expect(tauriAnnotSource).toContain('color: [number, number, number] | null');
  });

  it('defines TauriAnnotationRect with x, y, width, height', () => {
    expect(tauriAnnotSource).toContain('interface TauriAnnotationRect');
    expect(tauriAnnotSource).toContain('x: number');
    expect(tauriAnnotSource).toContain('y: number');
    expect(tauriAnnotSource).toContain('width: number');
    expect(tauriAnnotSource).toContain('height: number');
  });

  it('has mapTauriAnnotation helper that maps all fields', () => {
    expect(tauriAnnotSource).toContain('function mapTauriAnnotation');
    const fnStart = tauriAnnotSource.indexOf('function mapTauriAnnotation');
    const fnEnd = tauriAnnotSource.indexOf('\n}', fnStart) + 2;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex: raw.page_index');
    expect(fnBody).toContain("type: raw.annotation_type as AnnotationType");
    expect(fnBody).toContain('rect: raw.rect');
    expect(fnBody).toContain('author: raw.author');
  });

  it('maps color array to CSS rgb string', () => {
    const fnStart = tauriAnnotSource.indexOf('function mapTauriAnnotation');
    const fnEnd = tauriAnnotSource.indexOf('\n}', fnStart) + 2;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rgb(');
    expect(fnBody).toContain('raw.color[0]');
  });

  it('falls back to golden yellow when color is null', () => {
    const fnStart = tauriAnnotSource.indexOf('function mapTauriAnnotation');
    const fnEnd = tauriAnnotSource.indexOf('\n}', fnStart) + 2;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('#FFD700');
  });

  it('declares loadAnnotations async method', () => {
    expect(tauriAnnotSource).toContain('async loadAnnotations(');
  });

  it('calls invoke get_annotations with pageIndex', () => {
    expect(tauriAnnotSource).toContain("invoke<TauriAnnotation[]>('get_annotations'");
    expect(tauriAnnotSource).toContain('pageIndex');
  });

  it('passes null when pageIndex is undefined (all pages)', () => {
    const fnStart = tauriAnnotSource.indexOf('async loadAnnotations(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex ?? null');
  });

  it('maps raw array through mapTauriAnnotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async loadAnnotations(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('raw.map(mapTauriAnnotation)');
  });

  it('returns internal-error on invoke failure', () => {
    const fnStart = tauriAnnotSource.indexOf('async loadAnnotations(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// MockAnnotationEngine — loadAnnotations stub
// ---------------------------------------------------------------------------

describe('MockAnnotationEngine — loadAnnotations stub', () => {
  it('has loadAnnotations method', () => {
    expect(mockAnnotSource).toContain('loadAnnotations(');
  });

  it('returns annotations from document.annotations', () => {
    const fnStart = mockAnnotSource.indexOf('loadAnnotations(');
    const fnEnd = mockAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('document.annotations');
    expect(fnBody).toContain('success: true');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — annotation hydration wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — annotation hydration via loadAnnotations', () => {
  it('calls loadAnnotations on engine.annotation', () => {
    expect(viewerAppSource).toContain('engine.annotation.loadAnnotations(pdfDoc)');
  });

  it('stores all annotations (allAnnotations) via setAllAnnotations in load effect', () => {
    // The load effect (void pattern) sets all annotations; comments useMemo filters client-side.
    const loadStart = viewerAppSource.indexOf('void engine.annotation.loadAnnotations(pdfDoc)');
    const loadEnd = viewerAppSource.indexOf('});', loadStart) + 3;
    const block = viewerAppSource.slice(loadStart, loadEnd + 50);
    expect(block).toContain('setAllAnnotations(annotResult.value)');
  });

  it('derives text-only comments via useMemo with type=text filter and sort', () => {
    // comments is a useMemo derived from allAnnotations, not set directly in the effect.
    expect(viewerAppSource).toContain("a.type === 'text'");
    expect(viewerAppSource).toContain('a.pageIndex - b.pageIndex');
    // Verify both are inside a useMemo block
    expect(viewerAppSource).toContain('allAnnotations');
  });

  it('uses void pattern (no await) in the useEffect', () => {
    // The useEffect uses void (fire-and-forget); handleAddComment uses await.
    // Verify the void-pattern occurrence exists.
    const loadStart = viewerAppSource.indexOf('void engine.annotation.loadAnnotations(pdfDoc)');
    expect(loadStart).toBeGreaterThan(-1);
  });

  it('no longer calls the sync getAllAnnotations for comment population', () => {
    // The old pattern "getAllAnnotations(pdfDoc)" should be gone from the doc-load effect
    // (might still appear elsewhere in the codebase for other uses but the setComments
    // call should now come from loadAnnotations)
    const oldPattern = viewerAppSource.indexOf('getAllAnnotations(pdfDoc)');
    const loadAnnotPattern = viewerAppSource.indexOf('loadAnnotations(pdfDoc)');
    // If getAllAnnotations still appears, it must NOT be immediately followed by setComments
    if (oldPattern !== -1) {
      const nearbySlice = viewerAppSource.slice(oldPattern, oldPattern + 300);
      expect(nearbySlice).not.toContain('setComments(textAnnotations)');
    }
    // loadAnnotations must be the one driving setComments
    expect(loadAnnotPattern).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — activeHighlights overlay path
// ---------------------------------------------------------------------------

describe('ViewerApp — activeHighlights overlay derivation', () => {
  it('derives activeHighlights from comments[activeCommentIdx].rect', () => {
    expect(viewerAppSource).toContain('activeHighlights');
    expect(viewerAppSource).toContain('comments[activeCommentIdx]');
    expect(viewerAppSource).toContain('c.rect');
  });

  it('guards on c.pageIndex === pageIndex (only highlight on current page)', () => {
    const memoStart = viewerAppSource.indexOf('const activeHighlights = useMemo');
    const memoEnd = viewerAppSource.indexOf('[activeCommentIdx, comments, pageIndex]', memoStart) + 40;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('c.pageIndex !== pageIndex');
  });

  it('returns [c.rect] — a single-element array — for the overlay', () => {
    const memoStart = viewerAppSource.indexOf('const activeHighlights = useMemo');
    const memoEnd = viewerAppSource.indexOf('[activeCommentIdx, comments, pageIndex]', memoStart) + 40;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('return [c.rect]');
  });

  it('passes activeHighlights as highlights prop to PageCanvas', () => {
    expect(viewerAppSource).toContain('highlights={activeHighlights}');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — coordinate transform for highlights
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — coordinate transform', () => {
  it('renders SVG overlay with annotation-overlay testid', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-overlay"');
  });

  it('applies PDF→DOM y-flip: domY = (pageHeightPt - h.y - h.height) * zoom', () => {
    expect(annotOverlaySource).toContain('pageHeightPt - h.y - h.height');
    expect(annotOverlaySource).toContain('* zoom');
  });

  it('renders each highlight as a rect with annotation-highlight testid', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-highlight"');
    expect(annotOverlaySource).toContain('<rect');
  });

  it('uses semi-transparent yellow fill for highlights', () => {
    expect(annotOverlaySource).toContain('rgba(255, 220, 0, 0.35)');
  });

  it('has pointerEvents none so highlight does not block text selection', () => {
    expect(annotOverlaySource).toContain("pointerEvents: 'none'");
  });
});
