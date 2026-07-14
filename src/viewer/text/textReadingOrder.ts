// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { TextBlockTarget } from './textInteractionModel';

/**
 * Sorts page text blocks in logical reading order:
 * - Spanning title/header blocks first.
 * - Side-by-side columns: left column blocks top-to-bottom, then right column blocks top-to-bottom.
 * - Spanning footer blocks last.
 */
export function sortBlocksForReading(
  blocks: ReadonlyArray<TextBlockTarget>,
  pageWidth: number,
): TextBlockTarget[] {
  const result = [...blocks];
  result.sort((a, b) => {
    // 1. If one block is significantly higher than the other (no Y overlap at all)
    // and spans across columns, it should come first.
    const aBottom = a.rect.y;
    const aTop = a.rect.y + a.rect.height;
    const bBottom = b.rect.y;
    const bTop = b.rect.y + b.rect.height;

    // Check if there is significant Y overlap between the two blocks
    const yOverlap = Math.max(0, Math.min(aTop, bTop) - Math.max(aBottom, bBottom));
    const minHeight = Math.min(a.rect.height, b.rect.height);
    const hasYOverlap = minHeight > 0 && yOverlap > 0.3 * minHeight;

    if (!hasYOverlap) {
      // One block is above the other.
      // If the top one is full-width (spans > 60% of page width), or they both span,
      // or their horizontal ranges overlap significantly (meaning they are in the same column),
      // then top-to-bottom order dominates.
      const aIsFullWidth = a.rect.width > 0.6 * pageWidth;
      const bIsFullWidth = b.rect.width > 0.6 * pageWidth;
      
      const xOverlap = computeXOverlap(a.rect, b.rect);
      const inSameColumn = xOverlap > 0.4;

      if (aIsFullWidth || bIsFullWidth || inSameColumn) {
        return bTop - aTop; // higher Y first
      }
    }

    // 2. Otherwise (they have Y overlap, or are side-by-side columns):
    // Sort primarily left-to-right (smaller X first)
    const xDiff = a.rect.x - b.rect.x;
    if (Math.abs(xDiff) > 20) { // threshold of 20pt to consider them in different columns
      return xDiff;
    }

    // 3. If they are in the same column, sort top-to-bottom (higher Y first)
    return bTop - aTop;
  });
  return result;
}

/** Fraction of the narrower block's width that overlaps horizontally. */
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
