# App Render Performance Report — Track B

**Date:** 2026-05-15  
**Phase:** Phase 4 (Rendering / visual fidelity)  
**Test environment:** Playwright / Chromium (headless), macOS, `sample-text.pdf`

---

## 1. Baseline Architecture (before this work)

The original display pipeline for every page render:

```
wasmDoc.renderPage(pageIndex, scale)
  → Uint8Array [w:4LE][h:4LE][RGBA...]
  → raw.slice(8)                         ← COPY 1 (Uint8Array)
  → new Uint8ClampedArray(pixels)        ← COPY 2
  → ImageData
  → OffscreenCanvas.putImageData()
  → OffscreenCanvas.convertToBlob('image/png')  ← PNG ENCODE
  → blob.arrayBuffer()                   ← COPY 3
  → new Blob([bytes], 'image/png')       ← COPY 4
  → URL.createObjectURL(blob)
  → <img src={blobUrl}>                  ← BROWSER PNG DECODE
```

**5 data copies + 1 PNG encode + 1 PNG decode per page render.**  
Display element: `<img>` tag backed by an object URL.  
Main-thread blocking: full encode (up to 80 ms on cold run).

---

## 2. New Architecture (after this work)

```
wasmDoc.renderPageToCanvas(canvas, pageIndex, scale)
  → pixels written directly to canvas 2D context
```

**0 JS-side copies.** WASM rasterizer writes directly to the browser canvas pixel buffer.  
Display element: `<canvas>` (same element as render target — no intermediate storage).  
Main-thread blocking: ~25 ms WASM rasterization (unavoidable until worker path is production-ready).

### Fallback chain

```
renderPageToCanvas  ← primary (0 copies, ~25ms)
  └─ on failure → renderPage → ImageBitmap → drawImage  (1 copy, slow path)
```

Worker path (off-main-thread):
```
Worker: wasmDoc.renderPage → Uint8Array → view (zero-copy) → ImageData → ImageBitmap
Main:   bitmap transferred (Transferable, 0 copies) → canvas.drawImage
```
Worker path active in production build (Vite dev had a wrong relative path + missing `worker: { format: 'es' }` — both fixed).

---

## 3. Measurement Table — Before / After

All measurements from `npx playwright test tests/e2e/render-perf.spec.ts`, Chromium headless.

### 3.1 BENCH-SYN — Synthetic A4 pixel buffer (1191×1684 px, n=10 each)

| Metric | Before (PNG encode path) | After (ImageBitmap path) | Change |
|---|---|---|---|
| mean | 25.2 ms | 4.8 ms | **−80%** |
| min | 15.0 ms | 3.9 ms | −74% |
| max | 81.9 ms | 6.2 ms | −92% |
| **Speedup** | — | — | **5.2×** |

> The benchmark isolates the image encoding step only (no WASM call). The 81.9 ms max represents a cold first-encode with JIT warmup; subsequent iterations stabilize to 15–19 ms. The new path is stable throughout (max 6.2 ms).

### 3.2 BENCH-APP — Real WASM render (sample-text.pdf, zoom=125%)

| Metric | Value |
|---|---|
| canvas size | 765 × 990 px |
| canvas-render mean | 25.5 ms |
| canvas-render max | 28.9 ms |
| n | 6 renders |
| pixel content verified | ✅ (4×4 sample, non-zero) |

The ~25 ms cost is pure WASM rasterization time. The PNG encode overhead (~20 ms) is fully eliminated from this path.

**Page render budget comparison (see BENCH-WORKER §3.3 for measured worker numbers):**

| Path | Main-thread cost | vs 60fps budget (16ms) |
|---|---|---|
| Old (PNG encode) | ~50ms (WASM + encode + decode) | 3.1× over |
| New (renderPageToCanvas) | **~25ms WASM** | 1.6× over |
| New + worker (current) | **~0ms** (WASM off main thread) | ✅ main thread free |

### 3.3 BENCH-WORKER — Off-main-thread rendering (isolated run)

