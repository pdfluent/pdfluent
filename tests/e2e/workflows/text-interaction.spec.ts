// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Interaction Layer — Playwright E2E validation.
 *
 * Validates the Phase 2 text interaction layer in the running app:
 * - Edit mode activates text interaction
 * - Text interaction overlay is present in the DOM when active
 * - Non-edit modes do not show text interaction UI
 * - No console errors during text interaction
 * - Source readiness for all Phase 2 files
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gotoViewerWithDoc, gotoViewer, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Source readiness (all Phase 2 files)
// ---------------------------------------------------------------------------

const textModelSrc = readFileSync(join(__dir, '../../../src/viewer/text/textInteractionModel.ts'), 'utf8');
const textGroupingSrc = readFileSync(join(__dir, '../../../src/viewer/text/textGrouping.ts'), 'utf8');
const textHitTestSrc = readFileSync(join(__dir, '../../../src/viewer/text/textHoverHitTest.ts'), 'utf8');
const textRulesSrc = readFileSync(join(__dir, '../../../src/viewer/text/textInteractionRules.ts'), 'utf8');
const overlayCompSrc = readFileSync(join(__dir, '../../../src/viewer/components/TextInteractionOverlay.tsx'), 'utf8');
const contextBarSrc = readFileSync(join(__dir, '../../../src/viewer/components/TextContextBar.tsx'), 'utf8');

test.describe('text interaction — Phase 2 source readiness', () => {
  test('textInteractionModel defines all required types', () => {
    expect(textModelSrc).toContain('export type TextSource');
    expect(textModelSrc).toContain('export interface TextSpanTarget');
    expect(textModelSrc).toContain('export interface TextLineTarget');
    expect(textModelSrc).toContain('export interface TextParagraphTarget');
    expect(textModelSrc).toContain('export interface TextBlockTarget');
    expect(textModelSrc).toContain('export interface PageTextStructure');
    expect(textModelSrc).toContain('export function ocrBoxToPdfRect');
    expect(textModelSrc).toContain('export function pdfRectToDom');
  });

  test('textGrouping exports digital and OCR grouping functions', () => {
    expect(textGroupingSrc).toContain('export function groupDigitalTextSpans');
    expect(textGroupingSrc).toContain('export function groupOcrWordBoxes');
  });

  test('textHoverHitTest exports hitTestText and closestParagraph', () => {
    expect(textHitTestSrc).toContain('export function hitTestText');
    expect(textHitTestSrc).toContain('export function hitTestTextWithPadding');
    expect(textHitTestSrc).toContain('export function closestParagraph');
    expect(textHitTestSrc).toContain('export interface TextHoverTarget');
  });

  test('textInteractionRules exports rule resolver and predicates', () => {
    expect(textRulesSrc).toContain('export function getTextInteractionRule');
    expect(textRulesSrc).toContain('export function isTextInteractionActive');
    expect(textRulesSrc).toContain('export function isFullTextInteractionActive');
    expect(textRulesSrc).toContain("'edit'");
    expect(textRulesSrc).toContain("'protect'");
  });

  test('TextInteractionOverlay has correct structure', () => {
    expect(overlayCompSrc).toContain('export const TextInteractionOverlay');
    expect(overlayCompSrc).toContain('text-interaction-overlay');
    expect(overlayCompSrc).toContain("pointerEvents: 'none'");
  });

  test('TextContextBar defines all five actions', () => {
    expect(contextBarSrc).toContain('text-context-bar');
    expect(contextBarSrc).toContain("'annotate'");
    expect(contextBarSrc).toContain("'redact'");
    expect(contextBarSrc).toContain("'copy'");
    expect(contextBarSrc).toContain("'summarize'");
    expect(contextBarSrc).toContain("'explain'");
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

test.describe('text interaction — runtime', () => {
  test('no JavaScript errors on document load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    expect(jsErrors).toHaveLength(0);
  });

  test('app loads and shows floating page indicator after doc load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });

  test('edit mode button is present in mode switcher', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Mode switcher uses Dutch label "Bewerken" for edit mode
    await expect(page.getByRole('button', { name: 'Bewerken' })).toBeVisible();
  });

  test('switching to edit mode does not cause JS error', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    expect(jsErrors).toHaveLength(0);
  });

  test('text-interaction-overlay is absent before document load', async ({ page }) => {
    await gotoViewer(page);
    const overlay = page.locator(tid('text-interaction-overlay'));
    // Should not be visible without a document
    await expect(overlay).toHaveCount(0);
  });

  test('text-interaction-overlay is present in DOM after switching to edit mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    // The overlay SVG should exist in the DOM (may not have visible rects if no hover)
    const overlay = page.locator(tid('text-interaction-overlay'));
    await expect(overlay).toHaveCount(1);
  });

  test('text-interaction-overlay is absent in read mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // Default mode is read — overlay should not be rendered
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });

  test('switching back to read mode removes the overlay', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(1);
    await switchMode(page, 'Lezen');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });

  test('no text-context-bar visible without hover/selection', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    // Without hovering over text, no context bar
    await expect(page.locator(tid('text-context-bar'))).toHaveCount(0);
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
});
