// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Layout Integrity Tests — Visual QA Layer 2
 *
 * Validates rendering correctness, element sizing, containment and overlap
 * via bounding-box geometry. No pixel comparisons — deterministic and fast.
 */

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';
import {
  assertImageLoaded,
  assertMinimumSize,
  assertNoOverlap,
  assertContainedWithin,
  assertNoHorizontalScrollbar,
  getBoundingBoxOrFail,
} from '../helpers/layout';

// ---------------------------------------------------------------------------
// Rendered page image
// ---------------------------------------------------------------------------

test.describe('rendered page image', () => {
  test('page image loads successfully (no broken icon)', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await assertImageLoaded(page, tid('rendered-page'));
  });

  test('rendered page fills content area at default zoom', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // The page container is max-w-3xl (768px). The image should be at least
    // 200px wide to confirm it is not rendering as a tiny element.
    await assertMinimumSize(page, tid('rendered-page'), 200, 280);
  });

  test('page aspect ratio is approximately A4', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const box = await getBoundingBoxOrFail(page, tid('rendered-page'));
    const ratio = box.height / box.width;
    // A4 ratio = 842/595 ≈ 1.414.  Allow ±10%.
    expect(ratio).toBeGreaterThan(1.27);
    expect(ratio).toBeLessThan(1.56);
  });
});

// ---------------------------------------------------------------------------
// TopBar layout
// ---------------------------------------------------------------------------

test.describe('TopBar layout', () => {
  test('filename tab does not overlap Open PDF button', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // The filename is in the center tab; Open PDF is in the right section.
    // Use text-content locators since these elements lack unique testids.
    const fileTab = page.locator('.truncate').filter({ hasText: 'mock-test.pdf' });
    const openBtn = page.getByRole('button', { name: 'Open PDF' });
    await expect(fileTab).toBeVisible();
    await expect(openBtn).toBeVisible();

    const tabBox = await fileTab.boundingBox();
    const btnBox = await openBtn.boundingBox();
    expect(tabBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Tab right edge should be left of button left edge (no overlap)
    expect(
      tabBox!.x + tabBox!.width,
      'Filename tab right edge overlaps Open PDF button',
    ).toBeLessThanOrEqual(btnBox!.x + 1);
  });
});

// ---------------------------------------------------------------------------
// Main content area
// ---------------------------------------------------------------------------

test.describe('main content area', () => {
  test('content area fills available vertical space', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // The canvas container (data-print-region) should use most of the viewport height.
    const container = page.locator('[data-print-region]');
    await expect(container).toBeVisible();
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    // Should be at least 50% of viewport height
    const viewport = page.viewportSize()!;
    expect(box!.height).toBeGreaterThan(viewport.height * 0.5);
  });

  test('no horizontal scrollbar on body', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await assertNoHorizontalScrollbar(page);
  });

  test('no horizontal scrollbar on welcome screen', async ({ page }) => {
    await gotoViewer(page);
    await assertNoHorizontalScrollbar(page);
  });
});

// ---------------------------------------------------------------------------
// Floating zoom controls
// ---------------------------------------------------------------------------

test.describe('floating controls', () => {
  test('zoom controls are within viewport', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const zoomBtn = page.locator(tid('zoom-reset-btn'));
    await expect(zoomBtn).toBeVisible();
    const box = await zoomBtn.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });

  test('page indicator is within viewport', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const indicator = page.locator(tid('floating-page-indicator'));
    await expect(indicator).toBeVisible();
    const box = await indicator.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });
});
