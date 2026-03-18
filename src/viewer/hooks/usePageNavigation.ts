// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';

export function usePageNavigation(pageCount: number, currentFilePath: string | null) {
  const [pageIndex, setPageIndex] = useState(0);

  // Stability: clamp pageIndex whenever pageCount changes so it never exceeds the last valid page.
  // handlePageMutation already clamps after mutations; this covers all other cases.
  useEffect(() => {
    if (pageCount <= 0) return;
    setPageIndex(prev => Math.min(prev, pageCount - 1));
  }, [pageCount]);

  // Persist current page position per file path — written on every page change
  // ArrayBuffer / anonymous sources have no currentFilePath and are skipped
  useEffect(() => {
    if (!currentFilePath) return;
    try {
      const raw = localStorage.getItem('pdfluent.viewer.pages');
      const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      map[currentFilePath] = pageIndex;
      // Cap the map at 50 entries (FIFO) to bound localStorage size
      const keys = Object.keys(map);
      if (keys.length > 50) { const oldest = keys[0]; if (oldest) delete map[oldest]; }
      localStorage.setItem('pdfluent.viewer.pages', JSON.stringify(map));
    } catch { /* ignore write errors */ }
  }, [pageIndex, currentFilePath]);

  return { pageIndex, setPageIndex };
}
