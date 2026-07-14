// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Overflow Detection Tests — Visual QA Layer 2
 *
 * Systematic overflow checks for every fixed-size container in the UI.
 * Catches content that leaks beyond its parent bounds.
 */

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { assertNoOverflow } from '../helpers/layout';

// ---------------------------------------------------------------------------
// ModeSwitcher tabs
// ---------------------------------------------------------------------------

test.describe('ModeSwitcher overflow', () => {
  test('mode tabs do not overflow horizontally', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // ModeSwitcher is the flex container with overflow-x-auto
    const switcher = page.locator('.overflow-x-auto').first();
    await expect(switcher).toBeVisible();
    const overflow = await switcher.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `ModeSwitcher scrollWidth(${overflow.scrollWidth}) > clientWidth(${overflow.clientWidth})`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

// ---------------------------------------------------------------------------
// TopBar three-column layout
// ---------------------------------------------------------------------------

test.describe('TopBar overflow', () => {
  test('TopBar has no horizontal overflow with document loaded', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // TopBar is the first h-12 flex bar
    const topbar = page.locator('.h-12.flex.items-center').first();
    await expect(topbar).toBeVisible();
    const overflow = await topbar.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test('TopBar has no horizontal overflow on welcome screen', async ({ page }) => {
    await gotoViewer(page);
    const topbar = page.locator('.h-12.flex.items-center').first();
    await expect(topbar).toBeVisible();
    const overflow = await topbar.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

// ---------------------------------------------------------------------------
// LeftNavRail sidebar
// ---------------------------------------------------------------------------

test.describe('LeftNavRail overflow', () => {
  test('thumbnail scroll container does not overflow horizontally', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await assertNoOverflow(page, tid('thumbnail-scroll-container'));
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel
// ---------------------------------------------------------------------------

test.describe('RightContextPanel overflow', () => {
  test('doc info panel does not overflow', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Read mode shows doc-info-panel by default
    await assertNoOverflow(page, tid('doc-info-panel'));
  });
});

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

test.describe('Welcome screen overflow', () => {
  test('welcome screen does not overflow viewport', async ({ page }) => {
    await gotoViewer(page);
    await assertNoOverflow(page, tid('viewer-empty-state'));
  });
});

// ---------------------------------------------------------------------------
// Mode-specific panels
// ---------------------------------------------------------------------------

test.describe('mode panel overflow', () => {
  test('review mode panel does not overflow', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
    const reviewerInput = page.locator(tid('reviewer-name-input'));
    await expect(reviewerInput).toBeVisible();
    // The reviewer input parent panel should not overflow
    const panel = reviewerInput.locator('xpath=ancestor::div[contains(@class,"shrink-0")]').first();
    if (await panel.isVisible()) {
      const overflow = await panel.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });

  test('forms mode completion summary does not overflow', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Formulieren');
    const summary = page.locator(tid('forms-completion-summary'));
    if (await summary.isVisible()) {
      await assertNoOverflow(page, tid('forms-completion-summary'));
    }
  });
});
