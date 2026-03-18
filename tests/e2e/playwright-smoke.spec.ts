// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer } from './helpers/app';
import { tid } from './helpers/selectors';

test.describe('smoke', () => {
  test('app loads at /?v2', async ({ page }) => {
    await gotoViewer(page);
    await expect(page).toHaveURL(/\?v2/);
  });

  test('welcome screen is visible on first load', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-screen'))).toBeVisible();
  });

  test('viewer-empty-state wrapper is present', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();
  });

  test('welcome open button is visible', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-open-btn'))).toBeVisible();
  });

  test('welcome screen contains PDFluent wordmark', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-screen'))).toContainText('PDFluent');
  });

  test('no fatal JS errors during initial load', async ({ page }) => {
    const fatalErrors: string[] = [];
    page.on('pageerror', (err) => {
      // Suppress expected Tauri-related errors that occur in browser mode.
      const msg = err.message;
      if (
        msg.includes('__TAURI__') ||
        msg.includes('tauri') ||
        msg.includes('invoke')
      ) return;
      fatalErrors.push(msg);
    });
    await gotoViewer(page);
    expect(fatalErrors).toHaveLength(0);
  });

  test('dev test hook becomes available after engine init', async ({ page }) => {
    await gotoViewer(page);
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>)['__pdfluent_test__'] !== 'undefined',
      undefined,
      { timeout: 15_000 },
    );
    const hasHook = await page.evaluate(
      () => typeof (window as unknown as Record<string, unknown>)['__pdfluent_test__'] !== 'undefined',
    );
    expect(hasHook).toBe(true);
  });
});
