// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';

// Any ArrayBuffer works — MockDocumentEngine ignores contents and creates a 3-page mock doc.
const DUMMY_PDF = {
  name: 'test.pdf',
  mimeType: 'application/pdf' as const,
  buffer: Buffer.from('%PDF-1.4 test fixture'),
};

test.describe('v2 viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?v2');
  });

  // ---------------------------------------------------------------------------
  // Engine init + empty state
  // ---------------------------------------------------------------------------

  test('engine initialises and shows empty state', async ({ page }) => {
    await expect(page.getByTestId('viewer-empty-state')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
  });

  test('page nav controls are hidden before a document is open', async ({ page }) => {
    await expect(page.getByTestId('viewer-empty-state')).toBeVisible();
    await expect(page.locator('input[type=number]').first()).not.toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Open document
  // ---------------------------------------------------------------------------

  test('opens a PDF via file input and renders page 1', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);

    // Page 1 image must appear (blob URL rendered → img in DOM)
    await expect(page.getByTestId('rendered-page')).toBeAttached({ timeout: 5_000 });
    await expect(page.getByTestId('rendered-page')).toHaveAttribute('alt', 'Page 1');

    // Counter: 1 / 3  (MockDocumentEngine always creates 3 pages)
    await expect(page.locator('input[type=number]').first()).toHaveValue('1');
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Page navigation
  // ---------------------------------------------------------------------------

  test('next button advances to page 2', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByTestId('rendered-page')).toBeAttached({ timeout: 5_000 });

    await page.getByRole('button', { name: '›' }).click();

    await expect(page.locator('input[type=number]').first()).toHaveValue('2');
    await expect(page.getByTestId('rendered-page')).toHaveAttribute('alt', 'Page 2');
  });

  test('back button is disabled on first page, next disabled on last page', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole('button', { name: '‹' })).toBeDisabled();

    // Navigate to last page
    await page.getByRole('button', { name: '›' }).click();
    await page.getByRole('button', { name: '›' }).click();

    await expect(page.getByRole('button', { name: '›' })).toBeDisabled();
  });

  test('page number input jumps to typed page', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.locator('input[type=number]').first()).toBeVisible({ timeout: 5_000 });

    await page.locator('input[type=number]').first().fill('3');
    await page.locator('input[type=number]').first().press('Tab');

    await expect(page.locator('input[type=number]').first()).toHaveValue('3');
    await expect(page.getByTestId('rendered-page')).toHaveAttribute('alt', 'Page 3');
  });

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------

  test('zoom starts at 100% and steps ±25% per click', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('100%').first()).toBeVisible();

    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('125%').first()).toBeVisible();

    await page.getByRole('button', { name: '−' }).click();
    await expect(page.getByText('100%').first()).toBeVisible();

    await page.getByRole('button', { name: '−' }).click();
    await expect(page.getByText('75%').first()).toBeVisible();
  });

  test('zoom − button is disabled at 25%', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Click down to 25%
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '−' }).click();
    }
    await expect(page.getByText('25%').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '−' })).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Thumbnail strip
  // ---------------------------------------------------------------------------

  test('thumbnail strip shows buttons for all 3 pages', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId(`thumbnail-${i}`)).toBeVisible();
    }
  });

  test('clicking a thumbnail navigates to that page', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('thumbnail-2').click();

    await expect(page.locator('input[type=number]').first()).toHaveValue('3');
    await expect(page.getByTestId('rendered-page')).toHaveAttribute('alt', 'Page 3');
  });

  test('active thumbnail is highlighted', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles(DUMMY_PDF);
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Page 0 is active by default — its button has the blue border colour
    const thumb0 = page.getByTestId('thumbnail-0');
    await expect(thumb0).toHaveCSS('border-color', 'rgb(37, 99, 235)'); // #2563eb

    // Navigate to page 2 → thumbnail-1 becomes active
    await page.getByRole('button', { name: '›' }).click();
    await expect(page.getByTestId('thumbnail-1')).toHaveCSS('border-color', 'rgb(37, 99, 235)');
    await expect(thumb0).not.toHaveCSS('border-color', 'rgb(37, 99, 235)');
  });
});
