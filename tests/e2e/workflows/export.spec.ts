// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, gotoViewer } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Export workflow — E2E tests.
 *
 * Validates:
 * - Export dialog opens via button
 * - Format selection works
 * - Dialog closes with Escape and cancel button
 * - Export button is disabled in browser mode (no Tauri)
 */

test.describe('export dialog — opening', () => {
  test('export button is visible with document loaded', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('export-btn'))).toBeVisible();
  });

  test('export button is disabled without document', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('export-btn'))).toBeDisabled();
  });

  test('clicking export button opens export dialog', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
    await expect(page.locator(tid('export-dialog'))).toBeVisible();
  });
});

test.describe('export dialog — format selection', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
  });

  test('format select is visible', async ({ page }) => {
    await expect(page.locator(tid('export-format-select'))).toBeVisible();
  });

  test('default format is pdf', async ({ page }) => {
    const select = page.locator(tid('export-format-select'));
    await expect(select).toHaveValue('pdf');
  });

  test('all format options are available', async ({ page }) => {
    const select = page.locator(tid('export-format-select'));
    const options = select.locator('option');
    const values = await options.evaluateAll(
      (els) => els.map((el) => (el as HTMLOptionElement).value),
    );
    expect(values).toContain('pdf');
    expect(values).toContain('compressed_pdf');
    expect(values).toContain('png');
    expect(values).toContain('jpeg');
    expect(values).toContain('docx');
    expect(values).toContain('xlsx');
    expect(values).toContain('pptx');
  });

  test('selecting image format shows page range options', async ({ page }) => {
    const select = page.locator(tid('export-format-select'));
    await select.selectOption('png');
    // Page range radio buttons should appear
    const radios = page.locator('input[name="export-page-range"]');
    await expect(radios.first()).toBeVisible();
  });

  test('selecting non-image format hides page range options', async ({ page }) => {
    const select = page.locator(tid('export-format-select'));
    // First select image to show range, then switch back
    await select.selectOption('png');
    await select.selectOption('docx');
    const radios = page.locator('input[name="export-page-range"]');
    await expect(radios).toHaveCount(0);
  });
});

test.describe('export dialog — closing', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
  });

  test('Escape closes export dialog', async ({ page }) => {
    await expect(page.locator(tid('export-dialog'))).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tid('export-dialog'))).not.toBeVisible();
  });

  test('cancel button closes export dialog', async ({ page }) => {
    await page.locator(tid('export-cancel-btn')).click();
    await expect(page.locator(tid('export-dialog'))).not.toBeVisible();
  });

  test('close button closes export dialog', async ({ page }) => {
    await page.locator(tid('export-close-btn')).click();
    await expect(page.locator(tid('export-dialog'))).not.toBeVisible();
  });

  test('clicking backdrop closes export dialog', async ({ page }) => {
    // The backdrop is the first fixed overlay
    await page.locator('.fixed.inset-0.bg-black\\/30').click({ force: true });
    await expect(page.locator(tid('export-dialog'))).not.toBeVisible();
  });
});

test.describe('export dialog — export button', () => {
  test('export button is disabled in browser mode (no Tauri)', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('export-btn')).click();
    // In Playwright (headless Chromium), there's no __TAURI__ — button should be disabled
    await expect(page.locator(tid('export-submit-btn'))).toBeDisabled();
  });
});