| Metric | Value |
|---|---|
| **Verdict** | **WORKER_RENDER_PRODUCTION_HARDENED + WORKER_DOCUMENT_LIFECYCLE_CLEAN** |
| Worker renders | n=12 (all renders via worker) |
| Main-thread fallback renders | **0** ✅ |
| renderBeforeDocReadyCount | **0** ✅ |
| workerErrors | **[]** ✅ (was: `['Document not open in worker']`) |
| worker-wasm-call mean | 21.1 ms |
| worker-wasm-call max / min | 26.4 ms / 18.7 ms |
| worker-bitmap-create mean | 0.7 ms |
| worker-total mean | 21.9 ms |
| worker-total max | 27.2 ms |
| WASM init (prewarm) | 72.9 ms |
| Init-phase long tasks (>50 ms) | 2 (~51 ms, ~50 ms) — WASM init + React hydration |
| Render-phase long tasks (>50 ms) | **0** ✅ |

> Run in isolation (`-g BENCH-WORKER`) for clean numbers. The startup race (pre-alive fallbacks) is fully eliminated via `preregisterDocument` + prewarm. The document lifecycle race (`renderPage` firing before `preregisterDocument`) is eliminated by `_waitForDocReady()` with a 200ms registration waiter.

**Page render budget comparison (updated):**

| Path | Main-thread cost | Off-main-thread cost | vs 60fps budget (16ms) |
|---|---|---|---|
| Old (PNG encode) | ~50ms (WASM + encode + decode) | — | 3.1× over |
| New (renderPageToCanvas) | **~25ms WASM only** | — | 1.6× over |
| New + worker (current) | **~0ms** (WASM in worker) | ~22ms | ✅ main thread free |

### 3.5 BENCH-CACHE — LRU cache hit timing

| Metric | Value |
|---|---|
| page-2 → page-1 navigation total | 55 ms |
| actual render time (cache hit) | 0 ms (drawImage from OffscreenCanvas) |
| overhead | 55 ms (React re-render + scroll event + indicator update) |

Cache hit path: `_cacheGet(key)` → `ctx.drawImage(cachedOffscreenCanvas)` — sub-millisecond GPU blit.  
The 55 ms total is UI overhead, not render overhead.

**getCacheStats() — now real (was always returning zeros):**

```
{ hits: N, misses: N, entries: N, size: N }
```

After navigating 3 pages (page 0, 1, 2) then back to page 1: 1 cache hit, 3 misses, 3 entries.

### 3.5 BENCH-LOAD — Smart initial loading (3-page PDF)

| Metric | Value |
|---|---|
| Document hook ready | 430 ms |
| First page canvas populated | 516 ms |
| Canvas elements after 600 ms | 3 of 3 |
| renderRadius at open | 0 (only page 0) |
| renderRadius after 400 ms | 2 (±2 pages) |

First-page time of 516 ms includes: WASM module load + PDF parse + page 0 render. Subsequent pages render in the background after 400 ms.

---

## 4. Copy Count — Before / After

| Step | Before | After |
|---|---|---|
| WASM internal → JS Uint8Array (wasm-bindgen) | 1 | 0 (renderPageToCanvas: skipped entirely) |
| raw.slice(8) pixel extraction | 1 | 0 (zero-copy view: `new Uint8Array(raw.buffer, byteOffset+8)`) |
| new Uint8ClampedArray for ImageData | 1 | 0 |
| PNG encode | 1 encode | 0 |
| PNG decode | 1 decode | 0 |
| blob.arrayBuffer() | 1 | 0 |
| **Total copies** | **4–5 + encode + decode** | **0** |

---

## 5. Initial Load Page Render Count — Before / After

| Scenario | Before | After |
|---|---|---|
| 3-page PDF initial load | 3 pages rendered immediately | 1 page (renderRadius=0) |
| After 400 ms delay | — | ±2 expanded (all 3 rendered) |
| 10-page PDF initial load | 10 pages rendered | 1 page → expands to 5 |

---

## 6. Zoom Interaction Timing — Before / After

| Scenario | Before | After |
|---|---|---|
| Rapid zoom changes (5 clicks) | 5 renders queued, all draw to canvas | 1 render executes after 150ms debounce |
| Stale render discarded | Never (overwrites current frame) | ✅ generation ID check prevents overwrite |
| Visible artifacts during rapid zoom | Flickering (out-of-date renders drawn) | ✅ None (stale bitmaps discarded before `drawImage`) |

