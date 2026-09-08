// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';
import type { DocumentRevision } from '../state/documentRevision';
import { EMPTY_REVISION, changedPages } from '../state/documentRevision';

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
  /** What changed since the last render. A document-wide bump regenerates the
   * strip; a page-scoped bump regenerates those pages and leaves the rest of
   * the map, and their object URLs, exactly as they were. Editing one word
   * used to revoke and re-render all two hundred. */
  revision: DocumentRevision = EMPTY_REVISION,
  /** Current page — thumbnails fill outward from here so the visible
   * neighbourhood appears first instead of always starting at page 0. */
  currentPage = 0,
): UseThumbnailsResult {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  /** Every URL this hook created and has not revoked, so a page-scoped refresh
   *  can revoke exactly the one it replaces and the unmount can revoke the rest. */
  const urlsRef = useRef<Map<number, string>>(new Map());
  const previousRevisionRef = useRef<DocumentRevision>(revision);

  // Effective page count: prefer the explicit override, fall back to the model length.
  const effectiveCount = pageCount ?? document?.pages.length ?? 0;

  // ── Whole strip: a new document, a new page count, or a document-wide change ──
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
            const url = objectUrlFor(bytes);
            createdUrls.push(url);
            map.set(index, url);
          }
        }
        urlsRef.current = new Map(map);
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
      // Both lists: a page-scoped refresh replaces an entry in urlsRef with a
      // URL this pass never created, and revoking only createdUrls would leak
      // exactly the thumbnails that were edited.
      for (const url of new Set([...createdUrls, ...urlsRef.current.values()])) {
        URL.revokeObjectURL(url);
      }
      urlsRef.current = new Map();
      setThumbnails(new Map());
    };
    // currentPage is deliberately not a dependency: it only seeds the fill
    // order — regenerating all thumbnails on every navigation would defeat
    // the purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, document, effectiveCount, revision.all]);

  // ── Single pages: a text commit on one page ────────────────────────────────
  useEffect(() => {
    const previous = previousRevisionRef.current;
    previousRevisionRef.current = revision;
    const changed = changedPages(previous, revision);
    // null = document-wide; the effect above already regenerated everything.
    if (changed === null || changed.size === 0) return;
    if (!engine || !document) return;

    let cancelled = false;
    void (async () => {
      for (const index of changed) {
        if (cancelled || index >= effectiveCount) continue;
        const raw = engine.render.getThumbnailRaw
          ? await engine.render.getThumbnailRaw(document, index)
          : await engine.render.getThumbnail(document, index, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT);
        if (cancelled || !raw.success) continue;
        const url = objectUrlFor(raw.value);
        const stale = urlsRef.current.get(index);
        urlsRef.current.set(index, url);
        setThumbnails(prev => {
          const next = new Map(prev);
          next.set(index, url);
          return next;
        });
        if (stale) URL.revokeObjectURL(stale);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  return { thumbnails, loading };
}

/** A PNG byte range as an object URL. The copy is deliberate: the buffer the
 *  IPC hands over is reused. */
function objectUrlFor(bytes: Uint8Array): string {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'image/png' });
  return URL.createObjectURL(blob);
}
