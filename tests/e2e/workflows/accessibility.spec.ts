// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, gotoViewer, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Accessibility — E2E tests.
 *
 * Validates:
 * - ARIA labels on buttons
 * - Keyboard-only navigation
 * - Screen reader landmarks
 * - Dialog roles and labels
 */

test.describe('accessibility — ARIA labels', () => {
  test('undo button has aria-label', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('undo-btn'))).toHaveAttribute('aria-label', 'Undo');
  });

  test('redo button has aria-label', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('redo-btn'))).toHaveAttribute('aria-label', 'Redo');
  });

  test('search button has aria-label', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('search-btn'))).toHaveAttribute('aria-label', 'Search');
  });

  test('close document button has aria-label', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const closeBtn = page.locator(tid('close-document-btn'));
    const label = await closeBtn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });
});

test.describe('accessibility — dialog roles', () => {
  test('export dialog has role="dialog"', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
    const dialog = page.locator(tid('export-dialog'));
    await expect(dialog).toHaveAttribute('role', 'dialog');
  });

  test('export dialog has aria-labelledby', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
    const dialog = page.locator(tid('export-dialog'));
    await expect(dialog).toHaveAttribute('aria-labelledby', 'export-dialog-title');
  });

  test('command palette has role="dialog"', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.keyboard.press('Meta+k');
    const palette = page.locator(tid('command-palette'));
    await expect(palette).toHaveAttribute('role', 'dialog');
  });

  test('command palette has aria-label', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.keyboard.press('Meta+k');
    const palette = page.locator(tid('command-palette'));
    await expect(palette).toHaveAttribute('aria-label', 'Command palette');
  });
});

test.describe('accessibility — keyboard navigation', () => {
  test('tab key moves focus through toolbar buttons', async ({ page }) => {
    await gotoViewerWithDoc(page);

    // Focus the first interactive element
    await page.keyboard.press('Tab');
    // After several tabs, focus should move through interactive elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    // Check that focus is on an element (not lost)
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName.toLowerCase() : 'none';
    });
    expect(focused).not.toBe('none');
    expect(focused).not.toBe('body');
  });

  test('navigation input accepts keyboard input', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const pageInput = page.locator(tid('nav-go-to-page-input'));
    await pageInput.focus();
    await expect(pageInput).toBeFocused();
    await pageInput.fill('2');
    await expect(pageInput).toHaveValue('2');
  });
});

test.describe('accessibility — page title and structure', () => {
  test('page has a descriptive title', async ({ page }) => {
    await gotoViewer(page);
    await expect(page).toHaveTitle(/PDFluent/i);
  });

  test('mode buttons are accessible', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Mode buttons should be findable by role
    const readBtn = page.getByRole('button', { name: 'Lezen', exact: true });
    const editBtn = page.getByRole('button', { name: 'Bewerken', exact: true });
    const reviewBtn = page.getByRole('button', { name: 'Beoordelen', exact: true });

    await expect(readBtn).toBeVisible();
    await expect(editBtn).toBeVisible();
    await expect(reviewBtn).toBeVisible();
  });
});
