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
 * Collaboration and review handoff tests.
 *
 * NOTE: ReviewHandoffPanel is not yet wired into ViewerApp. These tests cover:
 *   1. Reviewer identity UI in the review panel (IS wired in RightContextPanel).
 *   2. Comment export buttons (IS wired).
 *   3. Structural readiness of ReviewHandoffPanel source.
 *
 * Once ReviewHandoffPanel is wired into ViewerApp, add:
 *   - handoff-panel open/close
 *   - export-btn disabled without doc
 *   - import-input visible
 *   - merge-btn state
 */

// ---------------------------------------------------------------------------
// Reviewer identity — via RightContextPanel review section
// ---------------------------------------------------------------------------

test.describe('reviewer identity in review panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('reviewer-name-input is present', async ({ page }) => {
    await expect(page.locator(tid('reviewer-name-input'))).toBeVisible();
  });

  test('reviewer-name-input accepts a name', async ({ page }) => {
    const input = page.locator(tid('reviewer-name-input'));
    await input.fill('Jasper de Reviewer');
    await expect(input).toHaveValue('Jasper de Reviewer');
  });

  test('reviewer-name-input is a text field', async ({ page }) => {
    const input = page.locator(tid('reviewer-name-input'));
    await expect(input).toHaveAttribute('type', 'text');
  });
});

// ---------------------------------------------------------------------------
// Comment export — RightContextPanel review section
// ---------------------------------------------------------------------------

test.describe('comment export buttons', () => {
  test.beforeEach(async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Beoordelen');
  });

  test('export-review-md-btn is visible and enabled', async ({ page }) => {
    await expect(page.locator(tid('export-review-md-btn'))).toBeVisible();
    await expect(page.locator(tid('export-review-md-btn'))).toBeEnabled();
  });

  test('export-review-json-btn is visible and enabled', async ({ page }) => {
    await expect(page.locator(tid('export-review-json-btn'))).toBeVisible();
    await expect(page.locator(tid('export-review-json-btn'))).toBeEnabled();
  });

  test('resolve-all-btn is visible', async ({ page }) => {
    await expect(page.locator(tid('resolve-all-btn'))).toBeVisible();
  });

  test('delete-resolved-btn is visible', async ({ page }) => {
    await expect(page.locator(tid('delete-resolved-btn'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Handoff panel source readiness
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const handoffSrc = readFileSync(
  join(__dir, '../../../src/viewer/components/ReviewHandoffPanel.tsx'),
  'utf8',
);

test.describe('ReviewHandoffPanel source readiness', () => {
  const src = handoffSrc;

  test('ReviewHandoffPanel exports handoff-panel testid', () => {
    expect(src).toContain('data-testid="handoff-panel"');
  });

  test('ReviewHandoffPanel exports handoff-export-btn testid', () => {
    expect(src).toContain('data-testid="handoff-export-btn"');
  });

  test('ReviewHandoffPanel exports handoff-merge-btn testid', () => {
    expect(src).toContain('data-testid="handoff-merge-btn"');
  });

  test('ReviewHandoffPanel exports handoff-import-input testid', () => {
    expect(src).toContain('data-testid="handoff-import-input"');
  });
});
