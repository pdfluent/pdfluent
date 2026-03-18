// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useRef, useEffect, useState } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument, TextSpan } from '../../core/document';
import { useRenderedPage } from '../hooks/useRenderedPage';
import { TextLayer } from './TextLayer';
import { AnnotationOverlay } from './AnnotationOverlay';
import { TextInteractionOverlay } from './TextInteractionOverlay';
import { hitTestText } from '../text/textHoverHitTest';
import type { PageTextStructure, TextParagraphTarget } from '../text/textInteractionModel';
import type { TextHoverTarget } from '../text/textHoverHitTest';

interface PageCanvasProps {
  engine: PdfEngine;
  document: PdfDocument;
  pageIndex: number;
  zoom: number;
  textSpans?: TextSpan[];
  pageWidthPt?: number;
  pageHeightPt?: number;
  highlights?: Array<{ x: number; y: number; width: number; height: number }>;
  /** All annotations on this page — rendered as clickable markers. */
  clickableAnnotations?: Array<{ id: string; rect: { x: number; y: number; width: number; height: number }; color: string; type?: string }>;
  /** Called when the user clicks an annotation marker on the canvas. */
  onAnnotationClick?: (annotationId: string) => void;
  /** Search result rects for the current page — rendered as yellow highlights. */
  searchHighlights?: Array<{ x: number; y: number; width: number; height: number }>;
  /** Index within searchHighlights that is the active result. */
  activeSearchHighlightIdx?: number;
  /** ID of the currently selected annotation — rendered with a distinct outline. */
  selectedAnnotationId?: string | null;
  /** The active annotation tool: drives cursor style and interaction mode. */
  activeAnnotationTool?: 'highlight' | 'underline' | 'strikeout' | 'rectangle' | 'redaction' | null;
  /** Called when text is selected with a text-markup tool active.
   *  Rects are in PDF coordinate space. */
  onTextSelection?: (rects: Array<{ x: number; y: number; width: number; height: number }>) => void;
  /** Called when the user finishes drawing a rectangle with the rectangle tool.
   *  Rect is in PDF coordinate space. */
  onRectDraw?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /** Called when the user finishes drawing a redaction rectangle.
   *  Rect is in PDF coordinate space. */
  onRedactionDraw?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /** Grouped text structure for the current page (from textGrouping). */
  textStructure?: PageTextStructure | null;
  /** Whether text hover/selection affordances should be active. */
  textInteractionActive?: boolean;
  /** Currently selected text paragraph (controlled — owned by ViewerApp). */
  selectedTextTarget?: TextParagraphTarget | null;
  /** Called when the user clicks to select or deselect a text paragraph. */
  onTextTargetSelect?: (target: TextParagraphTarget | null) => void;
  /** Called when the user double-clicks a text paragraph — triggers edit entry. */
  onTextTargetDoubleClick?: (target: TextParagraphTarget) => void;
}

