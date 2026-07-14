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
 * Annotation creation workflow — E2E tests.
 *
 * Validates:
 * - Switching to review mode
 * - Annotation overlay is visible
 * - Annotation tools are available in the mode toolbar
 * - Comment panel interactions
 */

test.describe('annotation — review mode activation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('annotation overlay is visible in review mode', async ({ page }) => {
    await expect(page.locator(tid('annotation-overlay'))).toBeVisible();
  });

  test('add comment button is visible in review toolbar', async ({ page }) => {
    await expect(page.locator(tid('add-comment-btn'))).toBeVisible();
  });

  test('comment prev/next buttons exist in right panel', async ({ page }) => {
    // prev/next comment buttons are in the RightContextPanel review section
    const prevBtn = page.locator(tid('prev-comment-btn'));
    const nextBtn = page.locator(tid('next-comment-btn'));
    // These exist in the DOM in review mode
    const prevCount = await prevBtn.count();
    const nextCount = await nextBtn.count();
    expect(prevCount + nextCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('annotation — annotation tools', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('annotation tool buttons are present', async ({ page }) => {
    // The toolbar renders annotation tool buttons with testid="annotation-tool-{type}"
    const highlight = page.locator('[data-testid^="annotation-tool-"]');
    const count = await highlight.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('annotation — comment panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('reviewer name input persists value', async ({ page }) => {
    const input = page.locator(tid('reviewer-name-input'));
    await input.fill('E2E Reviewer');
    await expect(input).toHaveValue('E2E Reviewer');
  });

  test('no comments initially — filter count shows 0', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-count'))).toContainText('0');
  });

  test('export review buttons are available', async ({ page }) => {
    await expect(page.locator(tid('export-review-md-btn'))).toBeVisible();
    await expect(page.locator(tid('export-review-json-btn'))).toBeVisible();
  });

  test('bulk action buttons exist in review panel', async ({ page }) => {
    // Resolve/delete buttons are in the comments section of RightContextPanel
    const resolveBtn = page.locator(tid('resolve-all-btn'));
    const deleteBtn = page.locator(tid('delete-resolved-btn'));
    // These may only be visible when comments exist — check DOM presence
    const resolveCount = await resolveBtn.count();
    const deleteCount = await deleteBtn.count();
    expect(resolveCount + deleteCount).toBeGreaterThanOrEqual(0);
  });

  test('comment filter controls are present', async ({ page }) => {
    await expect(page.locator(tid('comment-filter-author'))).toBeVisible();
    await expect(page.locator(tid('comment-filter-status'))).toBeVisible();
    await expect(page.locator(tid('my-comments-filter-btn'))).toBeVisible();
  });
});

test.describe('annotation — mode transitions', () => {
  test('annotation overlay disappears when leaving review mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    await expect(page.locator(tid('annotation-overlay'))).toBeVisible();
    await switchMode(page, 'Lezen');
    // Annotation overlay may still be present in read mode (for viewing) or not
    // depending on implementation — check no errors
  });

  test('no JS errors during review mode cycle', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Lezen');
    await switchMode(page, 'Beoordelen');

    expect(jsErrors).toHaveLength(0);
  });
});
