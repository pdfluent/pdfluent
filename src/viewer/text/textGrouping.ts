// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Grouping
 *
 * Groups raw TextSpan arrays (digital or OCR) into the hierarchical
 * structure defined by textInteractionModel:
 *   spans → lines → paragraphs → blocks
 *
 * All grouping is heuristic, tuned for typical single-column and
 * two-column PDF layouts. Complex layouts (multi-column, rotated text,
 * tables) will produce usable but imperfect groupings.
 *
 * Design:
 * - Pure functions: no side-effects, deterministic given the same input.
 * - Stable ids: derived from pageIndex + structural indices.
 * - Safe: never throws; degrades gracefully to singleton groups.
 */

import type { TextSpan } from '../../core/document';
import {
  ocrBoxToPdfRect,
  unionRects,
  type TextSpanTarget,
  type TextLineTarget,
  type TextParagraphTarget,
  type TextBlockTarget,
  type PageTextStructure,
  type OcrWordBox,
} from './textInteractionModel';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/**
 * Two spans are on the same line when their Y-midpoints differ by at most
 * `LINE_Y_TOLERANCE_FACTOR × averageFontSize`.
 */
const LINE_Y_TOLERANCE_FACTOR = 0.6;

/**
 * Two consecutive lines belong to the same paragraph when the vertical gap
 * between them is at most `PARAGRAPH_GAP_FACTOR × averageLineHeight`.
 * A larger gap starts a new paragraph.
 */
const PARAGRAPH_GAP_FACTOR = 1.4;

/**
 * Two consecutive paragraphs belong to the same block when:
 * - their horizontal extents overlap by at least `BLOCK_X_OVERLAP_FACTOR`
 * - the vertical gap is at most `BLOCK_GAP_FACTOR × avgParagraphHeight`
 */
const BLOCK_GAP_FACTOR = 2.5;
const BLOCK_X_OVERLAP_FACTOR = 0.3;

// ---------------------------------------------------------------------------
// Digital text grouping
// ---------------------------------------------------------------------------

/**
 * Build a PageTextStructure from an array of TextSpans (digital source).
 */
export function groupDigitalTextSpans(
  spans: ReadonlyArray<TextSpan>,
  pageIndex: number,
): PageTextStructure {
  const spanTargets = spans.map((s, i): TextSpanTarget => ({
    kind: 'span',
    id: `p${pageIndex}:s${i}`,
    source: 'digital',
    text: s.text,
    rect: { ...s.rect },
    fontSize: s.fontSize,
  }));

  const lines = groupSpansIntoLines(spanTargets, pageIndex);
  const paragraphs = groupLinesIntoParagraphs(lines, pageIndex);
  const blocks = groupParagraphsIntoBlocks(paragraphs, pageIndex);

  return { pageIndex, source: 'digital', spans: spanTargets, lines, paragraphs, blocks };
}

// ---------------------------------------------------------------------------
// OCR text grouping
// ---------------------------------------------------------------------------

/**
 * Build a PageTextStructure from an array of OcrWordBoxes (ocr source).
 */
export function groupOcrWordBoxes(
  boxes: ReadonlyArray<OcrWordBox>,
  pageIndex: number,
  pageWidthPt: number,
  pageHeightPt: number,
): PageTextStructure {
  const spanTargets = boxes.map((b, i): TextSpanTarget => ({
    kind: 'span',
    id: `p${pageIndex}:s${i}`,
    source: 'ocr',
    text: b.text,
    rect: ocrBoxToPdfRect(b, pageWidthPt, pageHeightPt),
    fontSize: estimateFontSizeFromRect(b.y1 - b.y0, b.renderedHeight, pageHeightPt),
    confidence: b.confidence,
  }));

  const lines = groupSpansIntoLines(spanTargets, pageIndex);
  const paragraphs = groupLinesIntoParagraphs(lines, pageIndex);
  const blocks = groupParagraphsIntoBlocks(paragraphs, pageIndex);

  return { pageIndex, source: 'ocr', spans: spanTargets, lines, paragraphs, blocks };
}

/** Estimate font size from OCR box height. */
function estimateFontSizeFromRect(
  pixelHeight: number,
  renderedHeight: number,
  pageHeightPt: number,
): number {
  return (pixelHeight / renderedHeight) * pageHeightPt;
}

// ---------------------------------------------------------------------------
// Step 1: spans → lines
// ---------------------------------------------------------------------------

/**
 * Group spans into lines based on Y-midpoint proximity.
 *
 * Algorithm:
 * 1. Sort spans by Y-midpoint descending (top of page first in PDF space).
 * 2. For each span, find an existing line whose Y-midpoint is within tolerance.
 * 3. If found, add span to that line; otherwise start a new line.
 * 4. Sort each line's spans by X (left to right).
 * 5. Sort lines by baselineY descending (top to bottom on page).
 */
