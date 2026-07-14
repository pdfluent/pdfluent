# PDFluent — Visual / Click-Through E2E Test Plan

> **Version:** 2026-05-14  
> **Audience:** Codex (automated agent) and human QA  
> **Scope:** PDFluent viewer app (`/?v2`) in browser/WASM runtime  
> **Runtime under test:** `WasmPdfEngine` (default in browser)  
> Tauri scenarios are marked 🖥️ and are out-of-scope until a native build is available.

---

## 1. Environment Setup

### 1.1 Prerequisites

```bash
# From /Users/jasperdewinter/Documents/PDFluent/pdfluent
npm install
npm run dev          # or: npm run preview for production build
```

Playwright is configured in `playwright.config.ts`. The dev server (`vite`) serves the app at `http://localhost:5173` and the preview build at `http://localhost:4173`.

The viewer is mounted at the URL **`/?v2`** (not `/`). Always navigate there.

### 1.2 How to Load a Document

The viewer exposes a dev-only test hook on `window.__pdfluent_test__`:

```ts
// In Playwright:
await page.evaluate(
  (path) => window.__pdfluent_test__.loadDocument(path),
  'tests/fixtures/sample-text.pdf'
);
// Wait for page to appear:
await page.locator('[data-testid="floating-page-indicator"]').waitFor({ state: 'visible' });
```

The `gotoViewerWithDoc(page)` helper in `tests/e2e/helpers/app.ts` does this in one call but **seeds Dutch locale** (`pdfluent-lang: nl`). When using that helper, all mode tab labels will be in Dutch (see §3 below).

To use English labels, seed English before navigating:

```ts
await page.addInitScript(() => { localStorage.setItem('pdfluent-lang', 'en'); });
await page.goto('/?v2');
```

### 1.3 Locale Reference

| Mode (EN) | Mode (NL) — if using `gotoViewer()` helper |
|-----------|---------------------------------------------|
| Read      | Lezen                                       |
| Review    | Beoordelen                                  |
| Edit      | Bewerken                                    |
| Organize  | Indelen                                     |
| Forms     | Formulieren                                 |
| Protect   | Beveiligen                                  |
| Convert   | Converteren                                 |

### 1.4 Mode Switching

Mode switcher tabs have **no `data-testid`**. Use role-based selectors:

```ts
await page.getByRole('button', { name: 'Read', exact: true }).click();
// or with Dutch locale:
await page.getByRole('button', { name: 'Lezen', exact: true }).click();
```

---

## 2. Fixture Documents

| Fixture Path | Contents | Status |
|---|---|---|
| `tests/fixtures/minimal.pdf` | 1-page minimal PDF, no text, no forms | **Present** |
| `tests/fixtures/sample-text.pdf` | 3-page PDF with selectable text | **Present** |
| `tests/fixtures/sample-form.pdf` | 1-page PDF with AcroForm text field + checkbox | **Missing — must create** |
| `tests/fixtures/sample-signed.pdf` | 1-page PDF with valid digital signature | **Missing — must create** |
| `tests/fixtures/sample-xfa.pdf` | App-owned PDF with an `/XFA` marker for detection and workflow testing | **Present; synthetic marker only** |
| `tests/fixtures/sample-b.pdf` | Any valid PDF for merge second-document | **Missing — must create** |

**Creating missing fixtures:** Use app-owned generated PDFs or source them from a public PDF test suite with redistribution rights documented in the test comments. Do not copy fixtures from `/Users/jasperdewinter/Documents/XFA` unless the project fixture policy explicitly allows it.

**Real XFA fixture still needed:** Deep flatten proof requires a redistributable PDF with a real `/AcroForm` dictionary containing an `/XFA` packet array or stream plus visible XFA field data. The current `sample-xfa.pdf` supports banner detection, flatten workflow, export checks, and reopen checks, but it does not produce byte-different flattened output and must not be used to claim real packet-removal coverage.

---

## 3. Selector Reference

All `data-testid` selectors can be referenced as `[data-testid="<id>"]`.

