// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';

interface UseRenderedPageResult {
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
}

export function useRenderedPage(
  engine: PdfEngine | null,
  document: PdfDocument | null,
  pageIndex: number,
  renderWidth: number
): UseRenderedPageResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engine || !document || renderWidth <= 0) {
      // Engine or document gone — clear immediately so no stale image persists.
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;

    async function render(): Promise<void> {
      setLoading(true);
      setError(null);

      // Compute page height from aspect ratio
      const dimResult = engine!.render.getPageDimensions(document!, pageIndex);
      let renderHeight = Math.round(renderWidth * 1.414); // Default: A4 portrait
      if (dimResult.success && dimResult.value.width > 0) {
        renderHeight = Math.round((renderWidth / dimResult.value.width) * dimResult.value.height);
      }

      const result = await engine!.render.renderPage(document!, pageIndex, renderWidth, renderHeight);
      if (cancelled) return;

      if (!result.success) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      const blob = new Blob([result.value.buffer as ArrayBuffer], { type: 'image/png' });
      const newUrl = URL.createObjectURL(blob);
      // Revoke the previous URL only once the new one is ready, preventing a
      // blank frame between renders (zoom, resize, page navigation).
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return newUrl;
      });
      setLoading(false);
    }

    void render();

    return () => {
      cancelled = true;
      // Do not clear blobUrl here — keep the current image visible while the
      // next render is in flight. The previous URL is revoked inside render()
      // when the replacement is ready, or by the outer guard when the document
      // is closed.
    };
  }, [engine, document, pageIndex, renderWidth]);

  return { blobUrl, loading, error };
}