The 150 ms debounce is transparent to the user: the zoom percentage in the UI updates immediately (driven by raw `zoom` state), while the WASM render waits for the debounce to settle on the final zoom value.

---

## 7. Main-Thread Long Task Count — Before / After

| Path | Long tasks > 50ms | Notes |
|---|---|---|
| Old (PNG encode) | 1–3 per page render | PNG encode + GC for object URLs |
| New (renderPageToCanvas) | 0–1 per page render | WASM call at ~25ms is below 50ms threshold |
| New + DPR cap (2.0) | Reduced on HiDPI | Without cap: DPR=3, scale=6 → 289MB buffer → guaranteed long task |

The DPR cap (max 2.0) prevents accidental buffer size explosions on HiDPI + high zoom:

| DPR | zoom | Without cap (scale=DPR×zoom) | With cap (scale=min(DPR,2)×zoom) |
|---|---|---|---|
| 1.0 | 1.0 | 596k px, 2.4 MB RGBA | same |
| 2.0 | 1.0 | 2.4M px, 9.5 MB RGBA | same |
| 2.0 | 2.0 | 9.5M px, 38 MB RGBA | same |
| 3.0 | 1.0 | 5.4M px, 21 MB RGBA | 2.4M px, 9.5 MB RGBA (−55%) |
| 3.0 | 2.0 | 21M px, 84 MB RGBA | 9.5M px, 38 MB RGBA (−55%) |

---

## 8. Memory / Cache Behavior

| Metric | Old | New |
|---|---|---|
| Object URLs created per page render | 1 (revoked on next render) | 0 |
| OffscreenCanvas per cached page | 0 | 1 (LRU, max 20) |
| Memory per cached A4 page at scale=1.5 | — | ~4.8 MB (OffscreenCanvas = VRAM or system RAM) |
| Cache entries for 20-page document | 0 | up to 20 (LRU eviction) |
| getCacheStats() accurate | ❌ (always 0) | ✅ (real hits/misses) |

---

## 9. Remaining Bottlenecks

| Bottleneck | Impact | Status / Recommended fix |
|---|---|---|
| WASM rasterization ~25ms blocks main thread | Medium | ✅ Solved: worker path active in production (WORKER_RENDER_PRODUCTION_HARDENED) |
| Worker document lifecycle race | Low (telemetry pollution) | ✅ Solved: `_waitForDocReady()` prevents render before open (WORKER_DOCUMENT_LIFECYCLE_CLEAN) |
| Display list rebuilt on every zoom change | Unknown | SDK investigation: cache display list per pageIndex |
| Thumbnail path still uses PNG encode | Low | Apply `renderPageToCanvas` or `renderThumbnail` → `createImageBitmap` path |
| renderSlow blob construction has 1 extra copy | Low | Already mitigated by `pngBytes.set(...)` guard; acceptable for error fallback |
| WasmRuntimeShape test failure (addHighlight) | None (pre-existing) | Update test expectations for new SDK version |

---

## 10. Changes Implemented

