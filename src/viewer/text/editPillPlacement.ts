// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

export interface PillBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PillPlacement {
  readonly top: number;
  readonly left: number;
  readonly side: 'above' | 'below';
}

/**
 * Where the floating edit pill goes relative to the paragraph being edited
 * (all values in DOM pixels inside the page).
 *
 * The pill sits above the paragraph. When there is no room above (a line near
 * the page top, or a small window that shrinks the page), the old code clamped
 * the pill to top 0 and it landed on top of the editor, which has a higher
 * z-index and swallowed clicks on the pill's Save button (J-40 at 1028x729).
 * Now it flips below the paragraph instead, so the two never overlap, and the
 * pill is clamped horizontally inside the page.
 */
export function placeEditPill(
  paragraph: PillBox,
  pill: { width: number; height: number },
  offset: number,
  page: { width: number; height: number } | null,
): PillPlacement {
  const roomAbove = paragraph.top - pill.height - offset >= 0;
  const side = roomAbove ? 'above' : 'below';
  const top = roomAbove
    ? paragraph.top - pill.height - offset
    : paragraph.top + paragraph.height + offset;
  let left = paragraph.left + (paragraph.width - pill.width) / 2;
  if (page) left = Math.min(left, page.width - pill.width);
  left = Math.max(0, left);
  return { top, left, side };
}

/**
 * Keep the pill inside the part of the page the user can actually see.
 *
 * The page sits in a scroll container; with the edit side panel open and a
 * small window the visible strip is ~560px wide and a 450px pill centred on a
 * paragraph can have its right end (the Save button) clipped away, so a click
 * there lands on the canvas behind (J-40 at 1028x729). All inputs are client
 * coordinates except `left`, which is the pill's left inside the page.
 * Returns the new left inside the page.
 */
export function clampPillIntoViewport(
  left: number,
  pillWidth: number,
  pageLeftOnScreen: number,
  viewport: { left: number; right: number },
  margin = 8,
): number {
  const minClient = viewport.left + margin;
  const maxClient = Math.max(minClient, viewport.right - margin - pillWidth);
  const client = Math.min(Math.max(pageLeftOnScreen + left, minClient), maxClient);
  return client - pageLeftOnScreen;
}