function groupSpansIntoLines(
  spans: ReadonlyArray<TextSpanTarget>,
  pageIndex: number,
): ReadonlyArray<TextLineTarget> {
  if (spans.length === 0) return [];

  const avgFontSize = spans.reduce((s, sp) => s + sp.fontSize, 0) / spans.length;
  const tolerance = LINE_Y_TOLERANCE_FACTOR * Math.max(avgFontSize, 4);

  // Each bucket: list of spans + running midY
  const buckets: Array<{ midY: number; spans: TextSpanTarget[] }> = [];

  for (const span of spans) {
    const midY = span.rect.y + span.rect.height / 2;
    const match = buckets.find(b => Math.abs(b.midY - midY) <= tolerance);
    if (match) {
      // Update bucket midY as weighted average for stability
      const n = match.spans.length;
      match.midY = (match.midY * n + midY) / (n + 1);
      match.spans.push(span);
    } else {
      buckets.push({ midY, spans: [span] });
    }
  }

  // Sort each bucket's spans left-to-right
  for (const b of buckets) {
    b.spans.sort((a, c) => a.rect.x - c.rect.x);
  }

  // Sort buckets top-to-bottom (descending PDF Y = top first)
  buckets.sort((a, b) => b.midY - a.midY);

  return buckets.map((b, i): TextLineTarget => {
    const rect = unionRects(b.spans.map(s => s.rect))!;
    return {
      kind: 'line',
      id: `p${pageIndex}:l${i}`,
      source: b.spans[0]?.source ?? 'digital',
      spans: b.spans,
      rect,
      baselineY: rect.y,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 2: lines → paragraphs
// ---------------------------------------------------------------------------

/**
 * Group lines into paragraphs.
 *
 * Lines are processed top-to-bottom. A new paragraph starts when the
 * vertical gap between consecutive lines exceeds the threshold.
 */
function groupLinesIntoParagraphs(
  lines: ReadonlyArray<TextLineTarget>,
  pageIndex: number,
): ReadonlyArray<TextParagraphTarget> {
  if (lines.length === 0) return [];

  const paragraphs: TextParagraphTarget[] = [];
  let current: TextLineTarget[] = [lines[0]!];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]!;
    const curr = lines[i]!;

    // Gap = vertical space between bottom of prev line and top of next line.
    // In PDF space (y upward): top of prev = prev.rect.y + prev.rect.height
    //                           top of curr = curr.rect.y + curr.rect.height
    // prev is above curr (higher Y), so gap = prev.rect.y − (curr.rect.y + curr.rect.height)
    const avgLineHeight = (prev.rect.height + curr.rect.height) / 2;
    const gap = prev.rect.y - (curr.rect.y + curr.rect.height);
    const threshold = PARAGRAPH_GAP_FACTOR * Math.max(avgLineHeight, 4);

    if (gap > threshold) {
      // Flush current paragraph, start new one
      paragraphs.push(buildParagraph(current, pageIndex, paragraphs.length));
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  // Flush final paragraph
  paragraphs.push(buildParagraph(current, pageIndex, paragraphs.length));

  return paragraphs;
}

function buildParagraph(
  lines: TextLineTarget[],
  pageIndex: number,
  idx: number,
): TextParagraphTarget {
  const rect = unionRects(lines.map(l => l.rect))!;
  return {
    kind: 'paragraph',
    id: `p${pageIndex}:par${idx}`,
    source: lines[0]?.source ?? 'digital',
    lines,
    rect,
  };
}

// ---------------------------------------------------------------------------
// Step 3: paragraphs → blocks
// ---------------------------------------------------------------------------

/**
 * Group paragraphs into blocks.
 *
 * A new block starts when:
 * - the vertical gap exceeds blockGapFactor × avgParagraphHeight, OR
 * - there is insufficient horizontal overlap between the paragraphs.
 */
function groupParagraphsIntoBlocks(
  paragraphs: ReadonlyArray<TextParagraphTarget>,
  pageIndex: number,
): ReadonlyArray<TextBlockTarget> {
  if (paragraphs.length === 0) return [];

  const blocks: TextBlockTarget[] = [];
  let current: TextParagraphTarget[] = [paragraphs[0]!];

  for (let i = 1; i < paragraphs.length; i++) {
    const prev = paragraphs[i - 1]!;
    const curr = paragraphs[i]!;

    const avgHeight = (prev.rect.height + curr.rect.height) / 2;
    const gap = prev.rect.y - (curr.rect.y + curr.rect.height);
    const xOverlap = computeXOverlap(prev.rect, curr.rect);

    const gapTooBig = gap > BLOCK_GAP_FACTOR * Math.max(avgHeight, 8);
    const noXOverlap = xOverlap < BLOCK_X_OVERLAP_FACTOR;

    if (gapTooBig || noXOverlap) {
      blocks.push(buildBlock(current, pageIndex, blocks.length));
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  blocks.push(buildBlock(current, pageIndex, blocks.length));

  return blocks;
}

/** Fraction of the narrower paragraph's width that overlaps horizontally. */
function computeXOverlap(
  a: { x: number; width: number },
  b: { x: number; width: number },
): number {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const overlapLeft = Math.max(a.x, b.x);
  const overlapRight = Math.min(aRight, bRight);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const minWidth = Math.min(a.width, b.width);
  if (minWidth <= 0) return 0;
  return overlapWidth / minWidth;
}

function buildBlock(
  paras: TextParagraphTarget[],
  pageIndex: number,
  idx: number,
): TextBlockTarget {
  const rect = unionRects(paras.map(p => p.rect))!;
  return {
    kind: 'block',
    id: `p${pageIndex}:b${idx}`,
    source: paras[0]?.source ?? 'digital',
    paragraphs: paras,
    rect,
  };
}
