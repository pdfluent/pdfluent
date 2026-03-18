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

### License headers
- All files start with `// SPDX-License-Identifier: AGPL-3.0-or-later` and copyright header
- CSS files use `/* SPDX-License-Identifier: AGPL-3.0-or-later */`

### Code style
- React components use named exports (no default exports)
- TypeScript: strict mode, no `any`
- CSS: plain CSS with custom properties in `:root`, class-based (BEM-ish), no CSS-in-JS
- Rust: standard formatting, errors returned as `Result<T, String>` for Tauri commands

### Git & commits
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep PRs focused on a single change
- Do not commit secrets, credentials, or `.env` files
- Do not force-push to `main`

### Writing & content
- All external-facing content (README, docs, blog posts, release notes, App Store descriptions) must be written in English
- Tone: direct, specific, no fluff. Avoid AI-sounding language (no "streamline", "leverage", "empower", "seamless", "cutting-edge", "unlock", "harness")
- Do not use emojis in code, docs, or commits
- Do not auto-generate README or documentation files unless explicitly asked

### Code quality rules
- Do not over-engineer. Only make changes that are directly requested or clearly necessary
- Do not add features, refactor code, or make "improvements" beyond what was asked
- Do not add docstrings, comments, or type annotations to code you did not change
- Do not add error handling or validation for scenarios that cannot happen
- Do not create helpers, utilities, or abstractions for one-time operations
- Do not add backwards-compatibility shims or rename unused variables
- A bug fix does not need surrounding code cleaned up
- Three similar lines of code is better than a premature abstraction
- Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, etc.)

### Architecture rules (do not break these)
- PDF rendering happens in Rust (Pdfium) only. Do not add JavaScript PDF rendering
- LibPDF runs in the frontend (webview) only. Do not move it to Rust
- Storage abstraction uses Apache OpenDAL (Rust). Do not add other storage libraries
- The app must work 100% offline. Do not add features that require internet
- Hosting is Cloudflare Pages. Do not configure for Vercel, Netlify, or other providers

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

## PR Review Checklist

Before opening or approving a PR, verify:

1. **License headers** — Every new/modified source file has the SPDX header
2. **No `any`** — TypeScript strict mode, no `any` types anywhere
3. **Named exports** — React components use named exports, not default
4. **Conventional commit** — Commit message follows `type: description` format
5. **No secrets** — No API keys, tokens, passwords, or `.env` values committed
6. **No unnecessary changes** — Diff contains only what the task requires
7. **Security** — No command injection, XSS, or unsafe user input handling
8. **Offline-compatible** — New features work without internet
9. **Tests** — If test infrastructure exists, new logic has tests