### 3.1 Welcome / Shell

| Selector | Element |
|----------|---------|
| `viewer-empty-state` | Outer wrapper shown when no doc is loaded |
| `welcome-screen` | Welcome card component |
| `welcome-open-btn` | "Open file" button on welcome screen |

### 3.2 Document Loaded State

| Selector | Element |
|----------|---------|
| `floating-page-indicator` | "1 / N" page counter floating at bottom |
| `rendered-page` | `<img>` showing the rendered PDF page |
| `page-view` | Wrapper `<div>` around the rendered page |
| `thumbnail-scroll-container` | Left rail thumbnail strip |
| `thumbnail-{i}` | Individual thumbnail (0-indexed) |
| `nav-prev-page-btn` | Previous page button |
| `nav-next-page-btn` | Next page button |
| `nav-go-to-page-input` | Page number input field |

### 3.3 TopBar

| Selector | Element |
|----------|---------|
| `close-document-btn` | Close document (×) |
| `undo-btn` | Undo |
| `redo-btn` | Redo |
| `search-btn` | Opens command palette |
| `save-as-btn` | Save as (Tauri only active) |
| `export-btn` | Opens export dialog |

### 3.4 ModeToolbar (per mode)

| Selector | Element | Mode | Runtime |
|----------|---------|------|---------|
| `toolbar-zoom-display` | Zoom percentage label | read | both |
| `print-all-btn` | Print all pages | read | both |
| `annotation-tool-highlight` | Highlight tool toggle | review | both |
| `annotation-tool-underline` | Underline tool toggle | review | tauri only |
| `annotation-tool-strikeout` | Strikeout tool toggle | review | tauri only |
| `annotation-tool-rectangle` | Rectangle tool toggle | review | tauri only |
| `annotation-tool-redaction` | Redact tool toggle | review | tauri only |
| `annotation-tool-redaction-protect` | Redact draw toggle | protect | tauri only |
| `add-comment-btn` | "+" button, creates sticky note | review | both |
| `comment-nav` | Comment navigation wrapper | review | both |
| `comment-prev-btn` | Previous comment | review | both |
| `comment-next-btn` | Next comment | review | both |
| `field-nav` | Form field nav wrapper | forms | tauri only |
| `field-prev-btn` | Previous form field | forms | tauri only |
| `field-next-btn` | Next form field | forms | tauri only |

### 3.5 Search

| Selector | Element |
|----------|---------|
| `search-panel` | Left rail search panel (activated via toolbar search tool) |
| `search-input` | Search text input |
| `search-result-count` | "N results" label |
| `search-result-item` | Individual result row |
| `command-palette` | Command palette overlay (via `search-btn` or Meta+K) |
| `command-palette-input` | Command palette input |
| `command-item` | Command palette result row |

### 3.6 Export Dialog

| Selector | Element |
|----------|---------|
| `export-dialog` | Export dialog wrapper |
| `export-format-select` | Format `<select>` dropdown |
| `export-submit-btn` | "Export" / confirm button |
| `export-cancel-btn` | "Cancel" button |
| `export-close-btn` | Close (×) button |

### 3.7 Organize Mode

| Selector | Element |
|----------|---------|
| `organize-grid` | Page thumbnail grid |
| `organize-header` | Top bar with select-all and action buttons |
| `select-all-btn` | Select all pages |
| `organize-merge-pdf-btn` | "Add PDF" merge button (disabled in WASM) |
| `organize-split-btn` | "Split pages" button (disabled in WASM) |
| `batch-action-bar` | Batch action bar (shown on selection) |
| `batch-rotate-btn` | Rotate selected pages |
| `batch-delete-btn` | Delete selected pages |
| `organize-page-tile-{i}` | Page tile (0-indexed) |
| `organize-thumb-{i}` | Thumbnail inside page tile |
| `organize-rotate-{i}` | Per-page rotate button |
| `organize-delete-{i}` | Per-page delete button |

### 3.8 Right Context Panel

