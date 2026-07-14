// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Viewport responsive — E2E tests.
 *
 * Validates that the viewer renders correctly at different viewport sizes.
 * Tests key elements remain visible and functional.
 */

const VIEWPORTS = [
  { name: 'small', width: 1024, height: 768 },
  { name: 'standard', width: 1440, height: 900 },
  { name: 'full-hd', width: 1920, height: 1080 },
  { name: 'qhd', width: 2560, height: 1440 },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('document loads and renders', async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page.locator(tid('rendered-page'))).toBeVisible();
      await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
    });

    test('topbar controls are visible', async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page.locator(tid('undo-btn'))).toBeVisible();
      await expect(page.locator(tid('redo-btn'))).toBeVisible();
      await expect(page.locator(tid('close-document-btn'))).toBeVisible();
    });

    test('navigation controls are visible', async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page.locator(tid('nav-prev-page-btn'))).toBeVisible();
      await expect(page.locator(tid('nav-next-page-btn'))).toBeVisible();
      await expect(page.locator(tid('nav-go-to-page-input'))).toBeVisible();
    });

    test('left panel (thumbnails) is visible', async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page.locator(tid('thumbnail-scroll-container'))).toBeVisible();
    });

    test('right panel (doc info) is visible', async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page.locator(tid('doc-info-panel'))).toBeVisible();
    });

    test('no JS errors', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));
      await gotoViewerWithDoc(page);
      expect(jsErrors).toHaveLength(0);
    });
  });
}
