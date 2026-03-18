// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';

const THUMB_MAX_WIDTH = 120;
const THUMB_MAX_HEIGHT = 170;

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
  pageCount?: number
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

    async function generate(): Promise<void> {
      setLoading(true);
      const map = new Map<number, string>();

      for (let i = 0; i < effectiveCount; i++) {
        if (cancelled) break;

        const result = await engine!.render.getThumbnail(
          document!,
          i,
          THUMB_MAX_WIDTH,
          THUMB_MAX_HEIGHT
        );

        if (cancelled) break;

        if (result.success) {
          const blob = new Blob([result.value.buffer as ArrayBuffer], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          map.set(i, url);
          // Publish incrementally so thumbnails appear as they load
          setThumbnails(new Map(map));
        }
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
  }, [engine, document, effectiveCount]);

  return { thumbnails, loading };
}
