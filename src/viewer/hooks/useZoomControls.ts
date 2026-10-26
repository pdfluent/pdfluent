// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useCallback, useRef } from 'react';
import { MAX_ZOOM, MIN_ZOOM } from '../zoom/fitZoom';

/** The zoom the reader last set by hand ("Last used"), or null when there is none. */
export function readLastUsedZoom(): number | null {
  try {
    const stored = parseFloat(localStorage.getItem('pdfluent.viewer.zoom') ?? '');
    if (!isNaN(stored) && stored >= MIN_ZOOM && stored <= MAX_ZOOM) return stored;
  } catch { /* localStorage unavailable */ }
  return null;
}

/** The reader zoomed `documentId` by hand. A mark on another document says nothing about this one. */
export function isZoomManual(manualFor: string | null, documentId: string | null): boolean {
  return documentId !== null && manualFor === documentId;
}

/**
 * The viewer's zoom, and whether the reader chose it.
 *
 * `setZoom` is the reader's: every call (buttons, keys, commands, a tab
 * restoring its own zoom) marks the document on screen as zoomed by hand, so
 * the fit-to-window logic leaves it alone and a window resize no longer moves
 * it. `setAutoZoom` is the app's: it changes the zoom without that mark. The
 * mark is tied to the document id, so a document that opens next starts
 * un-zoomed without anyone having to reset anything.
 */
export function useZoomControls(documentId: string | null = null) {
  const [zoom, setZoomState] = useState(() => readLastUsedZoom() ?? 1);
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [zoomPresetsOpen, setZoomPresetsOpen] = useState(false);
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  const setZoom = useCallback((next: number | ((prev: number) => number)) => {
    setZoomState(next);
    setManualFor(documentIdRef.current);
  }, []);
  const setAutoZoom = useCallback((next: number) => { setZoomState(next); }, []);

  const zoomManual = isZoomManual(manualFor, documentId);

  // Persist the zoom the reader chose, and only that one: an automatic fit
  // must not become the "Last used" zoom.
  useEffect(() => {
    if (!zoomManual) return;
    try {
      localStorage.setItem('pdfluent.viewer.zoom', String(zoom));
    } catch { /* ignore write errors */ }
  }, [zoom, zoomManual]);

  return { zoom, setZoom, setAutoZoom, zoomManual, zoomPresetsOpen, setZoomPresetsOpen };
}
