// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/** Smallest and largest size the edit panel steps to, in pt. */
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 72;

/**
 * The size one step smaller (delta -1) or larger (+1) than `size`: whole
 * points, within 6–72 pt. A fractional size (11.04 pt from a scaled PDF) steps
 * to the neighbouring whole point, never back to itself.
 */
export function nextFontSize(size: number, delta: -1 | 1): number {
  const base = delta > 0 ? Math.floor(size) : Math.ceil(size);
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, base + delta));
}

/** The edit panel's two size buttons, by test id, and the step each takes. */
export const FONT_SIZE_BUTTONS = {
  'edit-font-size-smaller': -1,
  'edit-font-size-larger': 1,
} as const satisfies Record<string, -1 | 1>;
