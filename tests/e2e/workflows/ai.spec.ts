// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { test, expect } from '@playwright/test';
import { gotoViewer, gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { seedLocalStorage } from '../helpers/bootstrap';

/**
 * AI panel tests.
 *
 * NOTE: AiPanel is not yet wired into ViewerApp. These tests verify:
 *   1. That AI-related localStorage config does not crash the app.
 *   2. That the AI storage key is absent / respected at startup.
 *   3. Structural readiness of the source (via source file assertions).
 *
 * Once AiPanel is wired into ViewerApp, add:
 *   - await expect(page.locator(tid('ai-panel'))).toBeVisible()
 *   - panel open/close tests
 *   - unconfigured notice
 *   - API key entry and save
 */

// ---------------------------------------------------------------------------
// AI config isolation — app must not crash when AI key is/is not present
// ---------------------------------------------------------------------------

test.describe('AI config isolation', () => {
  test('app loads without crash when AI config absent', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('tauri') || err.message.includes('invoke')) return;
      errors.push(err.message);
    });
    await gotoViewer(page);
    expect(errors).toHaveLength(0);
  });

  test('app loads without crash when AI config present in localStorage', async ({ page }) => {
    await seedLocalStorage(
      page,
      'pdfluent.ai.config',
      JSON.stringify({ apiKey: '', model: 'claude-haiku-4-5-20251001', maxTokens: 1024 }),
    );
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('tauri') || err.message.includes('invoke')) return;
      errors.push(err.message);
    });
    await gotoViewer(page);
    expect(errors).toHaveLength(0);
  });

  test('app loads without crash when AI config has invalid JSON', async ({ page }) => {
    await seedLocalStorage(page, 'pdfluent.ai.config', 'not-json');
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('tauri') || err.message.includes('invoke')) return;
      errors.push(err.message);
    });
    await gotoViewer(page);
    expect(errors).toHaveLength(0);
  });

  test('viewer still loads with mock doc when AI config present', async ({ page }) => {
    await seedLocalStorage(
      page,
      'pdfluent.ai.config',
      JSON.stringify({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001', maxTokens: 1024 }),
    );
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AI panel source readiness — file-level
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const aiProviderSrc = readFileSync(join(__dir, '../../../src/viewer/ai/aiProvider.ts'), 'utf8');
const aiPanelSrc = readFileSync(join(__dir, '../../../src/viewer/components/AiPanel.tsx'), 'utf8');

test.describe('AI source readiness (file assertions)', () => {
  test('aiProvider exports AI_API_ENDPOINT', () => {
    expect(aiProviderSrc).toContain('export const AI_API_ENDPOINT');
  });

  test('aiProvider exports makeAiRequest', () => {
    expect(aiProviderSrc).toContain('export async function makeAiRequest(');
  });

  test('aiProvider exports isAiConfigured', () => {
    expect(aiProviderSrc).toContain('export function isAiConfigured(');
  });

  test('AiPanel source exports ai-panel testid', () => {
    expect(aiPanelSrc).toContain('data-testid="ai-panel"');
    expect(aiPanelSrc).toContain('data-testid="ai-not-configured-notice"');
  });
});
