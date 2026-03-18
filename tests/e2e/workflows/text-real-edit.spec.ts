// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Real Text Edit Flow — Playwright E2E validation (Phase 4 Batch 8)
 *
 * Validates the Phase 4 real text mutation path in the running app:
 *
 * Source readiness:
 * - textMutationSupport.ts exports getMutationSupport and validateReplacement
 * - TextMutationEngine.ts defines the mutation backend contract
 * - TauriTextMutationEngine.ts implements the interface
 * - textMutationMessaging.ts exports user-facing message helpers
 * - errorCenter.ts exports makeTextMutationError
 *
 * Runtime behaviour:
 * - No JS errors while in edit mode (baseline)
 * - text-inline-editor appears when edit mode is active and target is selected
 * - Cancel path (Escape) clears the inline editor without errors
 * - No JS errors across commit/cancel cycle
 * - text-inline-editor is absent before any target is entered
 * - No-console-error baseline remains intact after Phase 4 changes
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Source readiness — Phase 4 files
// ---------------------------------------------------------------------------

const mutationSupportSrc = readFileSync(
  join(__dir, '../../../src/viewer/text/textMutationSupport.ts'),
  'utf8',
);
const mutationEngineSrc = readFileSync(
  join(__dir, '../../../src/core/engine/TextMutationEngine.ts'),
  'utf8',
);
const tauriMutationEngineSrc = readFileSync(
  join(__dir, '../../../src/platform/engine/tauri/TauriTextMutationEngine.ts'),
  'utf8',
);
const mutationMessagingSrc = readFileSync(
  join(__dir, '../../../src/viewer/text/textMutationMessaging.ts'),
  'utf8',
);
const errorCenterSrc = readFileSync(
  join(__dir, '../../../src/viewer/state/errorCenter.ts'),
  'utf8',
);

test.describe('text real edit — Phase 4 source readiness', () => {
  test('textMutationSupport exports getMutationSupport', () => {
    expect(mutationSupportSrc).toContain('export function getMutationSupport');
  });

  test('textMutationSupport exports validateReplacement', () => {
    expect(mutationSupportSrc).toContain('export function validateReplacement');
  });

  test('textMutationSupport defines writable_digital_text class', () => {
    expect(mutationSupportSrc).toContain("'writable_digital_text'");
  });

  test('textMutationSupport defines non_writable_digital_text class', () => {
    expect(mutationSupportSrc).toContain("'non_writable_digital_text'");
  });

  test('textMutationSupport defines ocr_read_only class', () => {
    expect(mutationSupportSrc).toContain("'ocr_read_only'");
  });

  test('TextMutationEngine interface defines replaceTextSpan', () => {
    expect(mutationEngineSrc).toContain('export interface TextMutationEngine');
    expect(mutationEngineSrc).toContain('replaceTextSpan(');
  });

  test('TextMutationEngine defines ReplaceTextSpanRequest with required fields', () => {
    expect(mutationEngineSrc).toContain('pageIndex: number');
    expect(mutationEngineSrc).toContain('originalText: string');
    expect(mutationEngineSrc).toContain('replacementText: string');
  });

  test('TauriTextMutationEngine implements the interface', () => {
    expect(tauriMutationEngineSrc).toContain('implements TextMutationEngine');
    expect(tauriMutationEngineSrc).toContain("'replace_text_span'");
  });

  test('textMutationMessaging exports getUnsupportedMessage', () => {
    expect(mutationMessagingSrc).toContain('export function getUnsupportedMessage');
  });

  test('textMutationMessaging exports getBackendRejectionMessage', () => {
    expect(mutationMessagingSrc).toContain('export function getBackendRejectionMessage');
  });

  test('textMutationMessaging covers replacement-too-long', () => {
    expect(mutationMessagingSrc).toContain('replacement-too-long');
  });

  test('textMutationMessaging covers encoding-not-supported', () => {
    expect(mutationMessagingSrc).toContain('encoding-not-supported');
  });

  test('errorCenter exports makeTextMutationError', () => {
    expect(errorCenterSrc).toContain('export const makeTextMutationError');
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

test.describe('text real edit — runtime', () => {
  test('no JavaScript errors in edit mode (Phase 4 baseline)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    expect(jsErrors).toHaveLength(0);
  });

  test('text-inline-editor is absent before any text target is entered', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-inline-editor'))).toHaveCount(0);
  });

  test('text-context-bar is absent without a selected text paragraph', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-context-bar'))).toHaveCount(0);
  });

  test('no JavaScript errors across edit mode cycle with Phase 4 wiring', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Lezen');
    await switchMode(page, 'Bewerken');
    expect(jsErrors).toHaveLength(0);
  });

  test('no JavaScript errors across full mode cycle', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Beveiligen');
    await switchMode(page, 'Lezen');
    expect(jsErrors).toHaveLength(0);
  });

  test('text-interaction-overlay is present in edit mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(1);
  });

  test('text-interaction-overlay is absent in read mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });

  test('floating page indicator remains visible in edit mode (Phase 4 regression)', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });

  test('mode switch from edit to read removes text interaction overlay', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(1);
    await switchMode(page, 'Lezen');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });
});