export function PageCanvas({
  engine,
  document,
  pageIndex,
  zoom,
  textSpans = [],
  pageWidthPt = 595,
  pageHeightPt = 842,
  highlights = [],
  clickableAnnotations = [],
  onAnnotationClick,
  searchHighlights = [],
  activeSearchHighlightIdx = -1,
  selectedAnnotationId = null,
  activeAnnotationTool = null,
  onTextSelection,
  onRectDraw,
  onRedactionDraw,
  textStructure = null,
  textInteractionActive = false,
  selectedTextTarget = null,
  onTextTargetSelect,
  onTextTargetDoubleClick,
}: PageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Text interaction hover state (local — ephemeral per-canvas)
  const [hoveredTextTarget, setHoveredTextTarget] = useState<TextHoverTarget | null>(null);

  // Render at container width × zoom for correct pixel density
  const renderWidth = Math.max(0, Math.round(containerWidth * zoom));
  const { blobUrl, loading, error } = useRenderedPage(engine, document, pageIndex, renderWidth);

  // Rectangle draw state — start/current positions in DOM (SVG) space
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });

    observer.observe(el);
    // Seed with initial measurement so we don't wait for the first resize event
    setContainerWidth(Math.floor(el.getBoundingClientRect().width));

    return () => { observer.disconnect(); };
  }, []);

  // Build a normalized PDF rect from two DOM corner points
  function makePdfRect(ax: number, ay: number, bx: number, by: number) {
    const domLeft = Math.min(ax, bx);
    const domTop = Math.min(ay, by);
    const domRight = Math.max(ax, bx);
    const domBottom = Math.max(ay, by);
    const width = (domRight - domLeft) / zoom;
    const height = (domBottom - domTop) / zoom;
    const x = domLeft / zoom;
    // PDF Y is from the bottom of the page
    const y = pageHeightPt - (domBottom / zoom);
    return { x, y, width, height };
  }

  function handlePageMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (activeAnnotationTool !== 'rectangle' && activeAnnotationTool !== 'redaction') return;
    // Prevent text selection while drawing rectangle (but not for redaction, which can coexist with text)
    if (activeAnnotationTool === 'rectangle') e.preventDefault();
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
  }

  function handlePageMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    // Text hover hit test — runs outside annotation draw mode
    if (textInteractionActive && !activeAnnotationTool && textStructure) {
      const bounds = e.currentTarget.getBoundingClientRect();
      const domX = e.clientX - bounds.left;
      const domY = e.clientY - bounds.top;
      setHoveredTextTarget(hitTestText(domX, domY, textStructure, pageHeightPt, zoom));
    }
    if (!dragStart || (activeAnnotationTool !== 'rectangle' && activeAnnotationTool !== 'redaction')) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    setDragCurrent({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
  }

  function handlePageMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    // Text paragraph click-to-select (toggle) — notify ViewerApp via callback
    if (textInteractionActive && !activeAnnotationTool && hoveredTextTarget?.paragraph) {
      const para = hoveredTextTarget.paragraph;
      onTextTargetSelect?.(selectedTextTarget?.id === para.id ? null : para);
      return;
    }
    if (!dragStart || (activeAnnotationTool !== 'rectangle' && activeAnnotationTool !== 'redaction')) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - bounds.left;
    const endY = e.clientY - bounds.top;
    const rect = makePdfRect(dragStart.x, dragStart.y, endX, endY);
    setDragStart(null);
    setDragCurrent(null);
    // Only create if the rectangle has meaningful size (> 5pt each side)
    if (rect.width > 5 && rect.height > 5) {
      if (activeAnnotationTool === 'redaction') {
        onRedactionDraw?.(rect);
      } else {
        onRectDraw?.(rect);
      }
    }
  }

  function handlePageDoubleClick() {
    // Double-click on a text paragraph triggers edit entry — notify parent
    if (textInteractionActive && !activeAnnotationTool && hoveredTextTarget?.paragraph) {
      onTextTargetDoubleClick?.(hoveredTextTarget.paragraph);
    }
  }

  // Draft rect in PDF coordinates — shown in AnnotationOverlay while dragging
  const draftRect = dragStart && dragCurrent
    ? makePdfRect(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y)
    : null;

  // Cursor style changes with active tool
  const cursorStyle: React.CSSProperties['cursor'] = (() => {
    switch (activeAnnotationTool) {
      case 'highlight':
      case 'underline':
      case 'strikeout':
      case 'redaction':
        return 'text';
      case 'rectangle':
        return 'crosshair';
      default:
        return undefined;
    }
  })();

  // For text-markup tools, forward text selection; for rectangle, suppress it
  const textSelectionCallback = (activeAnnotationTool === 'highlight' ||
    activeAnnotationTool === 'underline' ||
    activeAnnotationTool === 'strikeout' ||
    activeAnnotationTool === 'redaction')
    ? onTextSelection
    : undefined;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: Math.round(containerWidth * 1.414) || 400,
          color: '#aaa',
          fontSize: 14,
        }}>
          Rendering…
        </div>
      )}
      {error && !loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          color: '#c0392b',
          fontSize: 14,
          padding: 24,
        }}>
          {error}
        </div>
      )}
      {blobUrl && !loading && (
        <div
          data-testid="page-view"
          style={{ position: 'relative', display: 'inline-block', cursor: cursorStyle }}
          onMouseDown={handlePageMouseDown}
          onMouseMove={handlePageMouseMove}
          onMouseUp={handlePageMouseUp}
          onDoubleClick={handlePageDoubleClick}
          onMouseLeave={() => { setHoveredTextTarget(null); }}
        >
          <img
            src={blobUrl}
            alt={`Page ${pageIndex + 1}`}
            data-testid="rendered-page"
            draggable={false}
            style={{
              display: 'block',
              width: `${zoom * 100}%`,
              boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
            }}
          />
          {/* Stacking order: canvas → AnnotationOverlay (z=10) → TextInteractionOverlay (z=15) → TextLayer (z=20) */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <AnnotationOverlay
              highlights={highlights}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
              zoom={zoom}
              clickableAnnotations={clickableAnnotations}
              onAnnotationClick={onAnnotationClick}
              searchHighlights={searchHighlights}
              activeSearchHighlightIdx={activeSearchHighlightIdx}
              selectedAnnotationId={selectedAnnotationId}
              draftRect={draftRect}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 15 }}>
            <TextInteractionOverlay
              active={textInteractionActive}
              hovered={hoveredTextTarget}
              selected={selectedTextTarget}
              pageHeightPt={pageHeightPt}
              zoom={zoom}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
            <TextLayer
              textSpans={textSpans}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
              zoom={zoom}
              onTextSelection={textSelectionCallback}
            />
          </div>
        </div>
      )}
    </div>
  );
}
