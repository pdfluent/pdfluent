# Editor Render Path v2 — Implementation Report

**Date:** 2026-06-10
**Branch:** `feat/editor-ui-redesign-v3`
**Input:** `XFA/docs/research/pdfluent-ecosystem-assessment-2026-06.md` (assessed the v2 repo; every finding re-verified against this v3 codebase before changing anything)
**Bench harness:** `src-tauri/src/pdf_engine.rs` → `perf_render_baseline` (`#[ignore]`d test), release build, median of 5, Apple Silicon.
Run: `PDFLUENT_BENCH_PDF=/path/to.pdf cargo test --release perf_render_baseline -- --ignored --nocapture`

---

## 1. Verification of the assessment against v3

| Assessment finding | Status in v3 | Evidence |
|---|---|---|
| C1: PNG→base64→JSON render transport | Confirmed | `pdf_engine.rs encode_rendered_page` (PNG + base64 + `pixels.clone()`), `TauriRenderEngine.ts` byte-by-byte `atob` loop → copy → Blob → PNG decode |
| C1: global mutex held through render | Confirmed | `lib.rs` `Mutex<Option<OpenDocument>>`; `with_document` runs render closures under the lock |
| (new, worse than assessed) sync commands | Confirmed | All `#[tauri::command]` were sync `fn` → Tauri 2 executes them on the **main thread**; every render blocked the UI event loop |
| C2: WASM detour on desktop | Already fixed in v3 | No WASM engine in `src/` |
| H2: 350/450 ms debounces | Already partially retuned (250/220) | `useRenderedCanvas.ts` |
| H2: 15-item bitmap cache, no dedup, no prefetch | Confirmed | `useRenderedCanvas.ts` |
| H1: double disk read + eager scans at open | Confirmed (but scans measured cheap: 0.5–1.7 ms) | `OpenDocument::open`, `document_info` |
| H1: eager all-pages thumbnails from page 0 | Confirmed | `useThumbnails.ts` |

**New root cause found during measurement (not in the assessment):** the SDK's
`pdf_engine::PdfDocument::render_page` calls `open_flattened_xfa_for_render()`
on **every render of an XFA document** — full XFA flatten + re-open + discard,
per render call, per thumbnail, per zoom bucket. The editor kept the raw XFA
doc, so it paid this on every render. The assessment's render numbers (57 ms)
came through the `pdfluent` facade, which avoids the repeated cost; the editor's
real per-render cost on XFA forms was ~190–290 ms.

## 2. Changes

### Backend (`src-tauri`)
- **XFA flatten-once render doc** — `OpenDocument` now keeps a `render_doc:
  Arc<PdfDocument>`: XFA documents are flattened a single time at open (and
  after each mutation/sign reload); non-XFA documents share the same Arc as
  `pdf_doc`. Renders and thumbnails use `render_doc`, so the SDK's per-render
  flatten path is never taken. Flatten failure falls back to the raw doc.
- **Binary render IPC** — new commands `render_page_raw` (8-byte width/height
  LE header + raw RGBA, via `tauri::ipc::Response`) and `render_thumbnail_raw`
  (PNG bytes, no base64/JSON). No PNG encode on the page-render path, no
  base64, no JSON envelope, no `atob`, no browser PNG decode.
- **Renders off the main thread, off the lock** — the raw commands are `async`,
  clone the `Arc` snapshot under a brief lock, then render inside
  `tauri::async_runtime::spawn_blocking`. A compile-time `Send + Sync` assert
  guards the snapshot. Page renders and thumbnails no longer queue behind each
  other or block the UI thread. `open_pdf` also moved to `spawn_blocking`;
  legacy `render_page`/`render_thumbnail` got `#[tauri::command(async)]`.
- **Open path** — `OpenDocument::open` now does a single `fs::read` +
  `lopdf::load_mem` (was: read + parse + second disk read via `load(path)`).
- **Build profile** — `[profile.release] lto = "thin", codegen-units = 4`
  (was: unset → no LTO). No measurable delta in the single-page bench (within
  ±20% run noise); kept for shipped builds where cross-crate inlining helps.

### Frontend (`src/`)
- `RenderEngine` gains optional `renderPageRaw` / `getThumbnailRaw`;
  `TauriRenderEngine` implements both over `invoke<ArrayBuffer>`.
- `useRenderedCanvas`:
  - raw path preferred: RGBA → `ImageData` → `createImageBitmap` (no Blob, no
    PNG decode);
  - bitmap cache is now **byte-budgeted (256 MB decoded RGBA)** instead of 15
    items, LRU eviction by cost;
  - **in-flight request dedup** keyed by cache key (concurrent requests for the
    same page/scale share one backend render; cache owns all bitmaps);
  - **±1 page prefetch** at the current scale via `requestIdleCallback` after
    each successful visible render;
  - zoom debounce 250 → 120 ms, quality-pass delay 220 → 180 ms (renders are
    now ~15–25 ms off-thread; the debounce only absorbs gesture churn).
