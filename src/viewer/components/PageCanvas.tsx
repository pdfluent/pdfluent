// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument, TextSpan } from '../../core/document';
import { useRenderedCanvas } from '../hooks/useRenderedCanvas';
import type { RenderFallbackHandle } from '../hooks/useRenderTelemetry';
import { TextLayer } from './TextLayer';
import { AnnotationOverlay } from './AnnotationOverlay';
import { TextInteractionOverlay } from './TextInteractionOverlay';
import { OcrOverlay } from './OcrOverlay';
import { TextSelectionFloatingToolbar } from './TextSelectionFloatingToolbar';
import { PageLoadingIndicator } from './PageLoadingIndicator';
import type { TextSelectionInfo } from './TextSelectionFloatingToolbar';
import { hitTestText } from '../text/textHoverHitTest';
import type { PageTextStructure, TextLineTarget, TextParagraphTarget, TextSpanTarget } from '../text/textInteractionModel';
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
  activeAnnotationTool?: 'highlight' | 'underline' | 'strikeout' | 'rectangle' | 'ink' | 'redaction' | null;
  /** Called when text is selected with a text-markup tool active.
   *  Rects are in PDF coordinate space. */
  onTextSelection?: (rects: Array<{ x: number; y: number; width: number; height: number }>) => void;
  /** Called when the user finishes drawing a rectangle with the rectangle tool.
   *  Rect is in PDF coordinate space. */
  onRectDraw?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /** Called when the user finishes drawing a redaction rectangle.
   *  Rect is in PDF coordinate space. */
  onRedactionDraw?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /** Called when the user finishes a freehand stroke with the ink tool.
   *  Points are in PDF coordinate space. */
  onInkDraw?: (path: Array<[number, number]>) => void;
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
  /** Called when the user double-clicks a text paragraph with client coordinates. */
  onTextTargetDoubleClickAt?: (target: TextParagraphTarget, clientX: number, clientY: number) => void;
  /** When set, the paragraph at these bounds is being edited — hides overlapping TextLayer spans. */
  editingParagraphBounds?: { x: number; y: number; width: number; height: number } | null;
  /** ID of the paragraph currently being edited — passed to TextInteractionOverlay. */
  editingTargetId?: string | null;
  /** OCR word boxes for the current page — rendered as bounding box overlays. */
  ocrWords?: Array<{ text: string; confidence: number; x0: number; y0: number; x1: number; y1: number; renderedWidth: number; renderedHeight: number }>;
  /** Whether the OCR overlay is visible. */
  ocrVisible?: boolean;
  /** Confidence threshold below which words are highlighted in orange. */
  ocrConfidenceThreshold?: number;
  /** Called when the user creates a text markup from the floating selection toolbar. */
  onSelectionMarkup?: (type: 'highlight' | 'underline' | 'strikeout', rects: Array<{ x: number; y: number; width: number; height: number }>) => void;
  /** Called when the user clicks "Add comment" on the floating selection toolbar. */
  onSelectionComment?: () => void;
  /** When true, dashed outlines are rendered around all text paragraphs. */
  isEditMode?: boolean;
  /** Optional browser-test fallback renderer. Null in the desktop native product. */
  renderFallback?: RenderFallbackHandle | null;
  /** Bumps when underlying PDF bytes changed and cached rasters must be bypassed. */
  renderRevision?: number;
  /** Index of the TextSpan currently being spoken by TTS, or -1 when not active. */
  ttsHighlightSpanIndex?: number;
}

