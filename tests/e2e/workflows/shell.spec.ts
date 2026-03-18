// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { seedRecentFiles } from '../helpers/bootstrap';
import { MOCK_RECENT_FILES, MOCK_RECENT_FILE_NAME } from '../mocks/documentState';

// ---------------------------------------------------------------------------
// Welcome screen — no document loaded
// ---------------------------------------------------------------------------

test.describe('welcome screen — empty state', () => {
  test('shows empty-state message when no recent files', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-empty-state'))).toBeVisible();
    await expect(page.locator(tid('welcome-empty-state'))).toContainText(
      'Nog geen bestanden geopend',
    );
  });

  test('open button has correct label', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-open-btn'))).toContainText('PDF openen');
  });

  test('recent-file-item is absent when no files seeded', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('recent-file-item'))).toHaveCount(0);
  });
});

test.describe('welcome screen — with recent files', () => {
  test.beforeEach(async ({ page }) => {
    await seedRecentFiles(page, [...MOCK_RECENT_FILES]);
  });

  test('shows recent file items', async ({ page }) => {
    await gotoViewer(page);
    const items = page.locator(tid('recent-file-item'));
    await expect(items).toHaveCount(MOCK_RECENT_FILES.length);
  });

  test('first recent file shows correct filename', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('recent-file-item')).first()).toContainText(
      MOCK_RECENT_FILE_NAME,
    );
  });

  test('clear-recent button is visible', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-clear-recent-btn'))).toBeVisible();
  });

  test('clearing recent files shows empty state', async ({ page }) => {
    await gotoViewer(page);
    await page.locator(tid('welcome-clear-recent-btn')).click();
    await expect(page.locator(tid('welcome-empty-state'))).toBeVisible();
    await expect(page.locator(tid('recent-file-item'))).toHaveCount(0);
  });

  test('remove button on individual file works', async ({ page }) => {
    await gotoViewer(page);
    const initialCount = await page.locator(tid('recent-file-item')).count();
    // Hover to reveal the remove button on the first item
    const firstItem = page.locator(tid('recent-file-item')).first();
    await firstItem.hover();
    await firstItem.locator(tid('recent-file-remove-btn')).click();
    await expect(page.locator(tid('recent-file-item'))).toHaveCount(initialCount - 1);
  });
});

// ---------------------------------------------------------------------------
// App shell — always visible
// ---------------------------------------------------------------------------

test.describe('app shell', () => {
  test('viewer-empty-state wraps welcome screen when no doc', async ({ page }) => {
    await gotoViewer(page);
    const wrapper = page.locator(tid('viewer-empty-state'));
    await expect(wrapper).toBeVisible();
    await expect(wrapper.locator(tid('welcome-screen'))).toBeVisible();
  });

  test('page title contains PDFluent', async ({ page }) => {
    await gotoViewer(page);
    await expect(page).toHaveTitle(/PDFluent/i);
  });
});
