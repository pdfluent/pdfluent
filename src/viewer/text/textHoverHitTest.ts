// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Hover Hit Testing
 *
 * Converts a mouse position (DOM pixel coordinates relative to the page
 * canvas origin) to the deepest text target under the cursor.
 *
 * Zoom-aware: all DOM coordinates are converted to PDF space before
 * testing against the grouped structure.
 *
 * Degrades safely: returns null when no grouping is available or when
 * the pointer is outside all text targets.
 *
 * Hit-test priority (deepest wins):
 *   paragraph  ← primary interaction unit for Phase 2
 *   line       ← fallback when paragraph is not found
 *   block      ← ambient context (not currently returned, reserved)
 */

import type {
  PageTextStructure,
  TextParagraphTarget,
  TextLineTarget,
  TextRect,
} from './textInteractionModel';

// ---------------------------------------------------------------------------
// Hit-test result
// ---------------------------------------------------------------------------

export interface TextHoverTarget {
  /** The hovered paragraph, or null when only a line was found. */
  paragraph: TextParagraphTarget | null;
  /** The hovered line (always set when anything is hovered). */
  line: TextLineTarget;
}

// ---------------------------------------------------------------------------
// Core hit-test function
// ---------------------------------------------------------------------------

/**
 * Find the text target under a DOM-space mouse position.
 *
 * @param domX - Mouse X relative to the page canvas origin, in pixels.
 * @param domY - Mouse Y relative to the page canvas origin, in pixels.
 * @param structure - Grouped text structure for the current page.
 * @param pageHeightPt - Page height in PDF points (needed for Y flip).
 * @param zoom - Current zoom factor.
 * @returns The hovered target, or null if no text is under the cursor.
 */
export function hitTestText(
  domX: number,
  domY: number,
  structure: PageTextStructure | null,
  pageHeightPt: number,
  zoom: number,
): TextHoverTarget | null {
  if (!structure || zoom <= 0) return null;

  // Convert DOM coords to PDF space
  const pdfX = domX / zoom;
  // DOM Y increases downward; PDF Y increases upward
  const pdfY = pageHeightPt - domY / zoom;

  // Try paragraph hit first (preferred target)
  for (const para of structure.paragraphs) {
    if (rectContains(para.rect, pdfX, pdfY)) {
      // Find the specific line within the paragraph
      const line = para.lines.find(l => rectContains(l.rect, pdfX, pdfY))
        ?? para.lines[0]!; // fallback to first line
      return { paragraph: para, line };
    }
  }

  // Fallback: line-only hit (pointer is in a line but outside its paragraph rect)
  for (const line of structure.lines) {
    if (rectContains(line.rect, pdfX, pdfY)) {
      return { paragraph: null, line };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Expanded hit-test (with tolerance padding)
// ---------------------------------------------------------------------------

/**
 * Like `hitTestText` but expands each target's rect by `paddingPt` points
 * before testing. Useful for making narrow lines and short words easier to
 * hover, especially at low zoom levels.
 *
 * @param paddingPt - Extra hit-area padding in PDF points.
 */
export function hitTestTextWithPadding(
  domX: number,
  domY: number,
  structure: PageTextStructure | null,
  pageHeightPt: number,
  zoom: number,
  paddingPt: number,
): TextHoverTarget | null {
  if (!structure || zoom <= 0) return null;

  const pdfX = domX / zoom;
  const pdfY = pageHeightPt - domY / zoom;

  for (const para of structure.paragraphs) {
    if (rectContainsPadded(para.rect, pdfX, pdfY, paddingPt)) {
      const line = para.lines.find(l => rectContainsPadded(l.rect, pdfX, pdfY, paddingPt))
        ?? para.lines[0]!;
      return { paragraph: para, line };
    }
  }

  for (const line of structure.lines) {
    if (rectContainsPadded(line.rect, pdfX, pdfY, paddingPt)) {
      return { paragraph: null, line };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function rectContains(rect: TextRect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function rectContainsPadded(rect: TextRect, x: number, y: number, pad: number): boolean {
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.width + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.height + pad
  );
}

// ---------------------------------------------------------------------------
// Closest target (for snap behaviour)
// ---------------------------------------------------------------------------

/**
 * Return the paragraph whose centre is closest to the given PDF-space point.
 * Used as a fallback when the pointer is slightly outside all rects.
 */
export function closestParagraph(
  pdfX: number,
  pdfY: number,
  structure: PageTextStructure,
): TextParagraphTarget | null {
  if (structure.paragraphs.length === 0) return null;

  let best: TextParagraphTarget | null = null;
  let bestDist = Infinity;

  for (const para of structure.paragraphs) {
    const cx = para.rect.x + para.rect.width / 2;
    const cy = para.rect.y + para.rect.height / 2;
    const dist = Math.hypot(pdfX - cx, pdfY - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = para;
    }
  }

  return best;
}
