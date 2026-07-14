// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Full Visual Regression Screenshots — Visual QA Layer 3
 *
 * Pixel-level baseline screenshots for all critical UI states.
 * Any visual change is flagged via toHaveScreenshot().
 * Update baselines with: npm run test:visual:update
 */

import { test, expect } from '@playwright/test';
import {
  gotoViewer,
  gotoViewerWithDoc,
  switchMode,
  openExportDialog,
  openCommandPalette,
} from '../helpers/app';
import { tid } from '../helpers/selectors';
import { seedRecentFiles } from '../helpers/bootstrap';

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.01, animations: 'disabled' as const };

// ---------------------------------------------------------------------------
// Welcome screen states
// ---------------------------------------------------------------------------

test.describe('welcome screen screenshots', () => {
  test('welcome screen — empty', async ({ page }) => {
    await gotoViewer(page);
    await expect(page).toHaveScreenshot('welcome-empty.png', SCREENSHOT_OPTS);
  });

  test('welcome screen — with recent files', async ({ page }) => {
    await seedRecentFiles(page, ['/Users/test/document1.pdf', '/Users/test/report.pdf', '/Users/test/invoice.pdf']);
    await gotoViewer(page);
    await expect(page).toHaveScreenshot('welcome-recent.png', SCREENSHOT_OPTS);
  });
});

// ---------------------------------------------------------------------------
// Document mode states
// ---------------------------------------------------------------------------

test.describe('document mode screenshots', () => {
  test('document — Read mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page).toHaveScreenshot('doc-read.png', SCREENSHOT_OPTS);
  });

  test('document — Edit mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page).toHaveScreenshot('doc-edit.png', SCREENSHOT_OPTS);
  });

  test('document — Review mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    await expect(page).toHaveScreenshot('doc-review.png', SCREENSHOT_OPTS);
  });

  test('document — Organize mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Indelen');
    await expect(page).toHaveScreenshot('doc-organize.png', SCREENSHOT_OPTS);
  });

  test('document — Forms mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Formulieren');
    await expect(page).toHaveScreenshot('doc-forms.png', SCREENSHOT_OPTS);
  });

  test('document — Protect mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beveiligen');
    await expect(page).toHaveScreenshot('doc-protect.png', SCREENSHOT_OPTS);
  });

  test('document — Convert mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Converteren');
    await expect(page).toHaveScreenshot('doc-convert.png', SCREENSHOT_OPTS);
  });
});

// ---------------------------------------------------------------------------
// Dialog states
// ---------------------------------------------------------------------------

test.describe('dialog screenshots', () => {
  test('export dialog', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await openExportDialog(page);
    await expect(page).toHaveScreenshot('dialog-export.png', SCREENSHOT_OPTS);
  });

  test('command palette', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await openCommandPalette(page);
    await expect(page).toHaveScreenshot('dialog-command-palette.png', SCREENSHOT_OPTS);
  });

  test('shortcut sheet', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.keyboard.down('Meta');
    await page.keyboard.press('?');
    await page.keyboard.up('Meta');
    await page.locator(tid('shortcut-sheet')).waitFor({ state: 'visible', timeout: 3_000 });
    await expect(page).toHaveScreenshot('dialog-shortcut-sheet.png', SCREENSHOT_OPTS);
  });
});

// ---------------------------------------------------------------------------
// Navigation states
// ---------------------------------------------------------------------------

test.describe('navigation screenshots', () => {
  test('page 2 navigation', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Navigate to page 2 via the floating indicator
    await page.locator(tid('floating-page-indicator')).click();
    // The go-to-page dialog should appear — type 2 and press Enter
    const input = page.getByRole('spinbutton').last();
    await input.fill('2');
    await input.press('Enter');
    // Wait for page indicator to show "2 / 3"
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('2');
    await expect(page).toHaveScreenshot('doc-page-2.png', SCREENSHOT_OPTS);
  });
});

// ---------------------------------------------------------------------------
// Zoom states
// ---------------------------------------------------------------------------

test.describe('zoom screenshots', () => {
  test('zoom 50%', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Click zoom-out button twice (default is 100%, each click -25%)
    const zoomOut = page.locator('button[title="Zoom out"]');
    await zoomOut.click();
    await zoomOut.click();
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('50%');
    await expect(page).toHaveScreenshot('doc-zoom-50.png', SCREENSHOT_OPTS);
  });

  test('zoom 200%', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Click zoom-in button 4 times (default 100%, each click +25%)
    const zoomIn = page.locator('button[title="Zoom in"]');
    await zoomIn.click();
    await zoomIn.click();
    await zoomIn.click();
    await zoomIn.click();
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('200%');
    await expect(page).toHaveScreenshot('doc-zoom-200.png', SCREENSHOT_OPTS);
  });
});
