// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
const MIN_SEGMENT_WIDTH_PT = 1.5;

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
  const initialSpanTargets = spans.flatMap((s, i) => splitTextSpanForEditing(s, pageIndex, i));

  const initialLines = groupSpansIntoLines(initialSpanTargets, pageIndex);
  
  const lines: TextLineTarget[] = [];
  const spanTargets: TextSpanTarget[] = [];
  
  for (const line of initialLines) {
    const mergedSpans = mergeContiguousSpansInLine(line.spans);
    spanTargets.push(...mergedSpans);
    const lineRect = unionRects(mergedSpans.map(s => s.rect))!;
    lines.push({
      ...line,
      spans: mergedSpans,
      rect: lineRect,
      baselineY: lineRect.y,
    });
  }

  const paragraphs = groupLinesIntoParagraphs(lines, pageIndex);
  const blocks = groupParagraphsIntoBlocks(paragraphs, pageIndex);

  return { pageIndex, source: 'digital', spans: spanTargets, lines, paragraphs, blocks };
}

/**
 * PDF extractors often return one visual line as a single span. For editing,
 * that is too coarse: it makes multi-column documents and resume/table rows
 * feel like one giant editable line. Split large spans into word-like segments
 * for interaction while preserving the original PDF metadata on each segment.
 *
 * Persistence is still routed through the mutation backend with the exact
 * segment text, so unsupported complex writes fail honestly instead of letting
 * the UI select half a page.
 */
let canvasElement: HTMLCanvasElement | null = null;

export function getCanvasFont(fontName: string | undefined, fontSize: number): string {
  const name = (fontName || '').toLowerCase();
  let family = 'sans-serif';
  if (name.includes('courier') || name.includes('mono')) {
    family = 'monospace';
  } else if (name.includes('times') || name.includes('roman') || name.includes('serif') || name.includes('georgia')) {
    family = 'serif';
  }
  return `${fontSize}pt ${family}`;
}

export function measureTextWidth(text: string, fontName: string | undefined, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.5;
  if (!canvasElement) {
    canvasElement = document.createElement('canvas');
  }
  const ctx = canvasElement.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.5;
  ctx.font = getCanvasFont(fontName, fontSize);
  const w = ctx.measureText(text).width;
  return w > 0 ? w : text.length * fontSize * 0.5;
}

function splitTextSpanForEditing(
  span: TextSpan,
  pageIndex: number,
  spanIndex: number,
): TextSpanTarget[] {
  const base = {
    kind: 'span' as const,
    source: 'digital' as const,
    fontSize: span.fontSize,
    fontName: span.fontName,
    isBold: span.isBold,
    isItalic: span.isItalic,
    color: span.color,
    widthSource: span.widthSource,
  };

  const text = span.text;
  if (text.trim().length === 0) {
    return [{
      ...base,
      id: `p${pageIndex}:s${spanIndex}`,
      text,
      rawText: span.rawText,
      rect: { ...span.rect },
      charBounds: span.charBounds,
    }];
  }

  const tokenRanges = findEditableTokenRanges(span);
  if (tokenRanges.length <= 1) {
    const rect = { ...span.rect };
    if (!span.charBounds && span.widthSource !== 'Metric') {
      const actualWidth = measureTextWidth(text.trim(), span.fontName, span.fontSize);
      rect.width = Math.max(MIN_SEGMENT_WIDTH_PT, Math.min(span.rect.width, actualWidth));
    }
    return [{
      ...base,
      id: `p${pageIndex}:s${spanIndex}`,
      text,
      rawText: span.rawText,
      rect,
      charBounds: span.charBounds,
    }];
  }

  // For spans with artifact-repaired text, compute token ranges on the raw text too.
  // Repair only affects intra-word chars; spaces are never changed, so both raw and
  // repaired produce the same number of whitespace-delimited tokens.
  const rawTokenRanges = span.rawText
    ? findEditableTokenRangesForText(span.rawText)
    : null;

  return tokenRanges.map((range, segmentIndex): TextSpanTarget => {
    const rect = rectForTextRange(span, range.start, range.end);
    const rawRange = rawTokenRanges?.[segmentIndex];
    return {
      ...base,
      id: `p${pageIndex}:s${spanIndex}:seg${segmentIndex}`,
      text: text.slice(range.start, range.end),
      rawText: rawRange ? span.rawText!.slice(rawRange.start, rawRange.end) : undefined,
      rect,
      charBounds: sliceCharBounds(span.charBounds, range.start, range.end),
    };
  });
}

