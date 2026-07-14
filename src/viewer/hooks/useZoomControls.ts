// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';

export function useZoomControls() {
  const [zoom, setZoom] = useState(() => {
    try {
      const stored = parseFloat(localStorage.getItem('pdfluent.viewer.zoom') ?? '');
      if (!isNaN(stored) && stored >= 0.25 && stored <= 4) return stored;
    } catch { /* localStorage unavailable */ }
    return 1.5;
  });
  const [zoomPresetsOpen, setZoomPresetsOpen] = useState(false);

  // Persist zoom to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.zoom', String(zoom));
    } catch { /* ignore write errors */ }
  }, [zoom]);

  return { zoom, setZoom, zoomPresetsOpen, setZoomPresetsOpen };
}