| Selector | Element |
|----------|---------|
| `doc-info-panel` | Document info section (read mode) |
| `doc-info-page-count` | Page count span |
| `doc-info-form-type` | Form type (XFA, AcroForm, or None) |
| `reviewer-name-input` | Reviewer name field (review mode) |
| `comment-filter-input` | Comment filter input (review mode) |
| `comment-filter-count` | "N of M comments" label |
| `forms-completion-summary` | "X/Y fields filled" (forms mode) |
| `ocr-panel` | OCR panel wrapper (convert/edit/review modes) |
| `run-ocr-btn` | Run OCR button |
| `redaction-panel` | Redaction panel (protect/review modes) |
| `signature-panel` | Signature panel (protect mode) |

### 3.9 Dialogs

| Selector | Element |
|----------|---------|
| `shortcut-sheet` | Keyboard shortcut overlay |
| `shortcut-sheet-close` | Close shortcut sheet |
| `recovery-dialog` | Recovery dialog |
| `recovery-recover-btn` | Recover autosave |
| `recovery-discard-btn` | Discard autosave |
| `unsaved-changes-dialog` | Unsaved changes dialog |
| `unsaved-save-btn` | Save before closing |
| `unsaved-discard-btn` | Discard changes |
| `unsaved-cancel-btn` | Cancel close |

---

## 4. Missing Selectors (Codex Workarounds Required)

The following elements do not have `data-testid` attributes in the current codebase. Codex must use fallback locators:

| Element | Why it's needed | Codex workaround |
|---------|----------------|-----------------|
| **Mode switcher tabs** | Switching between Read/Review/Organize etc. | `page.getByRole('button', { name: '<Mode>', exact: true })` |
| **XFA warning banner** | Verify XFA detection in VE-011 | `page.locator('.text-amber-700, .text-amber-400').first()` or `page.getByText('contains XFA form data')` |
| **Zoom in/out tool buttons** | Verify enabled state in toolbar | `page.getByTitle('Zoom in')` / `page.getByTitle('Zoom out')` — or title `(not yet available)` for disabled |
| **"All Tools" panel open button** | In ModeSwitcher, no testid | `page.getByTitle('All tools')` or `page.getByRole('button', { name: 'All tools' })` |
| **ToolButton disabled state** | Check tool is greyed out | `.disabled` attribute + CSS class `opacity-40 cursor-default` |

### Current Runtime Gaps And Former UI Gaps

The app distinguishes UI gaps from runtime gaps. If a WASM export is missing at runtime, the UI must not present the operation as usable.

| Operation | Engine API | ViewerApp UI | Test approach |
|-----------|-----------|-------------|---------------|
| Free text annotation | Missing `PdfDoc.addFreeText` runtime export | Hidden in WASM | Skip as `apiAvailableButRuntimeMissing` |
| Flatten XFA | `WasmTransformEngine.flattenXfa()` | `xfa-flatten-btn` in XFA banner | Active visual E2E; current fixture verifies workflow, export, and reopen; real XFA fixture needed for byte-difference and packet-removal assertions |
| PDF/A validate | `WasmValidationEngine.validatePdfA()` | `validate-pdfa-btn` in Convert right panel | Active visual E2E |
| PDF/A convert | `WasmTransformEngine.convertToPdfA()` | `convert-pdfa-btn` in Convert right panel | Active visual E2E |
| Merge (WASM) | `WasmTransformEngine.merge()` | `organize-merge-pdf-btn` disabled in WASM | Tauri only in UI |

---

## 5. Recommended Test Execution Order

Run in this sequence so earlier tests don't invalidate later state:

```
VE-001  → VE-002  → VE-003  → VE-004   (core viewer readiness)
→ VE-005 → VE-006                        (text layer)
→ VE-007 → VE-008 → VE-010              (skipped runtime gaps)
→ VE-019 → VE-020 → VE-021 → VE-022    (capability gating)
→ VE-023 → VE-024                        (mode-specific gating)
→ VE-011                                  (XFA banner)
→ VE-012 → VE-013                        (XFA flatten + export)
→ VE-014 → VE-015                        (PDF/A validate + convert)
→ VE-017                                  (clean export)
→ VE-009 → VE-016 → VE-018              (runtime gap / Tauri)
```

