// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useRef, useState, useLayoutEffect, memo } from 'react';
import type { TextSpan } from '../../core/document';
import { getEditorFontFamily, toEditorTextSpan } from '../text/editorTextSpan';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SelectionPopupInfo {
  text: string;
  pdfRects: Array<{ x: number; y: number; width: number; height: number }>;
  anchorTop: number;
  anchorBottom: number;
  anchorLeft: number;
  anchorWidth: number;
}

interface TextLayerProps {
  textSpans: TextSpan[];
  pageWidthPt: number;
  pageHeightPt: number;
  zoom: number;
  /** Called when the user releases the mouse with a non-empty text selection.
   *  Rects are in PDF coordinate space (y increases from bottom). */
  onTextSelection?: (rects: Array<{ x: number; y: number; width: number; height: number }>) => void;
  /** Called when text is selected without an active annotation tool — shows floating toolbar. */
  onSelectionPopup?: (info: SelectionPopupInfo) => void;
  /**
   * When set, any span whose rect overlaps with this bounds (in PDF coordinate space)
   * will be hidden. Used to prevent ghost doubling while the inline editor overlays the paragraph.
   */
  editingParagraphBounds?: { x: number; y: number; width: number; height: number } | null;
  /** Index of the span currently spoken by TTS. That span gets a highlight background. -1 = none. */
  ttsHighlightSpanIndex?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if two PDF-space rects intersect (with 2pt tolerance).
 */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tolerance = 4,
): boolean {
  return (
    a.x < b.x + b.width + tolerance &&
    a.x + a.width > b.x - tolerance &&
    a.y < b.y + b.height + tolerance &&
    a.y + a.height > b.y - tolerance
  );
}

// ---------------------------------------------------------------------------
// Span Item Component (Supports scaleX scaling)
// ---------------------------------------------------------------------------

interface TextSpanItemProps {
  span: TextSpan;
  zoom: number;
  pageHeightPt: number;
  isHidden: boolean;
  fontFamily: string;
  idx: number;
  isTtsActive: boolean;
}

const TextSpanItem = memo(function TextSpanItem({
  span,
  zoom,
  pageHeightPt,
  isHidden,
  fontFamily,
  idx,
  isTtsActive,
}: TextSpanItemProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [scaleX, setScaleX] = useState(1);

  const domX = span.rect.x * zoom;
  const domY = (pageHeightPt - span.rect.y - span.rect.height) * zoom;
  const domWidth = span.rect.width * zoom;
  const domHeight = span.rect.height * zoom;

  useLayoutEffect(() => {
    const el = elementRef.current;
    if (!el || domWidth === undefined) return;

    const prevTransform = el.style.transform;
    el.style.transform = 'none';
    const measuredWidth = el.getBoundingClientRect().width;
    el.style.transform = prevTransform;

    if (measuredWidth > 0 && domWidth > 0) {
      setScaleX(domWidth / measuredWidth);
    }
  }, [span.text, domWidth, zoom]);

  return (
    <span
      ref={elementRef}
      key={idx}
      data-testid="text-span"
      style={{
        position: 'absolute',
        left: domX,
        top: domY,
        width: 'max-content',
        height: domHeight,
        fontSize: span.fontSize * zoom,
        fontFamily: fontFamily,
        lineHeight: 1.1,
        whiteSpace: 'pre',
        color: 'transparent',
        cursor: 'text',
        visibility: isHidden ? 'hidden' : 'visible',
        backgroundColor: isTtsActive ? 'rgba(255, 215, 0, 0.45)' : undefined,
        borderRadius: isTtsActive ? '2px' : undefined,
        transformOrigin: 'left top',
        transform: scaleX !== 1 ? `scaleX(${scaleX})` : undefined,
        display: 'inline-block',
      }}
    >
      {span.text}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextLayer = memo(function TextLayer({
  textSpans,
  pageWidthPt: _pageWidthPt,
  pageHeightPt,
  zoom,
  onTextSelection,
  onSelectionPopup,
  editingParagraphBounds,
  ttsHighlightSpanIndex = -1,
}: TextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseUp() {
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

    // Active annotation tool: create markup immediately and clear selection
    if (onTextSelection) {
      onTextSelection(pdfRects);
      sel.removeAllRanges();
      return;
    }

    // No active tool: show floating selection toolbar (don't clear selection)
    if (onSelectionPopup) {
      const selectedText = sel.toString();
      // Compute anchor position relative to the container (DOM px)
      const firstRect = domRects[0]!;
      const lastRect = domRects[domRects.length - 1]!;
      const anchorTop = Math.min(firstRect.top, lastRect.top) - containerBounds.top;
      const anchorBottom = Math.max(firstRect.bottom, lastRect.bottom) - containerBounds.top;
      const anchorLeft = Math.min(...domRects.map(r => r.left)) - containerBounds.left;
      const anchorRight = Math.max(...domRects.map(r => r.right)) - containerBounds.left;
      onSelectionPopup({
        text: selectedText,
        pdfRects,
        anchorTop,
        anchorBottom,
        anchorLeft,
        anchorWidth: anchorRight - anchorLeft,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="text-layer"
      className="pdf-text-layer"
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
        const isHidden =
          editingParagraphBounds != null
            ? rectsOverlap(span.rect, editingParagraphBounds)
            : false;

        const editorSpan = toEditorTextSpan(span, 0, idx);
        const fontFamily = getEditorFontFamily(editorSpan);

        return (
          <TextSpanItem
            key={idx}
            span={span}
            zoom={zoom}
            pageHeightPt={pageHeightPt}
            isHidden={isHidden}
            fontFamily={fontFamily}
            idx={idx}
            isTtsActive={ttsHighlightSpanIndex === idx}
          />
        );
      })}
    </div>
  );
});
