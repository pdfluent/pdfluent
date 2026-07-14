// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useRef, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';
import { type RenderFallbackHandle, recordFallback } from './useRenderTelemetry';

// ---------------------------------------------------------------------------
// Interactive render-scale cap — the native engine rasterizes PDF vectors into
// the WebView canvas backing store. To keep text crisp at zoom, the backing
// scale follows DPR * zoom and only falls back to CSS scaling above the native
// safety cap.
// ---------------------------------------------------------------------------
const MAX_FAST_RENDER_SCALE = 4.0;
const MAX_QUALITY_RENDER_SCALE = 12.0;
const RENDER_SCALE_STEP = 0.25;
const MIN_RENDER_SCALE = 0.5;
// Renders run off the main thread over binary IPC (~15-25 ms warm), so the
// debounces only need to absorb rapid zoom gestures, not hide render cost.
const ZOOM_RENDER_DEBOUNCE_MS = 120;
const QUALITY_RENDER_DELAY_MS = 180;

function bucketRenderScale(value: number): number {
  return Math.max(
    MIN_RENDER_SCALE,
    Math.round(value / RENDER_SCALE_STEP) * RENDER_SCALE_STEP,
  );
}

function getFastRenderScale(zoom: number): number {
  const rawDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const desired = Math.max(MIN_RENDER_SCALE, zoom * rawDpr);
  return bucketRenderScale(Math.min(desired, MAX_FAST_RENDER_SCALE));
}

function getQualityRenderScale(zoom: number): number {
  const rawDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const desired = Math.max(MIN_RENDER_SCALE, zoom * rawDpr);
  return bucketRenderScale(Math.min(desired, MAX_QUALITY_RENDER_SCALE));
}

class BitmapCache {
  private cache = new Map<string, ImageBitmap>();
  private keys: string[] = [];
  /** Byte budget for decoded RGBA bitmaps (w*h*4). 256 MB ≈ 30+ letter pages
   * at scale 2 — enough to absorb several zoom buckets across visible pages
   * without thrashing, while staying far below typical machine RAM. */
  private maxBytes = 256 * 1024 * 1024;
  private bytes = 0;

  private static cost(bitmap: ImageBitmap): number {
    return bitmap.width * bitmap.height * 4;
  }

  get(key: string): ImageBitmap | undefined {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      this.keys = this.keys.filter(k => k !== key);
      this.keys.push(key);
      return this.cache.get(key);
    }
    return undefined;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  set(key: string, bitmap: ImageBitmap) {
    // If the key is from a different document, clear the cache to release memory.
    // Key format: `${document.id}_${renderRevision}_${pageIndex}_${scale}` where
    // document.id = `doc_${timestamp}_${random}` (always 3 underscore-delimited parts).
    const docId = key.split('_').slice(0, 3).join('_');
    const firstKey = this.keys[0];
    if (firstKey) {
      const existingDocId = firstKey.split('_').slice(0, 3).join('_');
      if (existingDocId !== docId) {
        this.clear();
      }
    }

    if (this.cache.has(key)) {
      const old = this.cache.get(key);
      if (old) {
        this.bytes -= BitmapCache.cost(old);
        old.close();
      }
      this.cache.set(key, bitmap);
      this.bytes += BitmapCache.cost(bitmap);
      this.keys = this.keys.filter(k => k !== key);
      this.keys.push(key);
      return;
    }

    this.cache.set(key, bitmap);
    this.bytes += BitmapCache.cost(bitmap);
    this.keys.push(key);

    // Evict least-recently-used entries until we're back under budget.
    while (this.bytes > this.maxBytes && this.keys.length > 1) {
      const oldestKey = this.keys.shift();
      if (!oldestKey) break;
      const oldest = this.cache.get(oldestKey);
      if (oldest) {
        this.bytes -= BitmapCache.cost(oldest);
        oldest.close();
      }
      this.cache.delete(oldestKey);
    }
  }

  clear() {
    for (const bitmap of this.cache.values()) {
      bitmap.close();
    }
    this.cache.clear();
    this.keys = [];
    this.bytes = 0;
  }
}

const RENDER_BITMAP_CACHE = new BitmapCache();

