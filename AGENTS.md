# PDFluent - Agent Instructions

## Project Overview

PDFluent is a privacy-first open-source desktop PDF editor. Built with Tauri v2 (Rust backend + React/TypeScript frontend), Pdfium (PDF rendering), and LibPDF (PDF manipulation).

## Tech Stack

- **Desktop framework:** Tauri v2 (Rust + web frontend)
- **PDF rendering:** Pdfium via `pdfium-render` crate (Rust) - renders pages to PNG
- **PDF manipulation:** `@libpdf/core` (TypeScript) - merge, split, rotate, sign, forms
- **Frontend:** React 19 + TypeScript (Vite bundler)
- **Styling:** Plain CSS with CSS custom properties (dark theme, no Tailwind)
- **License:** AGPL-3.0-or-later (all source files must have SPDX header)

## Key Architecture Decisions

### Rendering pipeline
PDF pages are rendered in Rust (Pdfium → PNG → base64) and sent to the frontend via Tauri IPC commands. The frontend displays them as `<img>` tags. This is intentional - Pdfium runs natively for performance, the webview just displays the result.

### Thread safety
`PdfEngine` uses `unsafe impl Send/Sync` because all access is serialized through `Mutex<PdfEngine>` in `AppState`. Do not remove the Mutex or the unsafe impls.

### LibPDF runs in the frontend
LibPDF is a TypeScript library that runs in the webview, not in Rust. It handles document manipulation (merge, split, rotate, forms, signatures). Pdfium handles rendering only.

## File Map

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app state, keyboard shortcuts, zoom/navigation logic |
| `src/components/Viewer.tsx` | Renders current PDF page from Rust backend |
| `src/components/Sidebar.tsx` | Page thumbnail list with progressive loading |
| `src/components/Toolbar.tsx` | Page nav (prev/next/go-to), zoom (+/-/reset) |
| `src/lib/tauri-api.ts` | Typed wrappers for Tauri invoke commands |
| `src/lib/pdf-manipulator.ts` | LibPDF wrappers for merge/split/rotate/remove |
| `src/styles/global.css` | All CSS (dark theme, no CSS modules) |
| `src-tauri/src/lib.rs` | Tauri command definitions + AppState |
| `src-tauri/src/pdf_engine.rs` | Pdfium rendering engine |
| `src-tauri/src/main.rs` | Binary entry point (just calls `run()`) |

## Conventions

- All files start with `// SPDX-License-Identifier: AGPL-3.0-or-later` and copyright header
- CSS files use `/* SPDX-License-Identifier: AGPL-3.0-or-later */`
- React components use named exports (no default exports)
- TypeScript: strict mode, no `any`
- CSS: plain CSS with custom properties in `:root`, class-based (BEM-ish), no CSS-in-JS
- Rust: standard formatting, errors returned as `Result<T, String>` for Tauri commands

## Setup to Run

```bash
npm install
./scripts/setup-pdfium.sh   # Downloads Pdfium native library
npm run tauri dev            # Start dev server
```

## Remaining Work (prioritized)

See Linear project "PDFluent" for full issue list. Key next items:

1. **Annotations** - highlight, comment, freehand draw, shapes on PDF pages
2. **Form filling** - AcroForms support via LibPDF
3. **Digital signatures** - PAdES signing via LibPDF
4. **Page management UI** - drag-to-reorder sidebar, visual split/merge
5. **Storage** - BYOS integration via Apache OpenDAL (Rust crate)
6. **CI/CD** - GitHub Actions for lint, test, build per platform
7. **Website** - pdfluent.com landing page + docs (Cloudflare hosting)

## Testing

No test suite yet. When adding tests:
- Rust: use `#[cfg(test)]` module in each source file
- TypeScript: use Vitest (already compatible with Vite setup)
- Integration: Tauri has `tauri-driver` for WebDriver-based E2E tests

## Common Pitfalls

- Pdfium binary must be present at `src-tauri/lib/lib/libpdfium.dylib` (macOS) before `cargo build`
- The `image` crate must use `default-features = false, features = ["png"]` to avoid pulling in massive video codec dependencies
- LibPDF's TypeScript types require `skipLibCheck: true` in tsconfig (already set)
- Tauri commands use snake_case in Rust but the frontend calls them with the same names via `invoke()`