function findEditableTokenRanges(span: TextSpan): Array<{ start: number; end: number }> {
  const text = span.text;
  const charBounds = span.charBounds;
  const ranges: Array<{ start: number; end: number }> = [];
  
  if (charBounds && charBounds.length === text.length) {
    let start = 0;
    for (let i = 0; i < text.length - 1; i++) {
      const cur = charBounds[i];
      const next = charBounds[i + 1];
      if (cur && next) {
        const gap = next.x - (cur.x + cur.width);
        // Visual gap threshold: split if gap is larger than 1.2 * fontSize or 12pt
        const threshold = Math.max(12, span.fontSize * 1.2);
        if (gap > threshold) {
          if (start <= i) {
            ranges.push({ start, end: i + 1 });
          }
          start = i + 1;
        }
      }
    }
    if (start < text.length) {
      ranges.push({ start, end: text.length });
    }
  } else {
    // If no charBounds, split on 2 or more consecutive whitespace characters
    const tokenRegex = /\s{2,}/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (start < matchIndex) {
        ranges.push({ start, end: matchIndex });
      }
      start = matchIndex + match[0].length;
    }
    if (start < text.length) {
      ranges.push({ start, end: text.length });
    }
  }
  
  // Trim spaces and filter out empty ranges
  return ranges.map(r => {
    let s = r.start;
    let e = r.end;
    while (s < e && /\s/.test(text[s] || '')) s++;
    while (e > s && /\s/.test(text[e - 1] || '')) e--;
    return { start: s, end: e };
  }).filter(r => r.end > r.start);
}

// Plain-text variant used to compute raw token ranges for artifact-repaired spans.
// Repair never changes spaces, so this produces the same number of tokens as the
// repaired version — allowing 1:1 mapping between repaired and raw segments.
function findEditableTokenRangesForText(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const tokenRegex = /\s{2,}/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    if (start < matchIndex) ranges.push({ start, end: matchIndex });
    start = matchIndex + match[0].length;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges.map(r => {
    let s = r.start;
    let e = r.end;
    while (s < e && /\s/.test(text[s] || '')) s++;
    while (e > s && /\s/.test(text[e - 1] || '')) e--;
    return { start: s, end: e };
  }).filter(r => r.end > r.start);
}

function rectForTextRange(span: TextSpan, start: number, end: number): { x: number; y: number; width: number; height: number } {
  const charBounds = span.charBounds;
  if (charBounds && charBounds.length >= end) {
    const first = charBounds[start];
    const last = charBounds[end - 1];
    if (first && last) {
      const x = first.x;
      const right = last.x + last.width;
      return {
        x,
        y: span.rect.y,
        width: Math.max(MIN_SEGMENT_WIDTH_PT, right - x),
        height: span.rect.height,
      };
    }
  }

  // Use canvas measurement for precise word positioning and width fallback
  const prefix = span.text.slice(0, start);
  const token = span.text.slice(start, end);
  const prefixWidth = measureTextWidth(prefix, span.fontName, span.fontSize);
  const tokenWidth = measureTextWidth(token, span.fontName, span.fontSize);

  const x = span.rect.x + prefixWidth;
  return {
    x,
    y: span.rect.y,
    width: Math.max(MIN_SEGMENT_WIDTH_PT, tokenWidth),
    height: span.rect.height,
  };
}

