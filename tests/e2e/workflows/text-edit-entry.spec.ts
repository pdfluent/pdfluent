// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Edit Entry — Playwright E2E validation.
 *
 * Validates Phase 3 editing entry layer in the running app:
 * - Source readiness for all Phase 3 files
 * - No JS errors with editing state active
 * - Text interaction overlay remains present in edit mode
 * - TextContextBar is not visible without selection
 * - TextInlineEditor is not visible without edit entry
 * - Mode switch resets edit state cleanly
 * - No-console-error baseline is intact through the edit flow
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gotoViewerWithDoc, switchMode } from '../helpers/app';
import { tid } from '../helpers/selectors';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Source readiness — Phase 3 files
// ---------------------------------------------------------------------------

const editabilitySrc = readFileSync(
  join(__dir, '../../../src/viewer/text/textEditability.ts'),
  'utf8',
);
const draftPipelineSrc = readFileSync(
  join(__dir, '../../../src/viewer/text/textDraftPipeline.ts'),
  'utf8',
);
const inlineEditorSrc = readFileSync(
  join(__dir, '../../../src/viewer/components/TextInlineEditor.tsx'),
  'utf8',
);
const contextBarSrc = readFileSync(
  join(__dir, '../../../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);

test.describe('text edit entry — Phase 3 source readiness', () => {
  test('textEditability defines all status codes', () => {
    expect(editabilitySrc).toContain("'editable'");
    expect(editabilitySrc).toContain("'ocr-read-only'");
    expect(editabilitySrc).toContain("'protected-mode'");
    expect(editabilitySrc).toContain("'annotation-tool-active'");
    expect(editabilitySrc).toContain("'unsupported-structure'");
    expect(editabilitySrc).toContain("'empty-target'");
    expect(editabilitySrc).toContain('export function getEditability');
  });

  test('textDraftPipeline exports startDraft, updateDraft, cancelDraft, commitDraft', () => {
    expect(draftPipelineSrc).toContain('export function startDraft');
    expect(draftPipelineSrc).toContain('export function updateDraft');
    expect(draftPipelineSrc).toContain('export function cancelDraft');
    expect(draftPipelineSrc).toContain('export function commitDraft');
  });

  test('TextInlineEditor has correct testids and keyboard handlers', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor');
    expect(inlineEditorSrc).toContain('text-inline-editor-textarea');
    expect(inlineEditorSrc).toContain('text-inline-editor-commit');
    expect(inlineEditorSrc).toContain('text-inline-editor-cancel');
    expect(inlineEditorSrc).toContain("e.key === 'Escape'");
    expect(inlineEditorSrc).toContain("e.key === 'Enter'");
  });

  test('TextContextBar has edit-text action and isEditing prop', () => {
    expect(contextBarSrc).toContain("'edit-text'");
    expect(contextBarSrc).toContain('isEditing');
    expect(contextBarSrc).toContain('text-context-action-commit');
    expect(contextBarSrc).toContain('text-context-action-cancel');
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

test.describe('text edit entry — runtime', () => {
  test('no JavaScript errors on document load in edit mode', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    expect(jsErrors).toHaveLength(0);
  });

  test('text-inline-editor is absent before edit entry', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    // Without explicitly entering edit on a paragraph, no inline editor should exist
    await expect(page.locator(tid('text-inline-editor'))).toHaveCount(0);
  });

  test('text-context-bar is absent without a selected text paragraph', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-context-bar'))).toHaveCount(0);
  });

  test('text-interaction-overlay is present in edit mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(1);
  });

  test('switching from edit to read clears interaction overlay', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(1);
    await switchMode(page, 'Lezen');
    await expect(page.locator(tid('text-interaction-overlay'))).toHaveCount(0);
  });

  test('no JavaScript errors across edit mode cycle', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Lezen');
    await switchMode(page, 'Bewerken');
    expect(jsErrors).toHaveLength(0);
  });

  test('no JavaScript errors across full mode cycle with edit mode', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await switchMode(page, 'Beoordelen');
    await switchMode(page, 'Beveiligen');
    await switchMode(page, 'Lezen');
    expect(jsErrors).toHaveLength(0);
  });

  test('floating page indicator still visible in edit mode', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await switchMode(page, 'Bewerken');
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });
});