---

## 6. Scenario Summaries

See `tests/fixtures/visual-e2e-scenarios.json` for the full machine-readable definitions.

| ID | Title | Runtime | Priority |
|----|-------|---------|---------|
| VE-001 | Open PDF via welcome screen | wasm | beta_blocker |
| VE-002 | Render first page (PNG from engine) | wasm | beta_blocker |
| VE-003 | Page navigation (prev/next/input) | wasm | beta_blocker |
| VE-004 | Zoom in / zoom out | wasm | beta_blocker |
| VE-005 | Search text in document | wasm | beta_blocker |
| VE-006 | Select text on canvas | wasm | beta_blocker |
| VE-007 | Add highlight annotation | wasm | runtime_gap |
| VE-008 | Add sticky note comment | wasm | runtime_gap |
| VE-009 | Add free text annotation | wasm | runtime_gap |
| VE-010 | Export annotated PDF (browser download) | wasm | runtime_gap |
| VE-011 | XFA detection banner | wasm | beta_blocker |
| VE-012 | Flatten XFA from XFA banner | wasm | app_ready |
| VE-013 | Export after XFA flatten | wasm | app_ready |
| VE-014 | PDF/A validate | both | app_ready |
| VE-015 | PDF/A convert to PDF/A-2B | wasm | app_ready |
| VE-016 | Merge PDFs (Tauri append) | tauri | regression |
| VE-017 | Browser PDF download (clean export) | wasm | beta_blocker |
| VE-018 | Tauri save / export | tauri | regression |
| VE-019 | WASM: organize tools disabled | wasm | beta_blocker |
| VE-020 | WASM: annotation creation tools hidden | wasm | beta_blocker |
| VE-021 | WASM: export dialog — only PDF format | wasm | beta_blocker |
| VE-022 | WASM: disabled tool click — no toast | wasm | beta_blocker |
| VE-023 | WASM: OCR disabled in convert mode | wasm | beta_blocker |
| VE-024 | WASM: redact button hidden in protect mode | wasm | beta_blocker |

**Total scenarios:** 24  
**Beta blockers:** 15 (VE-001–VE-008, VE-010–VE-011, VE-017, VE-019–VE-024)  
**Regression:** 2 (VE-016, VE-018)  
**Later (no UI or Tauri-only):** 7 (VE-009, VE-012–VE-016)

---

## 7. Pass / Fail Criteria

### Global Pass Criteria

- All `beta_blocker` scenarios pass on a fresh `npm run dev` + Chromium.
- No scenario causes an uncaught console error visible in `page.on('pageerror')`.
- No fake-success toast appears when a disabled tool is clicked.

### Global Fail Criteria

- Any `beta_blocker` scenario fails or times out.
- A disabled tool button dispatches a task to the task queue.
- An unsupported feature shows a success toast (false positive).
- The `rendered-page` img `src` is an empty blob or broken (render failure).

---

## 8. Commands for Codex

```bash
# Pre-flight checks
npm run wasm:check      # verifies WASM artifacts are fresh
npm run typecheck       # TypeScript must be clean

# Run all Playwright E2E tests
npm run test:e2e

# Run just smoke tests
npx playwright test tests/e2e/playwright-smoke.spec.ts

# Run visual regression suite
npm run test:visual

# Run unit tests (vitest)
npm run test
```

Start the app before Playwright runs (the `playwright.config.ts` `webServer` block handles this automatically when using `npm run test:e2e`).

---

## 9. XFA SDK Modification Policy

**The XFA SDK must not be modified.** The SDK lives in `../../XFA/crates/xfa-wasm/`. Any change to files under that path violates the project constraint. WASM artifacts at `public/xfa_wasm_bg.wasm` are pre-built and verified by `npm run wasm:check-artifacts`.

---

*End of plan.*
