// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

/**
 * Tests for the Forms mode and Redaction/OCR panels.
 * MockFormEngine returns no form fields by default, so these tests
 * verify the empty state and panel structure.
 */

// ---------------------------------------------------------------------------
// Forms mode
// ---------------------------------------------------------------------------

test.describe('forms mode — panel structure', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Formulieren');
  });

  test('forms-completion-summary is visible', async ({ page }) => {
    await expect(page.locator(tid('forms-completion-summary'))).toBeVisible();
  });

  test('no form field items when doc has no fields', async ({ page }) => {
    // MockFormEngine returns no fields
    await expect(page.locator(tid('forms-field-item'))).toHaveCount(0);
  });

  test('form submit button is visible', async ({ page }) => {
    await expect(page.locator(tid('form-submit-btn'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Redaction panel
// ---------------------------------------------------------------------------

test.describe('redaction panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beveiligen');
  });

  test('redaction-panel is visible in protect mode', async ({ page }) => {
    await expect(page.locator(tid('redaction-panel'))).toBeVisible();
  });

  test('apply-redactions button is visible', async ({ page }) => {
    await expect(page.locator(tid('apply-redactions-btn'))).toBeVisible();
  });

  test('no redaction items when no redactions added', async ({ page }) => {
    await expect(page.locator(tid('redaction-list-item'))).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// OCR panel
// ---------------------------------------------------------------------------

test.describe('OCR panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    // OCR panel appears in the right context panel when in edit mode
    await switchMode(page, 'Bewerken');
  });

  test('ocr-language-select is visible', async ({ page }) => {
    await expect(page.locator(tid('ocr-language-select'))).toBeVisible();
  });

  test('ocr-scope-select is visible', async ({ page }) => {
    await expect(page.locator(tid('ocr-scope-select'))).toBeVisible();
  });

  test('run-ocr-btn is visible', async ({ page }) => {
    await expect(page.locator(tid('run-ocr-btn'))).toBeVisible();
  });

  test('ocr-language-select has at least one option', async ({ page }) => {
    const select = page.locator(tid('ocr-language-select'));
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
  });

  test('ocr-preprocess-select is visible', async ({ page }) => {
    await expect(page.locator(tid('ocr-preprocess-select'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Left nav — fields panel
// ---------------------------------------------------------------------------

test.describe('left nav — fields panel', () => {
  test('clicking fields panel tab shows panel when doc loaded', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // The fields tab has aria-label "Formuliervelden"
    await page.getByRole('button', { name: 'Formuliervelden' }).click();
    // Panel should expand — content shows "Geen formuliervelden gevonden"
    await expect(page.getByText('Geen formuliervelden gevonden')).toBeVisible();
  });

  test('clicking bookmarks tab shows empty bookmarks state', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await page.getByRole('button', { name: 'Bladwijzers' }).click();
    await expect(page.getByText('Geen bladwijzers beschikbaar')).toBeVisible();
  });
});