- `useThumbnails`: binary path when available; generation order is **outward
  from the current page** (current, +1, −1, +2, …) instead of always 0…N.

## 3. Benchmark results (median of 5)

### sf15.pdf — 1.1 MB, 2-page XFA government form
| Metric | Before | After | Δ |
|---|---|---|---|
| Page render @scale 2 (backend) | 188.7 ms | **21.0 ms** | **9×** |
| + transport to JS-usable pixels | + PNG 5.3 ms + b64 0.3 ms + atob + PNG-decode (est. 10–40 ms) | + ~1 ms header/copy | encode/decode chain eliminated |
| Thumbnail | 49.1 ms | 19.7 ms | 2.5× |
| Open (one-time) | 13.0 ms | ~204 ms | pays the flatten **once**, off the main thread |

### f1040.pdf — 220 KB, 2-page IRS XFA form
| Metric | Before | After | Δ |
|---|---|---|---|
| Page render @scale 2 | 291.9 ms | **14.6 ms** | **20×** |
| Open (one-time) | 4.1 ms | ~255 ms | one-time flatten |

### two_pages.pdf — 13 KB, non-XFA fixture
Render 7–11 ms before vs 9–16 ms after — within run-to-run noise (±2× on this
tiny doc); no regression. Non-XFA docs skip the flatten entirely (same Arc).

### Payload @scale 2 (1224×1584)
raw RGBA 7.57 MB (binary IPC, zero encode/decode) vs PNG 727 KB + base64
970 KB + JSON envelope (old path, full encode/decode chain on both sides).

## 4. What the measurements falsified

- **"Defer document_info scans" (H1, part)** — `scan_active_content` +
  geometry walk measured 0.13–1.7 ms on real forms. Not worth an API split;
  dropped.
- **"Second disk read hurts open"** — the duplicate read cost ~0.3–0.5 ms
  (the lopdf *parse* is the cost, 10.5 ms on sf15, identical from memory).
  `load_mem` kept (free), but it is not a lever.
- **"SDK render is fast (≈8–57 ms), the editor wraps it in overhead"** — true
  for non-XFA documents, but the dominant editor-side latency on real XFA forms
  was the SDK's per-render flatten, reachable (and fixable) from the editor by
  rendering a pre-flattened document. Editor-measured render of sf15 through
  the old path: 188–292 ms, not 57 ms.
- **Thin LTO** — no measurable render delta in this bench (within noise).

## 5. Risks

- **Flatten-at-open cost** (XFA only): +~190–250 ms on open, off the main
  thread, behind the existing loading state. Every subsequent render is 9–20×
  faster; net win from the very first paint.
- **Render snapshot staleness**: a mutation mid-render produces a frame of the
  previous revision; the existing `documentVersion`/generation guards discard
  it. Same semantics as before (renders were already async from the UI's view).
- **Raw RGBA payload size** (7.5 MB @scale 2): Tauri 2 raw IPC is a
  protocol-level byte transfer; no JSON/string churn. At very high zoom
  (scale 4+ ≈ 30 MB) transfer grows — bounded by `MAX_QUALITY_RENDER_SCALE`
  and absorbed by the byte-budget cache.
- **256 MB bitmap budget**: decoded-RGBA accounting, LRU eviction; clears on
  document switch (pre-existing behaviour).
- **Browser/mock engines**: unaffected — raw methods are optional; every raw
  call site falls back to the legacy path.

## 6. Remaining opportunities (not taken, with reasons)

1. **SDK-side: cache `open_flattened_xfa_for_render`** — the proper fix lives
   in the SDK (one-line `OnceCell` semantics); the editor-side render-doc makes
   it moot for the editor but other SDK consumers still pay it. Out of scope
   per the "editor repository only" constraint.
2. **Non-render commands still sync** (`get_page_text_spans`, save, OCR…) —
   they run on the main thread. The render path no longer competes with them,
   but heavyweight ones (OCR, compress) deserve the same `(async)` treatment.
3. **Scroll handler O(N) rect queries** (assessment L3) — real but small;
   untouched.
4. **Quality-pass scale cap 12× via raw RGBA** means ~270 MB single-bitmap at
   A4×12 — consider capping raw-path quality scale lower or switching to tiled
   rendering if users zoom that far.
5. **`renderPageToCanvas` interface method** — still unimplemented by the Tauri
   engine (dead branch); could be removed from the interface or implemented
   synchronously over raw IPC later.
