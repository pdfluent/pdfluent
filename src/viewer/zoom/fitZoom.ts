// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Which zoom a document opens at. Plain functions: no React, no DOM, so the
// rule below is tested on its own in tests/viewer-fit-zoom.test.ts.
//
// Zoom is a factor on the page's size in points: 1 is 100% ("actual size"), a
// page 595 pt wide is 595 CSS px wide at zoom 1.
//
// THE RULE (default setting "Fit width")
//   1. Fit width: the page is as wide as the viewport minus a gutter, never
//      more than FIT_MAX_ZOOM (200%) so a narrow page does not become huge,
//      never less than MIN_ZOOM.
//   2. If the page at that zoom is taller than the viewport, and showing it
//      whole is a clear gain, use Fit page instead. "Clear gain" is: the page
//      is landscape (a slide or a landscape sheet is meant to be seen whole),
//      or Fit page is within 80% of the Fit width zoom (the page nearly fits,
//      so the reader loses little by seeing all of it).
//   3. A tall portrait page that would have to shrink a lot to fit stays at
//      Fit width: the reader scrolls, which is what a portrait document asks.
// The reference page is the first page, so scrolling through a document with
// mixed page sizes never changes the zoom.

export type DefaultZoom = 'fit-width' | 'fit-page' | 'actual-size' | 'last-used';

export const DEFAULT_ZOOM_CHOICES: readonly DefaultZoom[] = [
  'fit-width',
  'fit-page',
  'actual-size',
  'last-used',
];

export const DEFAULT_ZOOM: DefaultZoom = 'fit-width';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** Fit width and Fit page never go past this. */
export const FIT_MAX_ZOOM = 2;
/** Fit page replaces Fit width for a portrait page only when it keeps this share of its zoom. */
export const FIT_PAGE_MIN_SHARE = 0.8;

export interface Size {
  width: number;
  height: number;
}

/**
 * Space the page keeps clear of the canvas edges, in CSS px. The bottom is
 * larger because the floating page and zoom bar sits over it.
 */
export const VIEWPORT_INSETS = { x: 24, top: 24, bottom: 72 } as const;

export function isDefaultZoom(value: unknown): value is DefaultZoom {
  return typeof value === 'string' && (DEFAULT_ZOOM_CHOICES as readonly string[]).includes(value);
}

function usable(viewport: Size): Size {
  return {
    width: viewport.width - 2 * VIEWPORT_INSETS.x,
    height: viewport.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom,
  };
}

function valid(size: Size): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

/** Clamp into the fit range and round down to 1%, so the page never overflows by rounding. */
function settle(raw: number): number {
  const clamped = Math.min(FIT_MAX_ZOOM, Math.max(MIN_ZOOM, raw));
  return Math.max(MIN_ZOOM, Math.floor(clamped * 100 + 1e-9) / 100);
}

/** Zoom at which the page is as wide as the viewport allows; null when nothing is laid out yet. */
export function fitWidthZoom(page: Size, viewport: Size): number | null {
  if (!valid(page) || !valid(viewport)) return null;
  const room = usable(viewport);
  if (room.width <= 0) return MIN_ZOOM;
  return settle(room.width / page.width);
}

/** Zoom at which the whole page is visible; null when nothing is laid out yet. */
export function fitPageZoom(page: Size, viewport: Size): number | null {
  if (!valid(page) || !valid(viewport)) return null;
  const room = usable(viewport);
  if (room.width <= 0 || room.height <= 0) return MIN_ZOOM;
  return settle(Math.min(room.width / page.width, room.height / page.height));
}

export type FitKind = 'fit-width' | 'fit-page';

/** The rule above: Fit width, or Fit page where that is clearly the better use of the window. */
export function autoFit(page: Size, viewport: Size): { zoom: number; kind: FitKind } | null {
  const width = fitWidthZoom(page, viewport);
  const whole = fitPageZoom(page, viewport);
  if (width === null || whole === null) return null;
  const room = usable(viewport);
  const fitsAtWidth = page.height * width <= room.height;
  if (fitsAtWidth) return { zoom: width, kind: 'fit-width' };
  const landscape = page.width > page.height;
  if (landscape || whole >= FIT_PAGE_MIN_SHARE * width) return { zoom: whole, kind: 'fit-page' };
  return { zoom: width, kind: 'fit-width' };
}

export interface ResolveInput {
  preference: DefaultZoom;
  /** First page of the document, in points. */
  page: Size | null;
  /** The canvas, in CSS px. */
  viewport: Size;
  /** The zoom the reader last chose by hand; null when there is none. */
  lastUsed: number | null;
}

/**
 * The zoom a document opens at, and keeps while the reader has not zoomed it.
 * Null means "cannot say yet" (no page or no layout): leave the zoom alone.
 */
export function resolveZoom(input: ResolveInput): number | null {
  const { preference, page, viewport, lastUsed } = input;
  switch (preference) {
    case 'actual-size':
      return 1;
    case 'last-used':
      if (lastUsed !== null && Number.isFinite(lastUsed) && lastUsed >= MIN_ZOOM && lastUsed <= MAX_ZOOM) {
        return lastUsed;
      }
      // Nothing chosen yet: behave like the default.
      return page ? (autoFit(page, viewport)?.zoom ?? null) : null;
    case 'fit-page':
      return page ? fitPageZoom(page, viewport) : null;
    case 'fit-width':
    default:
      return page ? (autoFit(page, viewport)?.zoom ?? null) : null;
  }
}
