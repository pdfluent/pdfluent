// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useRef } from 'react';
import type { TextSpan } from '../../core/document';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TextLayerProps {
  textSpans: TextSpan[];
  pageWidthPt: number;
  pageHeightPt: number;
  zoom: number;
  /** Called when the user releases the mouse with a non-empty text selection.
   *  Rects are in PDF coordinate space (y increases from bottom). */
  onTextSelection?: (rects: Array<{ x: number; y: number; width: number; height: number }>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextLayer({ textSpans, pageWidthPt: _pageWidthPt, pageHeightPt, zoom, onTextSelection }: TextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseUp() {
    if (!onTextSelection) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const domRects = Array.from(range.getClientRects());
    if (domRects.length === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const containerBounds = container.getBoundingClientRect();
    const pdfRects = domRects
      .filter(r => r.width > 1 && r.height > 1)
      .map(r => {
        const relX = r.left - containerBounds.left;
        const relY = r.top - containerBounds.top;
        const w = r.width / zoom;
        const h = r.height / zoom;
        const x = relX / zoom;
        // PDF Y: bottom of the rect in PDF space (Y increases upward from page bottom)
        const y = pageHeightPt - (relY / zoom) - h;
        return { x, y, width: w, height: h };
      });
    if (pdfRects.length === 0) return;
    onTextSelection(pdfRects);
    sel.removeAllRanges();
  }

  return (
    <div
      ref={containerRef}
      data-testid="text-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'auto',
        userSelect: 'text',
        overflow: 'hidden',
      }}
      onMouseUp={handleMouseUp}
    >
      {textSpans.map((span, idx) => {
        const domX = span.rect.x * zoom;
        const domY = (pageHeightPt - span.rect.y - span.rect.height) * zoom;
        const domWidth = span.rect.width * zoom;
        const domHeight = span.rect.height * zoom;
        return (
          <span
            key={idx}
            data-testid="text-span"
            style={{
              position: 'absolute',
              left: domX,
              top: domY,
              width: domWidth,
              height: domHeight,
              fontSize: span.fontSize * zoom,
              lineHeight: 1,
              whiteSpace: 'pre',
              color: 'transparent',
              cursor: 'text',
            }}
          >
            {span.text}
          </span>
        );
      })}
    </div>
  );
}