/** In-flight render dedup: concurrent requests for the same cache key share one
 * backend render. Resolved bitmaps are owned by RENDER_BITMAP_CACHE — callers
 * must never close() them. */
const INFLIGHT_RENDERS = new Map<string, Promise<ImageBitmap | null>>();

/** Render a page via the binary raw path into the bitmap cache, deduplicating
 * concurrent requests. Returns the cached bitmap, or null on failure. */
function getOrRenderRawBitmap(
  eng: PdfEngine,
  doc: PdfDocument,
  pageIndex: number,
  scale: number,
  cacheKey: string,
): Promise<ImageBitmap | null> {
  const cached = RENDER_BITMAP_CACHE.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const inflight = INFLIGHT_RENDERS.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const result = await eng.render.renderPageRaw!(doc, pageIndex, scale);
      if (!result.success) return null;
      const { width, height, pixels } = result.value;
      const bitmap = await createImageBitmap(new ImageData(pixels, width, height));
      RENDER_BITMAP_CACHE.set(cacheKey, bitmap);
      return bitmap;
    } catch {
      return null;
    } finally {
      INFLIGHT_RENDERS.delete(cacheKey);
    }
  })();

  INFLIGHT_RENDERS.set(cacheKey, promise);
  return promise;
}

interface UseRenderedCanvasResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  loading: boolean;
  error: string | null;
  hasRendered: boolean;
}

