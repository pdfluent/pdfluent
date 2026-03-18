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
 * Tests the review/comment workflow via RightContextPanel.
 * The right panel is visible in 'read', 'review', 'edit', 'forms', 'protect'
 * modes (default mode is 'read').
 */

test.describe('review panel — initial state', () => {
  test('right context panel is visible in read mode by default', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // doc-info-panel is the first section in RightContextPanel (read mode)
    await expect(page.locator(tid('doc-info-panel'))).toBeVisible();
  });

  test('doc-info shows page count', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const pageCount = page.locator(tid('doc-info-page-count'));
    await expect(pageCount).toBeVisible();
    await expect(pageCount).toContainText('3'); // MockDocumentEngine returns 3 pages
  });
});

test.describe('review mode — comment panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('reviewer name input is visible', async ({ page }) => {
    await expect(page.locator(tid('reviewer-name-input'))).toBeVisible();
  });

  test('comment filter input is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-input'))).toBeVisible();
  });

  test('comment filter count shows 0 initially', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-count'))).toBeVisible();
    await expect(page.locator(tid('comment-filter-count'))).toContainText('0');
  });

  test('reviewer name input accepts text', async ({ page }) => {
    const input = page.locator(tid('reviewer-name-input'));
    await input.fill('Jan de Tester');
    await expect(input).toHaveValue('Jan de Tester');
  });

  test('comment filter input accepts text', async ({ page }) => {
    const input = page.locator(tid('comment-filter-input'));
    await input.fill('test query');
    await expect(input).toHaveValue('test query');
  });

  test('export review MD button is visible', async ({ page }) => {
    await expect(page.locator(tid('export-review-md-btn'))).toBeVisible();
  });

  test('export review JSON button is visible', async ({ page }) => {
    await expect(page.locator(tid('export-review-json-btn'))).toBeVisible();
  });

  test('my-comments filter button is visible', async ({ page }) => {
    await expect(page.locator(tid('my-comments-filter-btn'))).toBeVisible();
  });

  test('comment-filter-author input is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-author'))).toBeVisible();
  });

  test('comment-filter-status select is visible', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-status'))).toBeVisible();
  });

  test('prev-comment and next-comment buttons are visible', async ({ page }) => {
    await expect(page.locator(tid('prev-comment-btn'))).toBeVisible();
    await expect(page.locator(tid('next-comment-btn'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Left nav — comment badge
// ---------------------------------------------------------------------------

test.describe('left nav — comments panel', () => {
  test('no comment badge when there are no annotations', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // MockPdfEngine has no annotations — badge should not appear
    await expect(page.locator(tid('comments-badge'))).not.toBeVisible();
  });

  test('thumbnail scroll container appears when doc loaded', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('thumbnail-scroll-container'))).toBeVisible();
  });
});
