// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { getLocalStorage, seedLocalStorage, ZOOM_KEY, NAV_PANEL_KEY } from '../helpers/bootstrap';

/**
 * Recovery, persistence and navigation state tests.
 */

// ---------------------------------------------------------------------------
// Zoom persistence
// ---------------------------------------------------------------------------

test.describe('zoom persistence', () => {
  test('zoom is stored in localStorage when changed', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Zoom in by clicking the + button
    await page.getByTitle('Zoom in').click();
    const stored = await getLocalStorage(page, ZOOM_KEY);
    expect(stored).not.toBeNull();
    expect(parseFloat(stored!)).toBeGreaterThan(1.0);
  });

  test('stored zoom is restored on reload', async ({ page }) => {
    await seedLocalStorage(page, ZOOM_KEY, '1.5');
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('150%');
  });
});

// ---------------------------------------------------------------------------
// Nav panel persistence
// ---------------------------------------------------------------------------

test.describe('nav panel persistence', () => {
  test('opening thumbnails panel persists to localStorage', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Thumbnails panel is the default — it may already be open
    // Click thumbnails button to ensure it's active
    await page.getByRole('button', { name: 'Miniaturen' }).click();
    const stored = await getLocalStorage(page, NAV_PANEL_KEY);
    expect(stored).toBe('thumbnails');
  });

  test('switching to search panel persists panel selection', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.getByRole('button', { name: 'Zoeken' }).click();
    const stored = await getLocalStorage(page, NAV_PANEL_KEY);
    expect(stored).toBe('search');
  });
});

// ---------------------------------------------------------------------------
// Page navigation
// ---------------------------------------------------------------------------

test.describe('page navigation', () => {
  test('page indicator starts at page 1', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('1 /');
  });

  test('nav-prev-page-btn is disabled on first page', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('nav-prev-page-btn'))).toBeDisabled();
  });

  test('nav-next-page-btn is enabled on first page', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('nav-next-page-btn'))).toBeEnabled();
  });

  test('clicking next page updates indicator', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('nav-next-page-btn')).click();
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('2 /');
  });

  test('nav-go-to-page-input shows current page', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('nav-go-to-page-input'))).toHaveValue('1');
  });

  test('typing in nav-go-to-page-input navigates to that page', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const input = page.locator(tid('nav-go-to-page-input'));
    await input.fill('2');
    await input.press('Tab');
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('2 /');
  });
});

// ---------------------------------------------------------------------------
// Recovery dialog (visible only when recovery data is present)
// ---------------------------------------------------------------------------

test.describe('recovery dialog availability', () => {
  test('recovery-dialog is absent by default', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('recovery-dialog'))).not.toBeVisible();
  });

  test('recovery dialog testids exist in source', () => {
    const { readFileSync } = require('node:fs');
    const { join, dirname } = require('node:path');
    const { fileURLToPath } = require('node:url');
    const src: string = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../src/viewer/components/RecoveryDialog.tsx'),
      'utf8',
    );
    expect(src).toContain('data-testid="recovery-dialog"');
    expect(src).toContain('data-testid="recovery-recover-btn"');
    expect(src).toContain('data-testid="recovery-discard-btn"');
  });
});