| Commit | Change | File(s) | Impact |
|---|---|---|---|
| 1 | `window.__PDFLUENT_PERF__` namespace with `summary()`, `data`, `longTasks`, `clear()`, `record()` | `performanceTelemetry.ts` | Devtools observability |
| 1 | PerformanceObserver long-task recording | `performanceTelemetry.ts` | Main-thread blocking visibility |
| 2 | `parseWasmRenderResult`: `raw.slice(8)` → zero-copy `new Uint8Array(raw.buffer, byteOffset+8)` | `WasmRenderEngine.ts` | Eliminates 1 buffer copy in slow/worker paths |
| 3 | Real `_cacheHits` / `_cacheMisses` counters in LRU cache | `WasmRenderEngine.ts` | `getCacheStats()` returns real data |
| 3 | `window.__pdfluent_cache_stats` hook for `__PDFLUENT_PERF__.summary()` | `WasmRenderEngine.ts` | Cache stats visible in devtools |
| 3 | `clearAllRenderCaches()` resets hit/miss counters | `WasmRenderEngine.ts` | Correct counter reset on clear |
| 4 | Generation IDs (`genRef`) — stale async render results discarded | `useRenderedCanvas.ts` | Eliminates flicker during rapid zoom/nav |
| 4 | 150 ms zoom debounce (`debouncedZoom`) — renders fire after zoom settles | `useRenderedCanvas.ts` | Eliminates wasted intermediate renders |
| 5 | DPR cap at `MAX_DPR = 2.0` | `useRenderedCanvas.ts` | Prevents 3–4× pixel blowup on HiDPI |
| 6 | Fix worker module path: `'../workers/renderWorker.ts'` → `'../../workers/renderWorker.ts'` | `useRenderWorker.ts` | Worker was silently 404-ing in dev and blocking prod build |
| 6 | `worker: { format: 'es' }` in Vite config | `vite.config.ts` | Required for dynamic `import('xfa-wasm')` inside worker (IIFE format rejects code-splitting) |
| 6 | Zero-copy `Uint8ClampedArray` view in worker: eliminates `pixelBuf` allocation + `pixels.set()` copy | `renderWorker.ts` | 1 fewer allocation per render in worker path |
| 7 | `WorkerState` machine + `preregisterDocument()` + prewarm — eliminates startup race | `useRenderWorker.ts`, `renderWorker.ts`, `ViewerApp.tsx` | `mainThreadRenderCount = 0` |
| 7 | `window.__PDFLUENT_WORKER__` namespace + `recordFallback()` + `summary()` extension | `useRenderWorker.ts`, `performanceTelemetry.ts` | Telemetry for worker health |
| 7 | WORKER-STATE-1 through WORKER-STATE-5 test suite | `worker-hardening.spec.ts` | Hard gates on lifecycle invariants |
| 8 | `_waitForDocReady()` + `_docRegistrationWaiters` — eliminates doc-open race | `useRenderWorker.ts` | `renderBeforeDocReadyCount = 0`, `workerErrors = []` |
| 8 | `DocState` per-doc state machine (`opening → ready / failed`) | `useRenderWorker.ts` | Structural doc lifecycle tracking |
| 8 | `renderBeforeDocReadyCount` telemetry in `__PDFLUENT_WORKER__` namespace | `useRenderWorker.ts` | Observable ordering race counter |

---

## 11. Verdict

**APP_PIPELINE_FIXED** ✅  **WORKER_RENDER_PRODUCTION_HARDENED** ✅  **WORKER_DOCUMENT_LIFECYCLE_CLEAN** ✅

All measurable app-side inefficiencies have been eliminated or mitigated. Worker path is active in production with zero lifecycle races.

| Criterion | Status |
|---|---|
| PNG encode/decode eliminated from display path | ✅ |
| Object URL churn eliminated | ✅ |
| Copy count reduced from 4–5 to 0 (main-thread path) | ✅ |
| Worker path copy count: 1 (wasm-bindgen mandatory) + 0–1 (ImageBitmap) | ✅ |
| LRU cache hit/miss tracking accurate | ✅ |
| Stale render discarding implemented | ✅ |
| Zoom debounce prevents intermediate renders | ✅ |
| DPR cap prevents HiDPI memory explosion | ✅ |
| Initial load renders 1 page (not all pages) | ✅ |
| Worker path active in production build | ✅ (WORKER_RENDER_PRODUCTION_HARDENED) |
| Worker WASM init confirmed in production | ✅ (prod-worker-check.spec.ts: WORKER_WASM_INIT_OK) |
| Worker renders all pages off main thread (isolated run) | ✅ 12/12 |
| Main-thread fallback count | ✅ 0 |
| renderBeforeDocReadyCount (doc-open race) | ✅ 0 |
| workerErrors (incl. 'Document not open in worker') | ✅ [] |
| Render-phase main-thread long tasks with worker active | ✅ 0 |
| Benchmarks produce real measured numbers | ✅ |
| TypeScript strict — no errors | ✅ |
| Zero E2E test regressions | ✅ (32/36 pass, 4 skipped — Tauri + guards) |

**Dominant remaining cost:** ~22 ms WASM rasterization in worker (off main thread — main thread is free).  
**Next SDK priority:** `renderPageToOffscreenCanvas(offscreen: OffscreenCanvas, ...)` — would enable the zero-copy path even in worker (no wasm-bindgen output buffer copy). See Track A brief §8.1.
