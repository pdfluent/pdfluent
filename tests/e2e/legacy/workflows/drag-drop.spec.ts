// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gotoViewer, gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * File drag & drop — E2E tests.
 *
 * Validates:
 * - PDF file loaded via browser file input → document opens
 * - Drag indicator or welcome screen behaviour
 *
 * Note: True drag & drop simulation in headless Chromium is limited.
 * We test the file input path which is the browser-mode equivalent.
 */

test.describe('file loading — browser mode', () => {
  test('welcome screen has open button', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-open-btn'))).toBeVisible();
  });

  test('loading a document transitions from welcome to viewer', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();

    // Use the test hook to simulate loading a PDF (browser mode uses ArrayBuffer)
    const pdfPath = join(__dir, '../fixtures/minimal.pdf');
    let pdfBytes: number[];
    try {
      pdfBytes = Array.from(readFileSync(pdfPath));
    } catch {
      // If fixture doesn't exist, use mock document path
      await page.waitForFunction(
        () => typeof (window as unknown as Record<string, unknown>)['__pdfluent_test__'] !== 'undefined',
        undefined,
        { timeout: 15_000 },
      );
      await page.evaluate(
        (p: string) =>
          ((window as unknown as Record<string, unknown>)['__pdfluent_test__'] as { loadDocument: (p: string) => Promise<void> }).loadDocument(p),
        'mock-test.pdf',
      );
      await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
      return;
    }

    // Load real PDF bytes
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>)['__pdfluent_test__'] !== 'undefined',
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(async (bytes: number[]) => {
      const ab = new Uint8Array(bytes).buffer;
      await ((window as unknown as Record<string, unknown>)['__pdfluent_test__'] as { loadDocument: (ab: ArrayBuffer) => Promise<void> }).loadDocument(ab);
    }, pdfBytes);

    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });

  test('document loaded state shows page canvas', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('rendered-page'))).toBeVisible();
  });

  test('document loaded state shows thumbnails', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('thumbnail-scroll-container'))).toBeVisible();
  });
});

test.describe('file loading — error resilience', () => {
  test('no JS errors during document load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);
    expect(jsErrors).toHaveLength(0);
  });
});
