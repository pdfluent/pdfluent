// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';

const THUMB_MAX_WIDTH = 120;
const THUMB_MAX_HEIGHT = 170;
const THUMB_BATCH_SIZE = 6;

interface UseThumbnailsResult {
  thumbnails: Map<number, string>;
  loading: boolean;
}

export function useThumbnails(
  engine: PdfEngine | null,
  document: PdfDocument | null,
  /** Override the page count — required after mutations that change the page count
   * without updating the document model (append, insert, delete). When provided,
   * thumbnails are generated for all pages 0 … pageCount-1 rather than stopping
   * at document.pages.length. */
  pageCount?: number,
  /** Bumps when PDF content changed (e.g. page reorder) so thumbnails are regenerated. */
  documentVersion?: number,
  /** Current page — thumbnails fill outward from here so the visible
   * neighbourhood appears first instead of always starting at page 0. */
  currentPage = 0,
): UseThumbnailsResult {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  // Effective page count: prefer the explicit override, fall back to the model length.
  const effectiveCount = pageCount ?? document?.pages.length ?? 0;

  useEffect(() => {
    if (!engine || !document || effectiveCount === 0) {
      setThumbnails(new Map());
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    async function fetchThumbnail(index: number): Promise<{ index: number; bytes: Uint8Array | null }> {
      // Binary IPC path when available (PNG bytes, no base64/JSON envelope).
      if (engine!.render.getThumbnailRaw) {
        const raw = await engine!.render.getThumbnailRaw(document!, index);
        if (raw.success) return { index, bytes: raw.value };
        // fall through to the legacy path on failure
      }
      const result = await engine!.render.getThumbnail(document!, index, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT);
      return { index, bytes: result.success ? result.value : null };
    }

    async function generate(): Promise<void> {
      setLoading(true);
      const map = new Map<number, string>();

      // Generate outward from the current page: current, +1, −1, +2, −2, …
      const anchor = Math.min(Math.max(0, currentPage), effectiveCount - 1);
      const order: number[] = [anchor];
      for (let d = 1; order.length < effectiveCount; d++) {
        if (anchor + d < effectiveCount) order.push(anchor + d);
        if (anchor - d >= 0) order.push(anchor - d);
      }

      for (let batch = 0; batch < order.length; batch += THUMB_BATCH_SIZE) {
        if (cancelled) break;
        const slice = order.slice(batch, batch + THUMB_BATCH_SIZE);
        const results = await Promise.all(slice.map(i => fetchThumbnail(i)));
        if (cancelled) break;

        for (const { index, bytes } of results) {
          if (bytes) {
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            map.set(index, url);
          }
        }
        // Publish once per batch instead of per thumbnail
        setThumbnails(new Map(map));
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    void generate();

    return () => {
      cancelled = true;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
      setThumbnails(new Map());
    };
    // currentPage is deliberately not a dependency: it only seeds the fill
    // order — regenerating all thumbnails on every navigation would defeat
    // the purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, document, effectiveCount, documentVersion]);

  return { thumbnails, loading };
}
