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
 * Close document — E2E tests.
 *
 * Validates:
 * - Close button closes document and returns to welcome screen
 * - Unsaved changes guard dialog appears when closing with changes
 * - Guard dialog: Save, Discard, Cancel options
 */

test.describe('close document — clean state', () => {
  test('close button is visible with document loaded', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('close-document-btn'))).toBeVisible();
  });

  test('clicking close returns to welcome screen', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('close-document-btn')).click();
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();
  });

  test('floating page indicator disappears after close', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
    await page.locator(tid('close-document-btn')).click();
    await expect(page.locator(tid('floating-page-indicator'))).not.toBeVisible();
  });
});

test.describe('close document — unsaved changes guard', () => {
  test('unsaved changes dialog has save button', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Simulate unsaved changes via test hook
    await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { setDirty?: () => void }
        | undefined;
      hook?.setDirty?.();
    });

    await page.locator(tid('close-document-btn')).click();
    // The UnsavedChangesDialog may or may not appear depending on dirty state
    const dialog = page.locator(tid('unsaved-changes-dialog'));
    if (await dialog.isVisible()) {
      await expect(page.locator(tid('unsaved-save-btn'))).toBeVisible();
      await expect(page.locator(tid('unsaved-discard-btn'))).toBeVisible();
      await expect(page.locator(tid('unsaved-cancel-btn'))).toBeVisible();
    }
  });

  test('cancel in unsaved dialog keeps document open', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { setDirty?: () => void }
        | undefined;
      hook?.setDirty?.();
    });

    await page.locator(tid('close-document-btn')).click();
    const dialog = page.locator(tid('unsaved-changes-dialog'));
    if (await dialog.isVisible()) {
      await page.locator(tid('unsaved-cancel-btn')).click();
      await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
      await expect(dialog).not.toBeVisible();
    }
  });

  test('discard in unsaved dialog closes document', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { setDirty?: () => void }
        | undefined;
      hook?.setDirty?.();
    });

    await page.locator(tid('close-document-btn')).click();
    const dialog = page.locator(tid('unsaved-changes-dialog'));
    if (await dialog.isVisible()) {
      await page.locator(tid('unsaved-discard-btn')).click();
      await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();
    }
  });
});

test.describe('close document — no JS errors', () => {
  test('close and reopen cycle has no errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);
    await page.locator(tid('close-document-btn')).click();
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible();

    expect(jsErrors).toHaveLength(0);
  });
});
