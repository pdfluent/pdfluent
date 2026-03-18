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

// ---------------------------------------------------------------------------
// AnnotationOverlay — hoveredMarkId state
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — hoveredMarkId state', () => {
  it('imports useState from react', () => {
    expect(annotOverlaySource).toContain("from 'react'");
    expect(annotOverlaySource).toContain('useState');
  });

  it('declares hoveredMarkId state initialised to null', () => {
    expect(annotOverlaySource).toContain('const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null)');
  });

  it('computes isHovered per annotation marker', () => {
    expect(annotOverlaySource).toContain('isHovered = mark.id === hoveredMarkId');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — hover handlers on annotation markers
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — hover handlers on markers', () => {
  it('sets hoveredMarkId onMouseEnter', () => {
    expect(annotOverlaySource).toContain('setHoveredMarkId(mark.id)');
  });

  it('clears hoveredMarkId onMouseLeave', () => {
    expect(annotOverlaySource).toContain('setHoveredMarkId(null)');
  });

  it('uses shared hoverHandlers spread across marker elements', () => {
    expect(annotOverlaySource).toContain('hoverHandlers');
    expect(annotOverlaySource).toContain('{...hoverHandlers}');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — hover affects visual style
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — hover increases visual prominence', () => {
  it('highlight fillOpacity increases on hover (0.55 vs 0.40)', () => {
    // Find the highlight branch
    const highlightIdx = annotOverlaySource.indexOf("t === 'highlight'");
    const highlightBlock = annotOverlaySource.slice(highlightIdx, highlightIdx + 400);
    expect(highlightBlock).toContain('isHovered');
    expect(highlightBlock).toContain('0.55');
    expect(highlightBlock).toContain('0.40');
  });

  it('rectangle fillOpacity increases on hover (0.15 vs 0.08)', () => {
    const rectIdx = annotOverlaySource.indexOf("t === 'square' || t === 'rectangle'");
    const rectBlock = annotOverlaySource.slice(rectIdx, rectIdx + 400);
    expect(rectBlock).toContain('isHovered');
    expect(rectBlock).toContain('0.15');
    expect(rectBlock).toContain('0.08');
  });

  it('underline strokeWidth increases on hover', () => {
    const underlineIdx = annotOverlaySource.indexOf("t === 'underline'");
    const underlineBlock = annotOverlaySource.slice(underlineIdx, underlineIdx + 600);
    expect(underlineBlock).toContain('isHovered');
  });

  it('strikeout strokeWidth increases on hover', () => {
    const strikeIdx = annotOverlaySource.indexOf("t === 'strikeout'");
    const strikeBlock = annotOverlaySource.slice(strikeIdx, strikeIdx + 600);
    expect(strikeBlock).toContain('isHovered');
  });
});
