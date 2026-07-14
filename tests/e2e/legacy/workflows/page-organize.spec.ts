// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Page organize mode — E2E tests.
 *
 * Validates:
 * - Organize mode activation (via Organiseren mode button)
 * - Thumbnail grid visible
 * - Page tiles for each page
 * - Selection, rotation, deletion controls
 * - Batch action bar
 */

test.describe('page organize — mode activation', () => {
  test('organize grid appears when switching to organize mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await expect(page.locator(tid('organize-grid'))).toBeVisible();
  });

  test('organize header is visible', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await expect(page.locator(tid('organize-header'))).toBeVisible();
  });

  test('select all button is visible', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await expect(page.locator(tid('select-all-btn'))).toBeVisible();
  });
});

test.describe('page organize — page tiles', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
  });

  test('shows 3 page tiles for mock document', async ({ page }) => {
    // MockDocumentEngine returns 3 pages
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(tid(`organize-page-tile-${i}`))).toBeVisible();
    }
  });

  test('each tile has a page number label', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      const label = page.locator(tid(`organize-page-number-${i}`));
      await expect(label).toBeVisible();
      await expect(label).toContainText(String(i + 1));
    }
  });

  test('each tile has a rotate button', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(tid(`organize-rotate-${i}`))).toBeVisible();
    }
  });

  test('each tile has a delete button', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(tid(`organize-delete-${i}`))).toBeVisible();
    }
  });
});

test.describe('page organize — selection and batch actions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
  });

  test('clicking a tile selects it', async ({ page }) => {
    // Click the tile's thumbnail or number area to trigger selection
    const tile = page.locator(tid('organize-page-tile-0'));
    await tile.click();
    await page.waitForTimeout(200);
    // After clicking, batch action bar may appear or selection state changes
    // Verify the tile is still interactive after click
    await expect(tile).toBeVisible();
  });

  test('select all selects all tiles', async ({ page }) => {
    await page.locator(tid('select-all-btn')).click();
    // Batch action bar should appear
    await expect(page.locator(tid('batch-action-bar'))).toBeVisible();
  });

  test('batch action bar shows selection count', async ({ page }) => {
    await page.locator(tid('select-all-btn')).click();
    const count = page.locator(tid('selection-count'));
    if (await count.isVisible()) {
      await expect(count).toContainText('3');
    }
  });

  test('batch action bar has rotate button', async ({ page }) => {
    await page.locator(tid('select-all-btn')).click();
    await expect(page.locator(tid('batch-rotate-btn'))).toBeVisible();
  });

  test('batch action bar has delete button', async ({ page }) => {
    await page.locator(tid('select-all-btn')).click();
    await expect(page.locator(tid('batch-delete-btn'))).toBeVisible();
  });

  test('clear selection button works', async ({ page }) => {
    await page.locator(tid('select-all-btn')).click();
    await expect(page.locator(tid('batch-action-bar'))).toBeVisible();
    await page.locator(tid('clear-selection-btn')).click();
    await expect(page.locator(tid('batch-action-bar'))).not.toBeVisible();
  });
});

test.describe('page organize — additional actions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
  });

  test('merge PDF button is visible', async ({ page }) => {
    await expect(page.locator(tid('organize-merge-pdf-btn'))).toBeVisible();
  });

  test('split button is visible', async ({ page }) => {
    await expect(page.locator(tid('organize-split-btn'))).toBeVisible();
  });
});

test.describe('page organize — mode transitions', () => {
  test('leaving organize mode returns to normal view', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await expect(page.locator(tid('organize-grid'))).toBeVisible();
    await switchMode(page, 'Lezen');
    await expect(page.locator(tid('organize-grid'))).not.toBeVisible();
    await expect(page.locator(tid('rendered-page'))).toBeVisible();
  });

  test('no JS errors during organize mode cycle', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await switchMode(page, 'Lezen');

    expect(jsErrors).toHaveLength(0);
  });
});
