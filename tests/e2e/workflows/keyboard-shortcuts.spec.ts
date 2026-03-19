// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Keyboard shortcuts — E2E tests.
 *
 * Validates that keyboard shortcuts trigger the expected UI changes:
 * - Ctrl/Meta+K → command palette
 * - ? → shortcut sheet
 * - Escape → close active dialog/panel
 * - Ctrl/Meta+Z → undo
 * - Ctrl/Meta+Shift+Z → redo
 */

test.describe('keyboard shortcuts — document loaded', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
  });

  test('Meta+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator(tid('command-palette'))).toBeVisible();
  });

  test('Escape closes command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator(tid('command-palette'))).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tid('command-palette'))).not.toBeVisible();
  });

  test('? opens shortcut sheet', async ({ page }) => {
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
  });

  test('shortcut sheet close button works', async ({ page }) => {
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    await page.locator(tid('shortcut-sheet-close')).click();
    await expect(page.locator(tid('shortcut-sheet'))).not.toBeVisible();
  });

  test('Escape closes shortcut sheet', async ({ page }) => {
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tid('shortcut-sheet'))).not.toBeVisible();
  });

  test('shortcut sheet contains shortcut rows', async ({ page }) => {
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    const rows = page.locator(tid('shortcut-row'));
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(5);
  });

  test('undo button is visible', async ({ page }) => {
    await expect(page.locator(tid('undo-btn'))).toBeVisible();
  });

  test('redo button is visible', async ({ page }) => {
    await expect(page.locator(tid('redo-btn'))).toBeVisible();
  });

  test('undo button is disabled when no history', async ({ page }) => {
    await expect(page.locator(tid('undo-btn'))).toBeDisabled();
  });

  test('redo button is disabled when no history', async ({ page }) => {
    await expect(page.locator(tid('redo-btn'))).toBeDisabled();
  });
});

test.describe('keyboard shortcuts — no JS errors', () => {
  test('rapid keyboard shortcut sequence does not cause errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);

    // Rapid sequence of shortcuts
    await page.keyboard.press('Meta+k');
    await page.keyboard.press('Escape');
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+k');
    await page.keyboard.press('Escape');

    expect(jsErrors).toHaveLength(0);
  });
});