function sliceCharBounds(
  charBounds: TextSpan['charBounds'],
  start: number,
  end: number,
): TextSpanTarget['charBounds'] {
  if (!charBounds || charBounds.length < end) return undefined;
  return charBounds.slice(start, end).map(bound => ({
    x: bound.x,
    width: bound.width,
  }));
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

  const initialLines = groupSpansIntoLines(spanTargets, pageIndex);
  
  const lines: TextLineTarget[] = [];
  const spans: TextSpanTarget[] = [];
  
  for (const line of initialLines) {
    // For OCR, do NOT merge contiguous word boxes as each word box must remain separate
    const spansInLine = [...line.spans];
    spans.push(...spansInLine);
    const lineRect = unionRects(spansInLine.map(s => s.rect))!;
    lines.push({
      ...line,
      spans: spansInLine,
      rect: lineRect,
      baselineY: lineRect.y,
    });
  }

  const paragraphs = groupLinesIntoParagraphs(lines, pageIndex);
  const blocks = groupParagraphsIntoBlocks(paragraphs, pageIndex);

  return { pageIndex, source: 'ocr', spans, lines, paragraphs, blocks };
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

  // Sort spans top-to-bottom and left-to-right
  const sortedSpans = [...spans].sort((a, b) => {
    const midYa = a.rect.y + a.rect.height / 2;
    const midYb = b.rect.y + b.rect.height / 2;
    if (Math.abs(midYa - midYb) > tolerance) {
      return midYb - midYa;
    }
    return a.rect.x - b.rect.x;
  });

  // Each bucket: list of spans + running midY
  const buckets: Array<{ midY: number; spans: TextSpanTarget[] }> = [];

  for (const span of sortedSpans) {
    const midY = span.rect.y + span.rect.height / 2;
    
    // Find an existing bucket on the Y-level where the horizontal gap is small (column detection)
    const match = buckets.find(b => {
      if (Math.abs(b.midY - midY) > tolerance) return false;
      const rightEdge = b.spans.reduce((max, s) => Math.max(max, s.rect.x + s.rect.width), 0);
      const gap = span.rect.x - rightEdge;
      const maxGap = Math.max(30, span.fontSize * 2.0);
      return gap <= maxGap;
    });

    if (match) {
      const n = match.spans.length;
      match.midY = (match.midY * n + midY) / (n + 1);
      match.spans.push(span);
    } else {
      buckets.push({ midY, spans: [span] });
    }
  }

  // Sort each bucket's spans left-to-right (already sorted, but keep for safety)
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

    let shouldSplit = gap > threshold;

    if (!shouldSplit) {
      // 1. Fontgrootte-verschil
      const prevFontSize = prev.spans.reduce((s, sp) => s + sp.fontSize, 0) / prev.spans.length;
      const currFontSize = curr.spans.reduce((s, sp) => s + sp.fontSize, 0) / curr.spans.length;
      if (Math.abs(prevFontSize - currFontSize) > 1.5) {
        shouldSplit = true;
      }
    }

    if (!shouldSplit) {
      // 2. Bold/Italic stijl-verandering
      const prevIsBold = prev.spans.some(sp => sp.isBold === true || sp.fontName?.toLowerCase().includes('bold'));
      const currIsBold = curr.spans.some(sp => sp.isBold === true || sp.fontName?.toLowerCase().includes('bold'));

      const prevIsItalic = prev.spans.some(sp => sp.isItalic === true || sp.fontName?.toLowerCase().includes('italic'));
      const currIsItalic = curr.spans.some(sp => sp.isItalic === true || sp.fontName?.toLowerCase().includes('italic'));

      if (prevIsBold !== currIsBold || prevIsItalic !== currIsItalic) {
        shouldSplit = true;
      }
    }

    if (!shouldSplit) {
      // 3. Lettertype (fontName) verschil met normalisatie (negeer subset prefixes zoals AAAAAA+)
      const prevFont = cleanFontName(prev.spans[0]?.fontName);
      const currFont = cleanFontName(curr.spans[0]?.fontName);
      if (prevFont && currFont && prevFont !== currFont) {
        shouldSplit = true;
      }
    }

    if (!shouldSplit) {
      // 4. Tekstkleur-verschil
      const prevColor = prev.spans[0]?.color;
      const currColor = curr.spans[0]?.color;
      if (prevColor && currColor && !colorsEqual(prevColor, currColor)) {
        shouldSplit = true;
      }
    }

    if (!shouldSplit) {
      // 5. Horizontale overlap (kolommen en datums scheiden)
      const xOverlap = computeXOverlap(prev.rect, curr.rect);
      if (xOverlap < 0.4) {
        shouldSplit = true;
      }
    }

    if (shouldSplit) {
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

export function cleanFontName(name: string | undefined): string {
  if (!name) return '';
  const plusIdx = name.indexOf('+');
  const base = plusIdx !== -1 ? name.slice(plusIdx + 1) : name;
  return base.toLowerCase().trim();
}

export function colorsEqual(
  c1: [number, number, number] | readonly [number, number, number] | undefined,
  c2: [number, number, number] | readonly [number, number, number] | undefined,
): boolean {
  if (!c1 && !c2) return true;
  if (!c1 || !c2) return false;
  return Math.abs(c1[0] - c2[0]) < 0.05 &&
         Math.abs(c1[1] - c2[1]) < 0.05 &&
         Math.abs(c1[2] - c2[2]) < 0.05;
}

function mergeContiguousSpansInLine(spans: ReadonlyArray<TextSpanTarget>): TextSpanTarget[] {
  if (spans.length <= 1) return [...spans];

  const merged: TextSpanTarget[] = [];
  let current = { ...spans[0]! };

  for (let i = 1; i < spans.length; i++) {
    const next = spans[i]!;

    // 1. Check if same style
    const sameFont = cleanFontName(current.fontName) === cleanFontName(next.fontName);
    const sameSize = Math.abs(current.fontSize - next.fontSize) < 0.5;
    const sameColor = colorsEqual(current.color, next.color);
    const sameBold = current.isBold === next.isBold;
    const sameItalic = current.isItalic === next.isItalic;

    // 2. Check if close horizontally
    const gap = next.rect.x - (current.rect.x + current.rect.width);
    // Allow small gap (up to 1.5 * fontSize or 15pt) to group words into sentences
    const maxGap = Math.max(15, current.fontSize * 1.5);
    const closeHorizontally = gap <= maxGap;

    if (sameFont && sameSize && sameColor && sameBold && sameItalic && closeHorizontally) {
      // Merge next into current
      const addSpace = !current.text.endsWith(' ') && !next.text.startsWith(' ') && gap > 1.5;
      const textToAppend = addSpace ? ' ' + next.text : next.text;
      
      // Merge rect
      const rectX = Math.min(current.rect.x, next.rect.x);
      const rectY = Math.min(current.rect.y, next.rect.y);
      const rectW = Math.max(current.rect.x + current.rect.width, next.rect.x + next.rect.width) - rectX;
      const rectH = Math.max(current.rect.y + current.rect.height, next.rect.y + next.rect.height) - rectY;
      
      // Merge charBounds
      let charBounds = current.charBounds;
      if (current.charBounds && next.charBounds) {
        const mergedBounds = [...current.charBounds];
        if (addSpace) {
          const spaceX = current.rect.x + current.rect.width;
          const spaceW = next.rect.x - spaceX;
          mergedBounds.push({ x: spaceX, width: Math.max(1, spaceW) });
        }
        mergedBounds.push(...next.charBounds);
        charBounds = mergedBounds;
      } else {
        charBounds = undefined;
      }

      const currentRaw = current.rawText ?? current.text;
      const nextRaw = next.rawText ?? next.text;
      const rawToAppend = addSpace ? ' ' + nextRaw : nextRaw;
      const mergedRaw = currentRaw + rawToAppend;
      current = {
        ...current,
        text: current.text + textToAppend,
        rawText: mergedRaw !== current.text + textToAppend ? mergedRaw : undefined,
        rect: { x: rectX, y: rectY, width: rectW, height: rectH },
        charBounds,
        confidence: current.confidence !== undefined && next.confidence !== undefined
          ? Math.min(current.confidence, next.confidence)
          : current.confidence,
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}