export const PageCanvas = memo(function PageCanvas({
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
  onInkDraw,
  textStructure = null,
  textInteractionActive = false,
  selectedTextTarget = null,
  onTextTargetSelect,
  onTextTargetDoubleClick,
  onTextTargetDoubleClickAt,
  editingParagraphBounds = null,
  editingTargetId = null,
  ocrWords,
  ocrVisible = true,
  ocrConfidenceThreshold = 0.6,
  onSelectionMarkup,
  onSelectionComment,
  isEditMode = false,
  renderFallback,
  renderRevision = 0,
  ttsHighlightSpanIndex = -1,
}: PageCanvasProps) {
  // Text interaction hover state (local — ephemeral per-canvas)
  const [hoveredTextTarget, setHoveredTextTarget] = useState<TextHoverTarget | null>(null);

  // Floating text-selection toolbar state
  const [textSelection, setTextSelection] = useState<TextSelectionInfo | null>(null);

  const { canvasRef, loading, error, hasRendered } = useRenderedCanvas(engine, document, pageIndex, zoom, pageWidthPt, pageHeightPt, renderFallback, renderRevision);

  // Rectangle draw state — start/current positions in DOM (SVG) space
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  // The freehand stroke being drawn, in PDF coordinates; null when not drawing.
  const [inkPath, setInkPath] = useState<Array<[number, number]> | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Backup ref for canvas-masking (prevents text ghosting in inline editor)
  const originalBackupRef = useRef<{ imageData: ImageData; bounds: { x: number; y: number; w: number; h: number } } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Restore any existing backup first to make sure the canvas is in clean state
    if (originalBackupRef.current) {
      const { imageData, bounds } = originalBackupRef.current;
      // Make sure we only restore if dimensions match current canvas limits
      if (bounds.x + bounds.w <= canvas.width && bounds.y + bounds.h <= canvas.height) {
        ctx.putImageData(imageData, bounds.x, bounds.y);
      }
      originalBackupRef.current = null;
    }

    if (loading || !editingParagraphBounds) return;

    // Use the canvas backing-store scale, not the current CSS zoom. The render
    // hook can intentionally keep a lower backing raster while CSS zoom changes.
    const scaleX = canvas.width / pageWidthPt;
    const scaleY = canvas.height / pageHeightPt;

    // Add 4pt safety padding to all sides to cleanly wipe original text under editing blocks
    const padPt = 4;
    const paddedX = Math.max(0, editingParagraphBounds.x - padPt);
    const paddedY = Math.max(0, editingParagraphBounds.y - padPt);
    const paddedW = editingParagraphBounds.width + padPt * 2;
    const paddedH = editingParagraphBounds.height + padPt * 2;

    // Convert PDF bounds to physical pixel coordinates
    const physX = Math.floor(paddedX * scaleX);
    const physY = Math.floor((pageHeightPt - paddedY - paddedH) * scaleY);
    const physW = Math.ceil(paddedW * scaleX);
    const physH = Math.ceil(paddedH * scaleY);

    // Clamp instead of dropping the mask. Extracted PDF boxes can slightly
    // exceed the rendered raster; skipping the mask leaves the original text
    // visible under the inline editor.
    const maskX = Math.max(0, Math.min(canvas.width - 1, physX));
    const maskY = Math.max(0, Math.min(canvas.height - 1, physY));
    const maskRight = Math.max(maskX + 1, Math.min(canvas.width, physX + physW));
    const maskBottom = Math.max(maskY + 1, Math.min(canvas.height, physY + physH));
    const maskW = maskRight - maskX;
    const maskH = maskBottom - maskY;

    if (physW <= 0 || physH <= 0 || maskW <= 0 || maskH <= 0) {
      return;
    }

    // Save clean original pixel backup of this paragraph area
    try {
      const backupData = ctx.getImageData(maskX, maskY, maskW, maskH);
      originalBackupRef.current = {
        imageData: backupData,
        bounds: { x: maskX, y: maskY, w: maskW, h: maskH }
      };

      // Sample 8 background pixels just outside the bounds to determine page background color
      const padding = Math.max(4, Math.round(4 * Math.max(scaleX, scaleY))); // scale-dependent sampling padding
      const samplePoints = [
        { x: maskX - padding, y: maskY - padding },
        { x: maskX + Math.floor(maskW / 2), y: maskY - padding },
        { x: maskX + maskW + padding, y: maskY - padding },
        { x: maskX + maskW + padding, y: maskY + Math.floor(maskH / 2) },
        { x: maskX + maskW + padding, y: maskY + maskH + padding },
        { x: maskX + Math.floor(maskW / 2), y: maskY + maskH + padding },
        { x: maskX - padding, y: maskY + maskH + padding },
        { x: maskX - padding, y: maskY + Math.floor(maskH / 2) }
      ];

      const colorCounts: Record<string, number> = {};
      let maxCount = 0;
      let dominantColor = 'rgb(255, 255, 255)';

      samplePoints.forEach(pt => {
        const rx = Math.max(0, Math.min(canvas.width - 1, pt.x));
        const ry = Math.max(0, Math.min(canvas.height - 1, pt.y));
        try {
          const imgData = ctx!.getImageData(rx, ry, 1, 1);
          if (imgData && imgData.data) {
            const r = imgData.data[0];
            const g = imgData.data[1];
            const b = imgData.data[2];
            const a = imgData.data[3];
            if (r !== undefined && g !== undefined && b !== undefined && a !== undefined && a > 0) {
              const rgbStr = `rgb(${r}, ${g}, ${b})`;
              colorCounts[rgbStr] = (colorCounts[rgbStr] || 0) + 1;
              if (colorCounts[rgbStr] > maxCount) {
                maxCount = colorCounts[rgbStr];
                dominantColor = rgbStr;
              }
            }
          }
        } catch {
          // Ignore sample point out of bounds or failing
        }
      });

      // Clear the canvas paragraph bounds and fill with dominant color
      ctx.fillStyle = dominantColor;
      ctx.fillRect(maskX, maskY, maskW, maskH);
    } catch (e) {
      console.warn('[PDFuent] Direct canvas masking failed:', e);
    }
  }, [canvasRef, editingParagraphBounds, loading, zoom, pageWidthPt, pageHeightPt]);

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

  /** A DOM point on the page, in PDF coordinates (origin bottom-left, points). */
  function toPdfPoint(domX: number, domY: number): [number, number] {
    return [domX / zoom, pageHeightPt - domY / zoom];
  }

  function handlePageMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (activeAnnotationTool === 'ink') {
      e.preventDefault();
      const inkBounds = e.currentTarget.getBoundingClientRect();
      setInkPath([toPdfPoint(e.clientX - inkBounds.left, e.clientY - inkBounds.top)]);
      return;
    }
    if (activeAnnotationTool !== 'rectangle' && activeAnnotationTool !== 'redaction') return;
    // Prevent text selection while drawing rectangle (but not for redaction, which can coexist with text)
    if (activeAnnotationTool === 'rectangle') e.preventDefault();
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
  }

  // Note: deliberately NOT gated on textInteractionActive — the double-click
  // edit-entry path must hit-test in read mode too. Call sites that need the
  // mode gate (single-click select) check textInteractionActive themselves.
  function getTextTargetFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    if (activeAnnotationTool || !textStructure) return null;
    const bounds = e.currentTarget.getBoundingClientRect();
    const domX = e.clientX - bounds.left;
    const domY = e.clientY - bounds.top;
    return hitTestText(domX, domY, textStructure, pageHeightPt, zoom);
  }

  function lineToEditableParagraph(line: TextLineTarget): TextParagraphTarget {
    return {
      kind: 'paragraph',
      id: `${line.id}:edit-line`,
      source: line.source,
      lines: [line],
      rect: line.rect,
    };
  }

  function spanToEditableParagraph(span: TextSpanTarget, line: TextLineTarget): TextParagraphTarget {
    return {
      kind: 'paragraph',
      id: `${span.id}:edit-span`,
      source: span.source,
      lines: [{
        kind: 'line',
        id: `${line.id}:${span.id}:edit-line`,
        source: span.source,
        spans: [span],
        rect: span.rect,
        baselineY: line.baselineY,
      }],
      rect: span.rect,
    };
  }

  function getEditableTargetFromHit(hit: TextHoverTarget): TextParagraphTarget | null {
    if (isEditMode) {
      return hit.span ? spanToEditableParagraph(hit.span, hit.line) : lineToEditableParagraph(hit.line);
    }
    return hit.paragraph;
  }

  function handlePageMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    // Text hover hit test — runs outside annotation draw mode
    if (textInteractionActive && !activeAnnotationTool && textStructure) {
      const bounds = e.currentTarget.getBoundingClientRect();
      const domX = e.clientX - bounds.left;
      const domY = e.clientY - bounds.top;
      setHoveredTextTarget(hitTestText(domX, domY, textStructure, pageHeightPt, zoom));
    }
    if (activeAnnotationTool === 'ink') {
      if (inkPath === null) return;
      const inkBounds = e.currentTarget.getBoundingClientRect();
      setInkPath([...inkPath, toPdfPoint(e.clientX - inkBounds.left, e.clientY - inkBounds.top)]);
      return;
    }
    if (!dragStart || (activeAnnotationTool !== 'rectangle' && activeAnnotationTool !== 'redaction')) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    setDragCurrent({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
  }

  function handlePageMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    // Text paragraph click-to-select (toggle) — notify ViewerApp via callback.
    // Skip if the user is drag-selecting text (non-collapsed selection) — let the
    // floating selection toolbar handle it instead of opening the paragraph editor.
    const sel = window.getSelection();
    const hasTextSelection = sel && !sel.isCollapsed && sel.rangeCount > 0;
    const clickTarget = getTextTargetFromEvent(e);
    const target = clickTarget ? getEditableTargetFromHit(clickTarget) : null;
    if (textInteractionActive && !activeAnnotationTool && target && !hasTextSelection) {
      setHoveredTextTarget(clickTarget);
      onTextTargetSelect?.(!isEditMode && selectedTextTarget?.id === target.id ? null : target);
      return;
    }
    if (activeAnnotationTool === 'ink') {
      const path = inkPath;
      setInkPath(null);
      // A click without movement is not a stroke; two points is the minimum a
      // /Ink annotation can carry without collapsing to nothing on the page.
      if (path !== null && path.length > 1) onInkDraw?.(path);
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

  function handlePageDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    // Double-click on a text paragraph triggers edit entry — notify parent.
    // Intentionally fires even when textInteractionActive is false (e.g. read mode)
    // so the parent can auto-switch to edit mode. Always uses line/span-level
    // targeting (same granularity as edit mode) regardless of the current mode.
    if (activeAnnotationTool) return;
    const hit = getTextTargetFromEvent(e);
    if (!hit) return;
    const target = hit.span
      ? spanToEditableParagraph(hit.span, hit.line)
      : lineToEditableParagraph(hit.line);
    setHoveredTextTarget(hit);
    // Clear the native word-selection the double-click just made, so the
    // floating selection toolbar doesn't linger over the inline editor.
    window.getSelection()?.removeAllRanges();
    handleSelectionDismiss();
    onTextTargetDoubleClick?.(target);
    onTextTargetDoubleClickAt?.(target, e.clientX, e.clientY);
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
      case 'ink':
        return 'crosshair';
      default:
        return undefined;
    }
  })();

  // Floating toolbar action handlers
  const handleSelectionDismiss = useCallback(() => {
    setTextSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleSelectionHighlight = useCallback((rects: TextSelectionInfo['pdfRects']) => {
    onSelectionMarkup?.('highlight', rects);
    handleSelectionDismiss();
  }, [onSelectionMarkup, handleSelectionDismiss]);

  const handleSelectionUnderline = useCallback((rects: TextSelectionInfo['pdfRects']) => {
    onSelectionMarkup?.('underline', rects);
    handleSelectionDismiss();
  }, [onSelectionMarkup, handleSelectionDismiss]);

  const handleSelectionStrikethrough = useCallback((rects: TextSelectionInfo['pdfRects']) => {
    onSelectionMarkup?.('strikeout', rects);
    handleSelectionDismiss();
  }, [onSelectionMarkup, handleSelectionDismiss]);

  const handleSelectionCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    handleSelectionDismiss();
  }, [handleSelectionDismiss]);

  const handleSelectionComment = useCallback(() => {
    onSelectionComment?.();
    handleSelectionDismiss();
  }, [onSelectionComment, handleSelectionDismiss]);

  const handleSelectionEditText = useCallback(() => {
    if (!textSelection || !textStructure) return;

    // Find paragraph overlapping the selection
    const firstRect = textSelection.pdfRects[0];
    if (!firstRect) return;

    const foundParagraph = textStructure.paragraphs.find(p => {
      const xOverlap = Math.max(0, Math.min(p.rect.x + p.rect.width, firstRect.x + firstRect.width) - Math.max(p.rect.x, firstRect.x));
      const yOverlap = Math.max(0, Math.min(p.rect.y + p.rect.height, firstRect.y + firstRect.height) - Math.max(p.rect.y, firstRect.y));
      return (xOverlap > 0 && yOverlap > 0);
    });

    const targetParagraph = foundParagraph || hoveredTextTarget?.paragraph || selectedTextTarget;

    if (targetParagraph) {
      onTextTargetDoubleClick?.(targetParagraph);
    }
    handleSelectionDismiss();
  }, [textSelection, textStructure, hoveredTextTarget, selectedTextTarget, onTextTargetDoubleClick, handleSelectionDismiss]);

  // For text-markup tools, forward text selection; for rectangle, suppress it
  const textSelectionCallback = (activeAnnotationTool === 'highlight' ||
    activeAnnotationTool === 'underline' ||
    activeAnnotationTool === 'strikeout' ||
    activeAnnotationTool === 'redaction')
    ? onTextSelection
    : undefined;

  // Show floating toolbar when text is selected without an active annotation tool
  const selectionPopupCallback = !textSelectionCallback ? setTextSelection : undefined;

  return (
    <div style={{ width: pageWidthPt * zoom, height: pageHeightPt * zoom, position: 'relative' }}>
      {/* Canvas is always present — overlays are positioned relative to it */}
      <div
        data-testid="page-view"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: pageWidthPt * zoom,
          height: pageHeightPt * zoom,
          cursor: cursorStyle,
        }}
        onMouseDown={handlePageMouseDown}
        onMouseMove={handlePageMouseMove}
        onMouseUp={handlePageMouseUp}
        onDoubleClick={handlePageDoubleClick}
        onMouseLeave={() => { setHoveredTextTarget(null); }}
      >
        <canvas
          ref={canvasRef}
          data-testid="rendered-page"
          draggable={false}
          style={{
            display: 'block',
            width: pageWidthPt * zoom,
            height: pageHeightPt * zoom,
            boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
          }}
        />
        {loading && (
          <PageLoadingIndicator
            variant={hasRendered ? 'badge' : 'overlay'}
            label={hasRendered ? 'Updating page' : 'Rendering page'}
          />
        )}
        {error && !loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#c0392b', fontSize: 14, padding: 24,
          }}>
            {error}
          </div>
        )}
        {/* Stacking order: canvas → AnnotationOverlay (z=10) → OcrOverlay (z=12) → TextInteractionOverlay (z=15) → TextLayer (z=20) */}
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
            draftInk={inkPath}
          />
        </div>
        {ocrWords && ocrWords.length > 0 && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 12 }}>
            <OcrOverlay
              words={ocrWords}
              renderedWidth={ocrWords[0]?.renderedWidth ?? 1}
              renderedHeight={ocrWords[0]?.renderedHeight ?? 1}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
              zoom={zoom}
              lowConfidenceThreshold={ocrConfidenceThreshold}
              visible={ocrVisible}
            />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, zIndex: 15 }}>
          <TextInteractionOverlay
            active={textInteractionActive}
            hovered={hoveredTextTarget}
            selected={selectedTextTarget}
            pageHeightPt={pageHeightPt}
            zoom={zoom}
            textStructure={textStructure}
            isEditMode={isEditMode}
            editingTargetId={editingTargetId}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <TextLayer
            textSpans={textSpans}
            pageWidthPt={pageWidthPt}
            pageHeightPt={pageHeightPt}
            zoom={zoom}
            onTextSelection={textSelectionCallback}
            onSelectionPopup={selectionPopupCallback}
            editingParagraphBounds={editingParagraphBounds}
            ttsHighlightSpanIndex={ttsHighlightSpanIndex}
          />
        </div>
        {/* Floating text-selection toolbar (Acrobat Reader-style) */}
        {textSelection && !editingTargetId && (
          <TextSelectionFloatingToolbar
            selection={textSelection}
            onHighlight={handleSelectionHighlight}
            onUnderline={handleSelectionUnderline}
            onStrikethrough={handleSelectionStrikethrough}
            onAddComment={handleSelectionComment}
            onCopy={handleSelectionCopy}
            onDismiss={handleSelectionDismiss}
            onEditText={handleSelectionEditText}
            mode={isEditMode ? 'edit' : 'read'}
          />
        )}
      </div>
    </div>
  );
});