export function useRenderedCanvas(
  engine: PdfEngine | null,
  document: PdfDocument | null,
  pageIndex: number,
  zoom: number,
  pageWidthPt: number,
  pageHeightPt: number,
  fallbackHandle?: RenderFallbackHandle | null,
  renderRevision = 0,
): UseRenderedCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const hasRenderedRef = useRef(false);
  const renderedScaleRef = useRef<number | null>(null);
  const renderedKeyRef = useRef<string | null>(null);

  // Generation counter — bumped on every effect invocation.
  // Async paths check genRef.current === myGen before writing to the canvas;
  // if they differ, the result is stale and is silently discarded.
  const genRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Observe canvas visibility so we only trigger expensive rendering
  // when the page is in or close to the viewport.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(Boolean(entry?.isIntersecting));
      },
      {
        rootMargin: '600px 0px', // Pre-render when within 600px of viewport
      }
    );

    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, []);

  const [renderScale, setRenderScale] = useState(() => getFastRenderScale(zoom));

  useEffect(() => {
    const fastScale = getFastRenderScale(zoom);
    const qualityScale = getQualityRenderScale(zoom);

    if (!hasRenderedRef.current) {
      setRenderScale(fastScale);
      return;
    }

    const currentScale = renderedScaleRef.current;
    // Fast pass: during an active zoom gesture, only re-rasterize past a
    // hysteresis band so rapid steps don't thrash. The bitmap is allowed to be
    // briefly off-scale here — the quality pass below makes it exact.
    if (currentScale !== null && (fastScale > currentScale * 1.35 || fastScale < currentScale * 0.5)) {
      const t = setTimeout(() => {
        setRenderScale(fastScale);
      }, ZOOM_RENDER_DEBOUNCE_MS);
      return () => {
        clearTimeout(t);
      };
    }

    // Quality pass: once the view settles, ALWAYS converge to the exact
    // bucketed scale (zoom × DPR, capped at the quality cap). The old guard
    // (`> 1.35× || < 0.5×`) left a dead band: any settled scale within
    // [0.5×, 1.35×] of the target was never corrected, so identical zoom
    // levels rendered sharp or soft depending on the path taken to reach them
    // (measured: up to 33% upscaling at 200–250% on a DPR-2 display). Re-render
    // whenever we are not already at the exact target.
    const t = setTimeout(() => {
      const latestScale = renderedScaleRef.current;
      if (latestScale === null || Math.abs(qualityScale - latestScale) > 0.001) {
        setRenderScale(qualityScale);
      }
    }, QUALITY_RENDER_DELAY_MS);

    return () => {
      clearTimeout(t);
    };
  }, [zoom, hasRendered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!engine || !document || !canvas) {
      setLoading(false);
      setError(null);
      hasRenderedRef.current = false;
      renderedScaleRef.current = null;
      renderedKeyRef.current = null;
      setHasRendered(false);
      return;
    }

    if (!isVisible) {
      setLoading(false);
      setError(null);
      return;
    }

    // Bump generation so in-flight async operations from the previous render
    // can detect they are stale and must not draw.
    const gen = ++genRef.current;

    const scale = renderScale;
    const cacheKey = `${document.id}_${renderRevision}_${pageIndex}_${scale}`;

    if (hasRenderedRef.current && renderedKeyRef.current === cacheKey) {
      setLoading(false);
      setError(null);
      return;
    }

    // Check cache first for instant render
    const cachedBitmap = RENDER_BITMAP_CACHE.get(cacheKey);

    if (cachedBitmap) {
      // Set canvas physical dimensions immediately.
      const physW = Math.max(1, Math.round(pageWidthPt  * scale));
      const physH = Math.max(1, Math.round(pageHeightPt * scale));
      canvas.width  = physW;
      canvas.height = physH;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cachedBitmap, 0, 0);
      }
      setLoading(false);
      setError(null);
      hasRenderedRef.current = true;
      renderedScaleRef.current = scale;
      renderedKeyRef.current = cacheKey;
      setHasRendered(true);
      return;
    }

    setLoading(true);
    setError(null);

    const physW = Math.max(1, Math.round(pageWidthPt  * scale));
    const physH = Math.max(1, Math.round(pageHeightPt * scale));

    if (!hasRenderedRef.current) {
      canvas.width  = physW;
      canvas.height = physH;
    }

    // Try optional browser-test fallback render handle first.
    if (fallbackHandle && document) {
      fallbackHandle.renderPage(document, pageIndex, scale)
        .then(bitmap => {
          if (gen !== genRef.current) { bitmap.close(); return; } // stale — discard
          
          RENDER_BITMAP_CACHE.set(cacheKey, bitmap);

          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0);
          }
          setLoading(false);
          hasRenderedRef.current = true;
          renderedScaleRef.current = scale;
          renderedKeyRef.current = cacheKey;
          setHasRendered(true);
        })
        .catch((err: unknown) => {
          if (gen !== genRef.current) return; // stale — fallback not needed
          // Explicit fallback: log reason and record telemetry so it is never silent.
          const reason = err instanceof Error ? err.message : String(err);
          console.warn('[PDFluent] Render fallback failed, using direct render. Reason:', reason);
          recordFallback(reason);
          renderMainThread(engine, document, pageIndex, canvas, scale, gen);
        });
      return;
    }

    renderMainThread(engine, document, pageIndex, canvas, scale, gen);

    function renderMainThread(
      eng: PdfEngine,
      doc: PdfDocument,
      idx: number,
      cvs: HTMLCanvasElement,
      sc: number,
      genId: number,
    ) {
      const targetCanvas = hasRenderedRef.current ? globalThis.document.createElement('canvas') : cvs;
      targetCanvas.width = Math.max(1, Math.round(pageWidthPt * sc));
      targetCanvas.height = Math.max(1, Math.round(pageHeightPt * sc));

      // Fast path: renderPageToCanvas (no PNG round-trip, zero JS copies)
      if (eng.render.renderPageToCanvas) {
        const result = eng.render.renderPageToCanvas(doc, idx, targetCanvas, sc);
        if (genId !== genRef.current) return; // stale — discard (synchronous, so rare but possible on fast loops)
        if (result.success) {
          if (targetCanvas !== cvs) {
            cvs.width = targetCanvas.width;
            cvs.height = targetCanvas.height;
            const ctx = cvs.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.clearRect(0, 0, cvs.width, cvs.height);
              ctx.drawImage(targetCanvas, 0, 0);
            }
          }
          setLoading(false);
          setError(null);
          hasRenderedRef.current = true;
          renderedScaleRef.current = sc;
          renderedKeyRef.current = cacheKey;
          setHasRendered(true);
        } else {
          // Any failure falls through to slow path
          void renderSlow(eng, doc, idx, cvs, sc, genId);
        }
        return;
      }

      // Binary fast path: raw RGBA over IPC → ImageData → ImageBitmap.
      // No PNG encode (backend), no base64/atob/PNG-decode (frontend).
      if (eng.render.renderPageRaw) {
        void renderRaw(eng, doc, idx, cvs, sc, genId);
        return;
      }

      // Slow path: renderPage → ImageBitmap → drawImage
      void renderSlow(eng, doc, idx, cvs, sc, genId);
    }

    async function renderRaw(
      eng: PdfEngine,
      doc: PdfDocument,
      idx: number,
      cvs: HTMLCanvasElement,
      sc: number,
      genId: number,
    ) {
      // Deduplicated render into the shared cache; the cache owns the bitmap.
      const bitmap = await getOrRenderRawBitmap(eng, doc, idx, sc, cacheKey);

      if (genId !== genRef.current) return; // stale — newer render owns the canvas

      if (!bitmap) {
        // Fall back to the PNG path (e.g. older backend without the raw command).
        void renderSlow(eng, doc, idx, cvs, sc, genId);
        return;
      }

      const ctx = cvs.getContext('2d');
      if (ctx) {
        cvs.width = bitmap.width;
        cvs.height = bitmap.height;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        ctx.drawImage(bitmap, 0, 0);
      }
      setLoading(false);
      hasRenderedRef.current = true;
      renderedScaleRef.current = sc;
      renderedKeyRef.current = cacheKey;
      setHasRendered(true);

      // Prefetch neighbouring pages in priority order: ±1 first, then ±2…±5.
      // All scheduled as idle callbacks; registration order determines priority.
      const pageTotal = doc.pages.length;
      const neighbours = [
        idx + 1, idx - 1,
        idx + 2, idx - 2,
        idx + 3, idx - 3,
        idx + 4, idx - 4,
        idx + 5, idx - 5,
      ].filter(n => n >= 0 && n < pageTotal);
      const idle: (cb: () => void) => void =
        typeof requestIdleCallback === 'function'
          ? (cb) => { requestIdleCallback(() => { cb(); }, { timeout: 1000 }); }
          : (cb) => { setTimeout(cb, 150); };
      for (const n of neighbours) {
        const nKey = `${doc.id}_${renderRevision}_${n}_${sc}`;
        if (RENDER_BITMAP_CACHE.has(nKey) || INFLIGHT_RENDERS.has(nKey)) continue;
        idle(() => {
          // Re-check staleness at idle time; skip if the view moved on.
          if (genId !== genRef.current) return;
          void getOrRenderRawBitmap(eng, doc, n, sc, nKey);
        });
      }
    }

    async function renderSlow(
      eng: PdfEngine,
      doc: PdfDocument,
      idx: number,
      cvs: HTMLCanvasElement,
      sc: number,
      genId: number,
    ) {
      const w = Math.max(1, Math.round(pageWidthPt * sc));
      const h = Math.max(1, Math.round(pageHeightPt * sc));
      const result = await eng.render.renderPage(doc, idx, w, h);

      if (genId !== genRef.current) return; // stale — result arrived for an outdated render

      if (!result.success) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      // Copy to a plain ArrayBuffer so Blob constructor accepts it regardless of
      // whether result.value is backed by a SharedArrayBuffer or another view.
      const pngBytes = new Uint8Array(result.value.byteLength);
      pngBytes.set(new Uint8Array(result.value.buffer, result.value.byteOffset, result.value.byteLength));
      const blob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);

      if (genId !== genRef.current) { bitmap.close(); return; } // stale — discard

      RENDER_BITMAP_CACHE.set(cacheKey, bitmap);

      const ctx = cvs.getContext('2d');
      if (ctx) {
        cvs.width = bitmap.width;
        cvs.height = bitmap.height;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        ctx.drawImage(bitmap, 0, 0);
      }
      setLoading(false);
      hasRenderedRef.current = true;
      renderedScaleRef.current = scale;
      renderedKeyRef.current = cacheKey;
      setHasRendered(true);
    }

  }, [engine, document, pageIndex, renderScale, pageWidthPt, pageHeightPt, fallbackHandle, isVisible, renderRevision]);

  return { canvasRef, loading, error, hasRendered };
}
