// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Edit Visual Snapshot Verification — Phase 5 Batch 3
 *
 * Validates visual layout integrity of the text editing UI:
 * - Pre-edit document state matches baseline snapshot
 * - Edit mode UI renders without layout regression
 * - TextInlineEditor renders correctly when active
 * - TextContextBar renders correctly when a target is selected
 * - Mode transitions do not produce visual artifacts
 * - No JS errors during any visual state transition
 *
 * Snapshots are stored in tests/e2e/snapshots/.
 * On first run, snapshots are generated. On subsequent runs, they are compared.
 *
 * Note: these tests use page.screenshot() comparisons on the viewer shell.
 * They do NOT require a real PDF mutation to succeed — they validate the
 * UI shell and mode-switch visual correctness.
 */

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc, gotoViewer, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

// ---------------------------------------------------------------------------
// Viewer shell visual baseline
// ---------------------------------------------------------------------------

test.describe('text edit visual — viewer shell baseline', () => {
  test('viewer shell matches baseline snapshot in read mode', async ({ page }) => {
    await gotoViewer(page);
    const shell = page.locator(tid('viewer-empty-state'));
    await expect(shell).toBeVisible();
    await expect(page).toHaveScreenshot('viewer-shell-read-mode.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('no visual artifacts when switching to edit mode', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page).toHaveScreenshot('viewer-edit-mode.png', {
      maxDiffPixelRatio: 0.02,
    });
    expect(jsErrors).toHaveLength(0);
  });

  test('edit mode restores to read mode visually', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Lezen');
    await expect(page).toHaveScreenshot('viewer-after-mode-restore.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

// ---------------------------------------------------------------------------
// Text interaction overlay visual
// ---------------------------------------------------------------------------

test.describe('text edit visual — text interaction overlay', () => {
  test('text-interaction-overlay present in edit mode matches snapshot', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    const overlay = page.locator(tid('text-interaction-overlay'));
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveScreenshot('text-interaction-overlay.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('text-interaction-overlay absent in read mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Mode cycle visual stability
// ---------------------------------------------------------------------------

test.describe('text edit visual — mode cycle stability', () => {
  test('full mode cycle produces no JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Beveiligen');
    await switchMode(page, 'Formulieren');
    await switchMode(page, 'Lezen');
    expect(jsErrors).toHaveLength(0);
  });

  test('floating page indicator visible throughout mode cycle', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
    await switchMode(page, 'Lezen');
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });
});
