# PDFluent Editor — Current Architecture

_Last updated: 2026-06-11_

This document describes the **current production architecture** of the PDFluent Tauri desktop
editor. It is the single authoritative reference. Where this file conflicts with older docs,
this file wins.

---

## Active product path

```
index.html
  → src/main.tsx                        URL switch only
    → src/viewer/ViewerApp.tsx           ROOT: all state, all hooks (~2,900 lines)
      → src/viewer/v3/EditorV3Shell.tsx  V3 chrome (topbar, left rail, thumbnails, read-bar)
          → src/viewer/components/       38 active UI components
          → src/viewer/hooks/            23 active hooks
```

- **The default URL `/` loads ViewerApp (V3 shell).** This is the product.
- **`?legacy`** loads the retired V1 shell (`src/legacy/`). Launchable but scheduled for removal.
- **`?v2` does nothing.** It is a no-op. Some stale e2e tests use it; ignore those references.

---

## PDF engine

**XFA Rust SDK** — pure Rust, no C/C++ dependencies.

```
src-tauri/Cargo.toml:32-47   →   ../../../XFA/crates/*
src-tauri/src/sdk_facade.rs  →   XFA SDK bridge (Tauri command implementations)
src-tauri/src/lib.rs         →   Tauri command definitions, AppState, font cache init
```

There is **no in-browser PDF engine**. All PDF operations happen in Rust via Tauri IPC.
The frontend has zero WASM PDF code. WASM was removed during the XFA migration (completed).

Pdfium was the previous engine. The migration is done. `XFA_MIGRATIE_ANALYSE.md` in
`docs/archive/` documents that completed migration.

---

## Frontend stack

| Item | Detail |
|---|---|
| Framework | React 19 + TypeScript (strict mode) |
| Bundler | Vite |
| Styling | Plain CSS; `src/styles/viewer-v3.css` is the V3 stylesheet |
| State | React hooks in `ViewerApp.tsx` (no Redux, no Zustand) |
| IPC | Tauri `invoke()` calls; typed wrappers in `src/lib/tauri-api.ts` |
| Translations | 27 locales via `src/i18n/`; translation/summarization AI panels removed |

---

## Key modules

### src/viewer/ViewerApp.tsx
Root component. Owns all document state, zoom, page navigation, annotation state,
undo/redo, keyboard shortcuts, document lifecycle, dirty tracking.

All hooks are wired here via `use*` imports from `src/viewer/hooks/`.

### src/viewer/v3/EditorV3Shell.tsx
The V3 chrome component. Renders:
- `TopBar` (file operations, mode switcher, export, search)
- Left rail (page thumbnails via `ThumbnailStrip`)
- Side panels (annotations, comments, OCR, forms, redaction, signatures)
- Read-aloud bar (`ReadAloudBar`)

### src/viewer/hooks/ (23 hooks)
All hooks are consumed by `ViewerApp.tsx`. Key hooks:
- `useZoomControls` — zoom state, localStorage persistence, presets
- `usePageNavigation` — page index, keyboard navigation
- `useAnnotations` — annotation CRUD, page delete/reorder
- `useKeyboardShortcuts` — all keyboard bindings
- `useSidebarState` — left rail open/close, localStorage persistence
- `useDocumentLifecycle` — open, close, dirty tracking
- `useRenderedCanvas` — page rendering, BitmapCache (256 MB LRU), prefetch ±5

### src/viewer/components/ (38 components)
All active. This is the V3 component directory.
**Not to be confused with `src/legacy/components/`** (V1, retired).

### src/viewer/text/
Text mutation pipeline: validation, font encoding, bbox expansion, mutation constraints.

### src/core/
Engine interfaces, capability registry, document model. Runtime-agnostic abstractions.

### src/platform/
Tauri and mock runtime adapters. `TauriRuntimeAdapter` is the production path.

### src/legacy/ (V1 shell — retired)
`src/legacy/App.tsx` + `src/legacy/components/` (13 files). Only reachable via `?legacy`.
Feature-parity check required before deletion. Do not edit these files.

---

## Rendering pipeline

```
Rust: XFA SDK → render_page(index, zoom) → raw bytes → Tauri IPC
TypeScript: invoke('render_page') → ArrayBuffer → createImageBitmap → canvas
```

BitmapCache: 256 MB byte-budgeted LRU in `useRenderedCanvas.ts`.
Prefetch: ±5 pages via `requestIdleCallback`.
Dedup: `INFLIGHT_RENDERS` map prevents duplicate concurrent renders.

---

## Release gate (blocking)

```bash
npm run typecheck
npm test
cargo check
cargo clippy -- -D warnings
cargo test --lib
npm run test:e2e -- tests/e2e/smoke-shell.spec.ts
```

---

## What was removed / is not active

| Item | Status | Historical reference |
|---|---|---|
| In-browser WASM PDF engine | Removed | `docs/archive/wasm-capability-matrix.md` |
| Pdfium engine | Removed (migration complete) | `docs/archive/XFA_MIGRATIE_ANALYSE.md` |
| AI translation panel | Removed | — |
| AI summarization panel | Removed | — |
| `src/workers/` | Deleted (was empty) | — |
| WASM capability matrix | Archived | `docs/archive/wasm-capability-matrix.md` |

---

## Legacy items still present (scheduled cleanup)

| Item | Path | Blocker before removal |
|---|---|---|
| V1 shell | `src/legacy/` | Feature-parity check (AdminPanel, Settings, FirstRunDialog, LicenseBanner) |
| `?legacy` URL switch | `src/main.tsx` | After V1 shell removed |
| Dead e2e browser specs | `tests/e2e/legacy/` | Replace with Tauri-runtime smoke suite |
| Browser-mode e2e strategy | All Playwright except `smoke-shell.spec.ts` | Requires new Tauri-driven e2e infra |
