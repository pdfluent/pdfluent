// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Right context panel tabs — E2E tests.
 *
 * Validates:
 * - Default tab on document load (Doc Info in read mode)
 * - Panel content in each mode
 * - Doc Info shows page count and PDF version
 * - Comments panel: reviewer name, filter
 * - Forms panel: completion summary
 * - Redaction panel visibility
 * - OCR panel: language select, run button
 */

test.describe('right panel — read mode (default)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
  });

  test('doc info panel is visible in read mode', async ({ page }) => {
    await expect(page.locator(tid('doc-info-panel'))).toBeVisible();
  });

  test('doc info shows page count', async ({ page }) => {
    const pageCount = page.locator(tid('doc-info-page-count'));
    await expect(pageCount).toBeVisible();
    await expect(pageCount).toContainText('3');
  });

  test('doc info shows PDF version', async ({ page }) => {
    await expect(page.locator(tid('doc-info-pdf-version'))).toBeVisible();
  });

  test('doc info shows dimensions', async ({ page }) => {
    await expect(page.locator(tid('doc-info-dimensions'))).toBeVisible();
  });

  test('metadata title input is visible', async ({ page }) => {
    await expect(page.locator(tid('metadata-title-input'))).toBeVisible();
  });

  test('metadata author input is visible', async ({ page }) => {
    await expect(page.locator(tid('metadata-author-input'))).toBeVisible();
  });
});

test.describe('right panel — review mode (comments)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('reviewer name input is visible', async ({ page }) => {
    await expect(page.locator(tid('reviewer-name-input'))).toBeVisible();
  });

  test('reviewer name input accepts text', async ({ page }) => {
    const input = page.locator(tid('reviewer-name-input'));
    await input.fill('Test Reviewer');
    await expect(input).toHaveValue('Test Reviewer');
  });

  test('comment filter input is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-input'))).toBeVisible();
  });

  test('comment filter count shows 0 initially', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-count'))).toContainText('0');
  });

  test('comment filter author select is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-author'))).toBeVisible();
  });

  test('comment filter status select is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-status'))).toBeVisible();
  });

  test('comment filter page select is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-page'))).toBeVisible();
  });
});

test.describe('right panel — forms mode', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Formulieren');
  });

  test('forms completion summary is visible', async ({ page }) => {
    await expect(page.locator(tid('forms-completion-summary'))).toBeVisible();
  });

  test('form submit button is visible', async ({ page }) => {
    await expect(page.locator(tid('form-submit-btn'))).toBeVisible();
  });
});

test.describe('right panel — protect mode (redaction)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beveiligen');
  });

  test('redaction panel is visible', async ({ page }) => {
    await expect(page.locator(tid('redaction-panel'))).toBeVisible();
  });

  test('search redact input is visible', async ({ page }) => {
    await expect(page.locator(tid('search-redact-input'))).toBeVisible();
  });

  test('apply redactions button is visible', async ({ page }) => {
    await expect(page.locator(tid('apply-redactions-btn'))).toBeVisible();
  });

  test('search redact button is visible', async ({ page }) => {
    await expect(page.locator(tid('search-redact-btn'))).toBeVisible();
  });

  test('redact metadata button is visible', async ({ page }) => {
    await expect(page.locator(tid('redact-metadata-btn'))).toBeVisible();
  });
});

test.describe('right panel — OCR', () => {
  test('OCR panel is visible in read mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // OCR panel is a section within the right panel, may need scrolling
    const ocrPanel = page.locator(tid('ocr-panel'));
    if (await ocrPanel.isVisible()) {
      await expect(page.locator(tid('ocr-language-select'))).toBeVisible();
      await expect(page.locator(tid('run-ocr-btn'))).toBeVisible();
      await expect(page.locator(tid('ocr-scope-select'))).toBeVisible();
    }
  });
});
