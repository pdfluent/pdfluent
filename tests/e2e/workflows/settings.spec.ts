// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { getLocalStorage, ZOOM_KEY } from '../helpers/bootstrap';

/**
 * NOTE: SettingsPanel is built but not yet wired into ViewerApp.
 * This spec tests the keyboard-driven dialogs that ARE wired:
 *   • ShortcutSheet (Ctrl/Cmd + ?)
 *   • CommandPalette (Ctrl/Cmd + K)
 *
 * It also covers persistence of viewer state (zoom) across the session.
 */

// ---------------------------------------------------------------------------
// Shortcut sheet
// ---------------------------------------------------------------------------

test.describe('shortcut sheet', () => {
  test('opens with Ctrl+? and shows shortcut rows', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+?');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    const rows = page.locator(tid('shortcut-row'));
    await expect(rows.first()).toBeVisible();
  });

  test('close button dismisses the sheet', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+?');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    await page.locator(tid('shortcut-sheet-close')).click();
    await expect(page.locator(tid('shortcut-sheet'))).not.toBeVisible();
  });

  test('Ctrl+? toggles sheet closed', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+?');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    await page.keyboard.press('Control+?');
    await expect(page.locator(tid('shortcut-sheet'))).not.toBeVisible();
  });

  test('shortcut sheet has at least 5 rows', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+?');
    await page.locator(tid('shortcut-sheet')).waitFor({ state: 'visible' });
    const count = await page.locator(tid('shortcut-row')).count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

test.describe('command palette', () => {
  test('opens with Ctrl+K', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+k');
    // The CommandPalette is a modal/overlay — check for its dialog element
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Zoom persistence
// ---------------------------------------------------------------------------

test.describe('zoom persistence', () => {
  test('zoom reset button shows initial 100%', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('100%');
  });

  test('zoom-in stores updated value in localStorage', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.getByTitle('Zoom in').click();
    // Wait for the display to update
    await expect(page.locator(tid('zoom-reset-btn'))).not.toContainText('100%');
    const stored = await getLocalStorage(page, ZOOM_KEY);
    expect(stored).not.toBeNull();
    const parsed = parseFloat(stored!);
    expect(parsed).toBeGreaterThan(1.0);
  });

  test('zoom fit-width button is clickable', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('zoom-fit-width-btn')).click();
    // After fit-width, zoom should be 1.0 (100%)
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('100%');
  });
});
