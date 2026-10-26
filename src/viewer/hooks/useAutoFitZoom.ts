// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { autoFit, resolveZoom, type DefaultZoom, type Size } from '../zoom/fitZoom';
import { readLastUsedZoom } from './useZoomControls';

interface UseAutoFitZoomArgs {
  /** The scrolling canvas the pages sit in. */
  containerRef: RefObject<HTMLElement | null>;
  /** The open document; null while there is none. */
  documentId: string | null;
  /** First page in points; null while there is none. */
  firstPage: Size | null;
  /** Settings > View > Default zoom. */
  preference: DefaultZoom;
  /** The reader has zoomed this document by hand: leave it alone. */
  manual: boolean;
  zoom: number;
  /** Change the zoom without marking it as the reader's choice. */
  setAutoZoom: (zoom: number) => void;
  /** Mark the zoom as the reader's choice (the Fit button). */
  setZoom: (zoom: number) => void;
}

/**
 * Opens a document at its fitted zoom and keeps it fitted when the window (or
 * the canvas, when a side panel opens) changes size, until the reader zooms by
 * hand. Measured with offsetWidth/offsetHeight, which do not change when a
 * scrollbar appears, so fitting cannot feed back into itself.
 */
export function useAutoFitZoom(args: UseAutoFitZoomArgs): { fitNow: () => void } {
  const { containerRef, documentId, firstPage, preference, manual, zoom, setAutoZoom, setZoom } = args;
  const pageWidth = firstPage?.width ?? 0;
  const pageHeight = firstPage?.height ?? 0;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Resizing keeps the reader at the same place in the document: the scroll
  // offset follows the zoom factor once the new zoom is on screen.
  const scrollScaleRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (manual || !documentId || pageWidth <= 0 || pageHeight <= 0) return;
    const el = containerRef.current;
    if (!el) return;
    const page: Size = { width: pageWidth, height: pageHeight };

    const apply = (): void => {
      const next = resolveZoom({
        preference,
        page,
        viewport: { width: el.offsetWidth, height: el.offsetHeight },
        lastUsed: readLastUsedZoom(),
      });
      if (next === null || next === zoomRef.current) return;
      if (zoomRef.current > 0 && el.scrollTop > 0) scrollScaleRef.current = next / zoomRef.current;
      setAutoZoom(next);
    };
    apply();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => { window.removeEventListener('resize', apply); };
    }
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [containerRef, documentId, pageWidth, pageHeight, preference, manual, setAutoZoom]);

  useLayoutEffect(() => {
    const scale = scrollScaleRef.current;
    scrollScaleRef.current = null;
    const el = containerRef.current;
    if (scale === null || !el) return;
    // "instant": the canvas has scroll-behavior: smooth, which would animate this.
    el.scrollTo({ top: el.scrollTop * scale, behavior: 'instant' as ScrollBehavior });
  }, [zoom, containerRef]);

  /** The Fit button: Fit width (or Fit page where that is clearly better), as the reader's choice. */
  const fitNow = useCallback((): void => {
    const el = containerRef.current;
    if (!el || pageWidth <= 0 || pageHeight <= 0) return;
    const fit = autoFit({ width: pageWidth, height: pageHeight }, { width: el.offsetWidth, height: el.offsetHeight });
    if (fit) setZoom(fit.zoom);
  }, [containerRef, pageWidth, pageHeight, setZoom]);

  return { fitNow };
}
