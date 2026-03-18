// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { seedRecentFiles } from '../helpers/bootstrap';
import { MOCK_RECENT_FILES, MOCK_DOC } from '../mocks/documentState';

/**
 * Release-grade workflow matrix.
 *
 * These are the must-pass tests before any release cut.
 * Each test covers one critical user-facing flow end-to-end.
 */

test.describe('release matrix', () => {
  // 1. App shell
  test('1 — app shell: welcome screen renders', async ({ page }) => {
    await gotoViewer(page);
    await expect(page.locator(tid('welcome-screen'))).toBeVisible();
    await expect(page.locator(tid('welcome-open-btn'))).toBeVisible();
  });

  // 2. Recent files flow
  test('2 — recent files: seeded entries visible', async ({ page }) => {
    await seedRecentFiles(page, [...MOCK_RECENT_FILES]);
    await gotoViewer(page);
    await expect(page.locator(tid('recent-file-item'))).toHaveCount(MOCK_RECENT_FILES.length);
  });

  // 3. Mock document load
  test('3 — document load: mock doc opens and shows controls', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toContainText(
      `1 / ${MOCK_DOC.pageCount}`,
    );
    await expect(page.locator(tid('zoom-reset-btn'))).toBeVisible();
    await expect(page.locator(tid('close-document-btn'))).toBeVisible();
  });

  // 4. Page navigation
  test('4 — page navigation: next/prev works', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.locator(tid('nav-next-page-btn')).click();
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('2 /');
    await page.locator(tid('nav-prev-page-btn')).click();
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('1 /');
  });

  // 5. Review panel filters
  test('5 — review panel: comment filter UI responsive', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    const filter = page.locator(tid('comment-filter-input'));
    await expect(filter).toBeVisible();
    await filter.fill('searchterm');
    await expect(filter).toHaveValue('searchterm');
  });

  // 6. Forms panel
  test('6 — forms panel: renders without error', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Formulieren');
    await expect(page.locator(tid('forms-completion-summary'))).toBeVisible();
  });

  // 7. Redaction panel
  test('7 — redaction panel: renders in protect mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beveiligen');
    await expect(page.locator(tid('redaction-panel'))).toBeVisible();
    await expect(page.locator(tid('apply-redactions-btn'))).toBeVisible();
  });

  // 8. OCR panel
  test('8 — OCR panel: language select is functional', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('ocr-language-select'))).toBeVisible();
    await expect(page.locator(tid('run-ocr-btn'))).toBeVisible();
  });

  // 9. Shortcut sheet
  test('9 — shortcut sheet: opens and closes', async ({ page }) => {
    await gotoViewer(page);
    await page.keyboard.press('Control+?');
    await expect(page.locator(tid('shortcut-sheet'))).toBeVisible();
    await page.locator(tid('shortcut-sheet-close')).click();
    await expect(page.locator(tid('shortcut-sheet'))).not.toBeVisible();
  });

  // 10. No console errors baseline
  test('10 — no fatal console errors on full session', async ({ page }) => {
    const fatalErrors: string[] = [];
    page.on('pageerror', (err) => {
      const msg = err.message;
      if (msg.includes('tauri') || msg.includes('invoke') || msg.includes('__TAURI__')) return;
      fatalErrors.push(msg);
    });

    await gotoViewer(page);
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Formulieren');
    await switchMode(page, 'Bewerken');
    await page.locator(tid('close-document-btn')).click();

    expect(fatalErrors).toHaveLength(0);
  });
});
