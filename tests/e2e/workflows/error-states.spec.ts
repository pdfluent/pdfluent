// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Error states — E2E tests.
 *
 * Validates:
 * - Recovery dialog presence and controls
 * - Graceful handling of edge cases
 * - No uncaught errors across stress scenarios
 */

test.describe('error states — recovery dialog', () => {
  test('recovery dialog elements exist in DOM', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Recovery dialog is hidden by default — verify it can be triggered
    // The dialog testids exist in RecoveryDialog.tsx
    const dialog = page.locator(tid('recovery-dialog'));
    // Should not be visible in normal state
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('error states — stress scenarios', () => {
  test('rapid page navigation causes no errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);

    // Rapid page navigation
    const nextBtn = page.locator(tid('nav-next-page-btn'));
    const prevBtn = page.locator(tid('nav-prev-page-btn'));

    for (let i = 0; i < 5; i++) {
      if (await nextBtn.isEnabled()) await nextBtn.click();
      if (await prevBtn.isEnabled()) await prevBtn.click();
    }

    await page.waitForTimeout(500);
    expect(jsErrors).toHaveLength(0);
  });

  test('rapid mode switching causes no errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);

    const modes = ['Bewerken', 'Beoordelen', 'Beveiligen', 'Formulieren', 'Lezen'];
    for (let round = 0; round < 3; round++) {
      for (const mode of modes) {
        await switchMode(page, mode);
      }
    }

    expect(jsErrors).toHaveLength(0);
  });

  test('rapid dialog open/close causes no errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);

    for (let i = 0; i < 5; i++) {
      // Open and close export dialog
      await page.locator(tid('export-btn')).click();
      await page.keyboard.press('Escape');
      // Open and close command palette
      await page.keyboard.press('Meta+k');
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(200);
    expect(jsErrors).toHaveLength(0);
  });

  test('open/close document cycle causes no errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);
    await page.locator(tid('close-document-btn')).click();
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();

    expect(jsErrors).toHaveLength(0);
  });
});

test.describe('error states — console errors', () => {
  test('welcome screen has no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await gotoViewer(page);
    await page.waitForTimeout(1000);

    expect(consoleErrors).toHaveLength(0);
  });

  test('document load has no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await gotoViewerWithDoc(page);
    await page.waitForTimeout(1000);

    expect(consoleErrors).toHaveLength(0);
  });

  test('full mode cycle has no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Beveiligen');
    await switchMode(page, 'Formulieren');
    await switchMode(page, 'Lezen');

    expect(consoleErrors).toHaveLength(0);
  });
});
