// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Pre-commit shell smoke for the v2 viewer. Runs against the browser-test
// build via Playwright.
//
// Coverage split:
//   item1 (v2 default at /)      — verified here, no document needed.
//   item2 (OS-locale -> Dutch)   — verified in tests/i18n-locale-detection.test.ts.
//   item3/4/5 (doc-dependent UI)  — skipped: the browser-test harness does not
//     load a document in headless here (mock engine inactive; browser-test open does
//     not complete), so they are verified by code review + the native app boot
//     + manual native click-through, and documented below.
//   backend (links/bookmarks/split/watermark) — verified by Rust tests in
//     src-tauri/src/pdf_engine.rs (op_outline_*, op_get_page_links_*,
//     op_split_pdf_by_range_*, op_add_watermark_*).

import { expect, test } from "@playwright/test";

// Item 1 — V3 editor shell is the default shell at "/" (no ?v2).
test("item1: V3 editor shell is default at / without ?v2", async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("pdfluent-lang", "nl"); } catch { /* ignore */ }
  });
  await page.goto("/");
  await expect(page.locator(".pfv3[data-has-document='false']")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".welcome-v3")).toBeVisible();
  await expect(page.getByText("PDFluent Editor")).toBeVisible();
});

// Item 3 — "Alle tools" opens (setAllToolsOpen) and the backdrop is transparent
// so the document stays visible (.alltools-backdrop background: transparent).
// Requires an open document for the mode bar to render; not exercisable in the
// headless browser build. Verify manually in the native app.
test.skip("item3: Alle tools opens without obscuring the document (manual/native)", () => {});

// Item 4 — "Bewerken" tab activates edit mode (RightContextPanel edit content).
// Requires an open document; verify manually in the native app.
test.skip("item4: Bewerken tab opens edit UI (manual/native)", () => {});

// Item 5 — Cmd+F focuses search. Handler: useKeyboardShortcuts.ts handleSearchKey
// (metaKey|ctrlKey && key==='f' -> setIsSearchOpen(true)). Requires an open
// document; verify manually in the native app.
test.skip("item5: Cmd+F focuses search (handler in useKeyboardShortcuts; manual/native)", () => {});
