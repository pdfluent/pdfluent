// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc, loadMockDocument } from './helpers/app';
import { tid } from './helpers/selectors';
import { MOCK_DOC } from './mocks/documentState';

/**
 * Verifies that the browser-test runtime adapter + MockPdfEngine are
 * correctly selected when running outside of Tauri.
 */
test.describe('browser-test runtime bootstrap', () => {
  test('window.__TAURI__ is absent in browser mode', async ({ page }) => {
    await gotoViewer(page);
    const hasTauri = await page.evaluate(() => '__TAURI__' in window);
    expect(hasTauri).toBe(false);
  });

  test('mock document loads via test hook', async ({ page }) => {
    await gotoViewer(page);
    await loadMockDocument(page, MOCK_DOC.path);
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });

  test('page indicator shows correct page count after mock load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toContainText(
      `1 / ${MOCK_DOC.pageCount}`,
    );
  });

  test('welcome screen disappears after document load', async ({ page }) => {
    await gotoViewer(page);
    await loadMockDocument(page);
    await expect(page.locator(tid('viewer-empty-state'))).not.toBeVisible();
  });

  test('zoom controls appear after document load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('zoom-reset-btn'))).toBeVisible();
    await expect(page.locator(tid('zoom-fit-width-btn'))).toBeVisible();
  });

  test('zoom display shows percentage after document load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('%');
  });

  test('close-document button appears after document load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('close-document-btn'))).toBeVisible();
  });

  test('closing document returns to welcome screen', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('close-document-btn')).click();
    await expect(page.locator(tid('welcome-screen'))).toBeVisible();
  });
});
