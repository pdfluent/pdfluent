// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Committed 1-page minimal PDF fixture — always present, no machine-specific paths.
const REAL_PDF = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/minimal.pdf');

// Note on engine path:
// Playwright runs in Chromium (no __TAURI__), so BrowserTestRuntimeAdapter /
// MockPdfEngine handles all calls. This exercises the complete frontend pipeline
// (engine init → loadDocument → render → navigate → thumbnails → zoom) with real
// file bytes passed through, but Rust IPC (open_pdf / render_page) is simulated
// by the mock. The mock returns a 3-page document regardless of input content.

test.describe('v2 viewer smoke test', () => {
  test.describe.configure({ mode: 'serial' });

  test('full pipeline: load real PDF bytes, render, navigate, thumbnails, zoom, no console errors', async ({ page }) => {

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/?v2');

    // Wait for the engine to initialise and expose the test helper
    await page.waitForFunction(() => typeof window.__pdfluent_test__ !== 'undefined', { timeout: 8_000 });

    // Read real PDF bytes in Node, convert to plain number array for serialisation
    const pdfBytes = Array.from(fs.readFileSync(REAL_PDF));

    // Call loadDocument directly on the engine — bypasses the native file dialog
    await page.evaluate(async (bytes: number[]) => {
      const ab = new Uint8Array(bytes).buffer;
      await window.__pdfluent_test__!.loadDocument(ab);
    }, pdfBytes);

    // ── Page 1 renders ──────────────────────────────────────────────────────

    const renderedPage = page.getByTestId('rendered-page');
    await expect(renderedPage).toBeAttached({ timeout: 10_000 });
    await expect(renderedPage).toHaveAttribute('alt', 'Page 1');

    // src must be a blob URL — confirms PNG bytes reached the img element
    const src1 = await renderedPage.getAttribute('src');
    expect(src1).toMatch(/^blob:/);

    // Page counter reflects the loaded document
    await expect(page.locator('input[type=number]').first()).toHaveValue('1');
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible();

    // ── Page navigation ─────────────────────────────────────────────────────

    await page.getByRole('button', { name: '›' }).click();
    await expect(renderedPage).toHaveAttribute('alt', 'Page 2', { timeout: 5_000 });
    const src2 = await renderedPage.getAttribute('src');
    expect(src2).toMatch(/^blob:/);
    // Each page gets a fresh blob URL
    expect(src2).not.toBe(src1);

    await page.getByRole('button', { name: '›' }).click();
    await expect(renderedPage).toHaveAttribute('alt', 'Page 3', { timeout: 5_000 });

    // ── Thumbnails ──────────────────────────────────────────────────────────

    // All three thumbnail buttons must be visible
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId(`thumbnail-${i}`)).toBeVisible({ timeout: 3_000 });
    }

    // At least the first thumbnail must have resolved to a blob URL
    // (generation is sequential; thumbnail-0 finishes first)
    const thumb0Img = page.getByTestId('thumbnail-0').locator('img');
    await expect(thumb0Img).toHaveAttribute('src', /^blob:/, { timeout: 15_000 });

    // ── Zoom ────────────────────────────────────────────────────────────────

    await expect(page.getByText('100%').first()).toBeVisible();

    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('125%').first()).toBeVisible();

    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('150%').first()).toBeVisible();

    await page.getByRole('button', { name: '−' }).click();
    await page.getByRole('button', { name: '−' }).click();
    await expect(page.getByText('100%').first()).toBeVisible();

    // ── No console errors ───────────────────────────────────────────────────

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });
});
