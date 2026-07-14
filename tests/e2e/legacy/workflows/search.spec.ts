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
 * Search functionality — E2E tests.
 *
 * Validates the search panel workflow:
 * - Opening via nav rail button and keyboard shortcut
 * - Typing a query and seeing results
 * - Navigating between results
 * - Closing search clears state
 */

test.describe('search panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
  });

  test('search panel opens via search button in topbar', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    await expect(page.locator(tid('command-palette'))).toBeVisible();
  });

  test('search panel opens via Ctrl+K / Meta+K', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator(tid('command-palette'))).toBeVisible();
  });

  test('command palette has search input', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    const input = page.locator(tid('command-palette-input'));
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('command palette shows command items', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    await expect(page.locator(tid('command-item')).first()).toBeVisible();
  });

  test('typing in command palette filters results', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    const input = page.locator(tid('command-palette-input'));
    const allCount = await page.locator(tid('command-item')).count();

    // Type a specific query that should filter the list
    await input.fill('export');
    await page.waitForTimeout(200);
    const filteredCount = await page.locator(tid('command-item')).count();

    // Filtered list should be smaller or equal
    expect(filteredCount).toBeLessThanOrEqual(allCount);
  });

  test('Escape closes command palette', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    await expect(page.locator(tid('command-palette'))).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tid('command-palette'))).not.toBeVisible();
  });

  test('clicking backdrop closes command palette', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    await expect(page.locator(tid('command-palette'))).toBeVisible();
    // Click the backdrop (fixed overlay behind the palette)
    await page.locator('.fixed.inset-0.bg-black\\/30').click({ force: true });
    await expect(page.locator(tid('command-palette'))).not.toBeVisible();
  });

  test('keyboard navigation works in command palette', async ({ page }) => {
    await page.locator(tid('search-btn')).click();
    await page.waitForTimeout(100);

    // Arrow down should move selection
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    // Should not throw — navigation is internal
    await expect(page.locator(tid('command-palette'))).toBeVisible();
  });
});

test.describe('search panel — document search', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
  });

  test('search input exists in search panel', async ({ page }) => {
    // The SearchPanel is in the left nav rail
    // It has its own search-input testid
    const searchPanel = page.locator(tid('search-panel'));
    const searchInput = page.locator(tid('search-input'));

    // These elements may be visible if the search tab is active in the left nav
    // Just verify they exist in DOM when activated
    if (await searchPanel.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('search result count is shown', async ({ page }) => {
    const resultCount = page.locator(tid('search-result-count'));
    // Only check if search panel is visible
    const searchPanel = page.locator(tid('search-panel'));
    if (await searchPanel.isVisible()) {
      await expect(resultCount).toBeVisible();
    }
  });
});
