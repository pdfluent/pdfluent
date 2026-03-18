// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Interaction Model
 *
 * Defines the target hierarchy that the text interaction layer works with:
 *
 *   TextSpanTarget  — individual extracted span (smallest unit)
 *   TextLineTarget  — spans sharing a baseline (one visual line of text)
 *   TextParagraphTarget — adjacent lines forming a paragraph
 *   TextBlockTarget — paragraphs forming a column or section
 *
 * All coordinates use **PDF page space** (origin bottom-left, y increases
 * upward). DOM display requires the y-flip: domY = (pageHeightPt − y − h) * zoom.
 *
 * Two text sources are distinguished:
 *   'digital' — extracted from the PDF's text layer (high quality)
 *   'ocr'     — derived from OCR analysis (quality varies by confidence)
 *
 * Limitations (known, by design for Phase 2):
 * - Grouping is heuristic; complex multi-column layouts may produce
 *   imperfect line/paragraph boundaries.
 * - RTL text is not specially handled; bounding rects are still correct.
 * - Overlapping spans (e.g. drop-caps) may be assigned to adjacent lines.
 * - OCR words with confidence < OCR_LOW_CONFIDENCE_THRESHOLD are flagged
 *   but not excluded — callers decide how to render low-confidence targets.
 */

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

/** Bounding rectangle in PDF page coordinate space (points). */
export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * Whether text came from the PDF's embedded text layer or from OCR.
 * Used to choose rendering affordances (OCR targets show lower confidence).
 */
export type TextSource = 'digital' | 'ocr';

/**
 * OCR confidence threshold below which a target is considered "low confidence".
 * Value is in the range [0, 1].
 */
export const OCR_LOW_CONFIDENCE_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Target hierarchy
// ---------------------------------------------------------------------------

/** The granularity of a text interaction target. */
export type TextTargetKind = 'span' | 'line' | 'paragraph' | 'block';

// ---------------------------------------------------------------------------
// Span target (atomic unit)
// ---------------------------------------------------------------------------

/**
 * A single extracted text span with interaction metadata.
 * Wraps the core TextSpan model and adds id, source, and optional OCR fields.
 */
