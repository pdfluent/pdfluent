// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Moving and resizing a selected annotation (J-46, J-55).
 *
 * Everything here is in PDF user space: origin bottom-left, y up, points. The
 * overlay converts pointer deltas into that space before it asks, so the rect
 * that reaches `update_annotation_rect` is the rect the file gets.
 */

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

/** Smallest box a resize may leave: a handle must stay grabbable. */
export const MIN_ANNOTATION_SIZE = 4;

/**
 * Annotations a user can pick up and move. Text markup sits on the words it
 * marks, and a sticky note is moved by its comment thread, so neither is here.
 */
const MOVABLE_TYPES = new Set(['square', 'circle', 'line', 'ink', 'stamp', 'freetext', 'polygon', 'polyline', 'redaction']);

export function isMovableAnnotation(type: string | undefined): boolean {
  return type !== undefined && MOVABLE_TYPES.has(type);
}

/** `[x0, y0, x1, y1]`, the shape every annotation command takes. */
export function toBackendRect(r: PdfRect): [number, number, number, number] {
  return [r.x, r.y, r.x + r.width, r.y + r.height];
}

export function moveRect(r: PdfRect, dx: number, dy: number): PdfRect {
  return { ...r, x: r.x + dx, y: r.y + dy };
}

/**
 * Drag one corner by `(dx, dy)`. The opposite corner stays put, and the box
 * never shrinks below {@link MIN_ANNOTATION_SIZE} or turns inside out.
 */
export function resizeRect(r: PdfRect, handle: ResizeHandle, dx: number, dy: number): PdfRect {
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.width;
  let y1 = r.y + r.height;
  // In PDF space the north edge is the high y.
  if (handle === 'nw' || handle === 'sw') x0 = Math.min(x0 + dx, x1 - MIN_ANNOTATION_SIZE);
  else x1 = Math.max(x1 + dx, x0 + MIN_ANNOTATION_SIZE);
  if (handle === 'nw' || handle === 'ne') y1 = Math.max(y1 + dy, y0 + MIN_ANNOTATION_SIZE);
  else y0 = Math.min(y0 + dy, y1 - MIN_ANNOTATION_SIZE);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Arrow keys nudge a selected annotation: 1 pt, or 10 with Shift. `null`
 * for any other key, so the caller leaves it to whoever else listens.
 */
export function nudgeForKey(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 10 : 1;
  switch (key) {
    case 'ArrowLeft': return { dx: -step, dy: 0 };
    case 'ArrowRight': return { dx: step, dy: 0 };
    case 'ArrowUp': return { dx: 0, dy: step };
    case 'ArrowDown': return { dx: 0, dy: -step };
    default: return null;
  }
}

/** A pointer delta on screen (y down, zoomed) as a delta in PDF space. */
export function screenDeltaToPdf(dxPx: number, dyPx: number, zoom: number): { dx: number; dy: number } {
  const z = zoom > 0 ? zoom : 1;
  return { dx: dxPx / z, dy: -dyPx / z };
}

/** `#rrggbb` as the 0..1 triple the backend takes; `null` when it is not one. */
export function hexToPdfColor(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const channel = (c: string | undefined) => Math.round((parseInt(c ?? '0', 16) / 255) * 1000) / 1000;
  return [channel(m[1]), channel(m[2]), channel(m[3])];
}