export interface TextSpanTarget {
  kind: 'span';
  /** Stable id derived from page + span index: "p{pageIndex}:s{spanIndex}" */
  id: string;
  source: TextSource;
  text: string;
  /** Bounding rect in PDF page coordinate space. */
  rect: TextRect;
  /** Font size in points. */
  fontSize: number;
  /**
   * OCR confidence [0, 1]. Present only when source === 'ocr'.
   * Used to visually distinguish uncertain text targets.
   */
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Line target
// ---------------------------------------------------------------------------

/**
 * A group of TextSpanTargets that share approximately the same baseline.
 *
 * Grouping rule: spans are on the same line when their Y-range midpoints
 * are within `lineHeightTolerance` of each other (see textGrouping.ts).
 * The bounding rect covers all spans in the line.
 */
export interface TextLineTarget {
  kind: 'line';
  /** "p{pageIndex}:l{lineIndex}" */
  id: string;
  source: TextSource;
  spans: ReadonlyArray<TextSpanTarget>;
  /** Union bounding rect of all spans. */
  rect: TextRect;
  /**
   * Approximate baseline Y in PDF space (y of the dominant span's bottom).
   * Used as the sort key for line ordering.
   */
  baselineY: number;
}

// ---------------------------------------------------------------------------
// Paragraph target
// ---------------------------------------------------------------------------

/**
 * A group of adjacent TextLineTargets that form a single paragraph.
 *
 * Grouping rule: consecutive lines are merged into a paragraph when
 * the vertical gap between them is ≤ `paragraphGapFactor × averageLineHeight`
 * (see textGrouping.ts). A gap exceeding that threshold starts a new paragraph.
 */
export interface TextParagraphTarget {
  kind: 'paragraph';
  /** "p{pageIndex}:par{paragraphIndex}" */
  id: string;
  source: TextSource;
  lines: ReadonlyArray<TextLineTarget>;
  /** Union bounding rect of all lines. */
  rect: TextRect;
}

// ---------------------------------------------------------------------------
// Block target
// ---------------------------------------------------------------------------

/**
 * A group of TextParagraphTargets forming a column or section.
 *
 * Grouping rule: paragraphs are merged into a block when they share
 * approximate x-alignment and the vertical gap is ≤ `blockGapFactor × avgHeight`.
 * This is a conservative grouping — unclear cases produce separate blocks.
 */
export interface TextBlockTarget {
  kind: 'block';
  /** "p{pageIndex}:b{blockIndex}" */
  id: string;
  source: TextSource;
  paragraphs: ReadonlyArray<TextParagraphTarget>;
  /** Union bounding rect of all paragraphs. */
  rect: TextRect;
}

/** Union of all text interaction target types. */
export type AnyTextTarget =
  | TextSpanTarget
  | TextLineTarget
  | TextParagraphTarget
  | TextBlockTarget;

// ---------------------------------------------------------------------------
// Page text structure (top-level grouping result per page)
// ---------------------------------------------------------------------------

/**
 * The complete grouped text structure for a single page.
 * Produced by textGrouping.ts, consumed by hit-testing and rendering.
 */
export interface PageTextStructure {
  pageIndex: number;
  source: TextSource;
  spans: ReadonlyArray<TextSpanTarget>;
  lines: ReadonlyArray<TextLineTarget>;
  paragraphs: ReadonlyArray<TextParagraphTarget>;
  blocks: ReadonlyArray<TextBlockTarget>;
}

// ---------------------------------------------------------------------------
// OCR input type (matches ViewerApp.tsx ocrPageWords shape)
// ---------------------------------------------------------------------------

/**
 * A single OCR word box as stored in ViewerApp state.
 * Coordinates are in rendered pixel space (NOT PDF space).
 * Conversion to PDF space requires `renderedWidth` / page dimensions.
 */
export interface OcrWordBox {
  text: string;
  confidence: number;
  /** Pixel coordinates (rendered canvas space). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Width of the rendered page in pixels (used for coordinate conversion). */
  renderedWidth: number;
  /** Height of the rendered page in pixels (used for coordinate conversion). */
  renderedHeight: number;
}

// ---------------------------------------------------------------------------
// Coordinate conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert an OcrWordBox from rendered pixel coordinates to PDF page space.
 *
 * The OCR box stores pixel coordinates relative to a rendered image of size
 * `renderedWidth × renderedHeight`. We scale proportionally to page dimensions.
 *
 * Note: PDF Y-axis is inverted (origin bottom-left). The OCR box uses
 * top-left origin, so we flip: pdfY = pageHeightPt − (y1 * scaleY).
 */
export function ocrBoxToPdfRect(
  box: OcrWordBox,
  pageWidthPt: number,
  pageHeightPt: number,
): TextRect {
  const scaleX = pageWidthPt / box.renderedWidth;
  const scaleY = pageHeightPt / box.renderedHeight;
  const x = box.x0 * scaleX;
  const width = (box.x1 - box.x0) * scaleX;
  const height = (box.y1 - box.y0) * scaleY;
  // y1 is the bottom of the box in pixel space (y increases downward for pixels),
  // which maps to the bottom of the box in PDF space.
  const y = pageHeightPt - box.y1 * scaleY;
  return { x, y, width, height };
}

/**
 * Compute the union bounding rect of an array of rects.
 * Returns null for an empty array.
 */
export function unionRects(rects: ReadonlyArray<TextRect>): TextRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Convert a PDF-space TextRect to DOM pixel coordinates.
 *
 * DOM Y-axis is inverted (origin top-left, y increases downward).
 * domY = (pageHeightPt − rect.y − rect.height) * zoom
 */
export function pdfRectToDom(
  rect: TextRect,
  pageHeightPt: number,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * zoom,
    top: (pageHeightPt - rect.y - rect.height) * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSpanTarget(t: AnyTextTarget): t is TextSpanTarget {
  return t.kind === 'span';
}

export function isLineTarget(t: AnyTextTarget): t is TextLineTarget {
  return t.kind === 'line';
}

export function isParagraphTarget(t: AnyTextTarget): t is TextParagraphTarget {
  return t.kind === 'paragraph';
}

export function isBlockTarget(t: AnyTextTarget): t is TextBlockTarget {
  return t.kind === 'block';
}

/** True when the OCR target has confidence below the threshold. */
export function isLowConfidence(target: TextSpanTarget): boolean {
  return target.source === 'ocr' &&
    target.confidence !== undefined &&
    target.confidence < OCR_LOW_CONFIDENCE_THRESHOLD;
}
