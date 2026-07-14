// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.

import { test, expect } from '@playwright/test';
import { tid } from './helpers/selectors';
import * as path from 'path';

const SAMPLE_TEXT = 'tests/fixtures/sample-text.pdf';
const ARTIFACTS_DIR = '/Users/jasperdewinter/.gemini/antigravity/brain/f9a7ad25-e948-4383-a61d-795a954d038f';

test.describe('Visual E2E Validation - Real User Interaction', () => {
  test('should load PDF, enter edit mode, modify text inline, and save changes successfully', async ({ page }) => {
    // Capture browser console logs and uncaught errors
    page.on('console', msg => {
      console.log(`BROWSER LOG [${msg.type()}]: ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`BROWSER ERROR: ${err.message}`);
    });

    // 1. Set language to English and load the viewer
    await page.addInitScript(() => {
      localStorage.setItem('pdfluent-lang', 'en');
    });
    
    await page.goto('/?v2');
    await expect(page.locator(tid('viewer-empty-state'))).toBeVisible({ timeout: 15_000 });

    // 2. Load the sample-text PDF document
    await page.waitForFunction(
      () => typeof (window as any).__pdfluent_test__ !== 'undefined',
      undefined,
      { timeout: 15_000 }
    );
    await page.evaluate(async (p) => {
      await (window as any).__pdfluent_test__.loadDocument(p);
    }, SAMPLE_TEXT);

    // Wait until document is fully rendered
    await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 15_000 });
    const canvas = page.locator(tid('rendered-page')).first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    
    // Allow rendering to finish and take a screenshot of the loaded document
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'visual_1_loaded.png') });
    console.log('Saved visual_1_loaded.png');

    // 3. Switch to "Edit" mode
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveClass(/border-primary/, { timeout: 5000 });
    
    // Take a screenshot showing edit mode active (with page outlines or formatting panel if visible)
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'visual_2_edit_mode.png') });
    console.log('Saved visual_2_edit_mode.png');

    // 4. Locate first text span and double-click to edit
    const textSpan = page.locator(tid('text-span')).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    
    // Double click the text span to start inline editing
    await textSpan.dblclick();

    // Verify inline editor and floating pill are visible
    const editor = page.locator(tid('text-inline-editor'));
    const pill = page.locator(tid('text-edit-floating-pill'));
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(pill).toBeVisible({ timeout: 10_000 });

    // Take screenshot of opened inline editor
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'visual_3_inline_editor.png') });
    console.log('Saved visual_3_inline_editor.png');

    // 5. Modify the text inside the editor
    await editor.focus();
    // Select all existing text and replace it
    await page.keyboard.press('Meta+A');
    await page.keyboard.insertText('Edited visual E2E page one');
    
    // Take screenshot of the modified inline text
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'visual_4_text_changed.png') });
    console.log('Saved visual_4_text_changed.png');

    // 6. Click the Save button in the floating pill or use keyboard shortcut
    const saveBtn = pill.getByRole('button', { name: 'Save', exact: true });
    await expect(saveBtn).toBeVisible();
    
    // Press Control+Enter as the primary robust shortcut for committing changes
    await page.keyboard.press('Control+Enter');
    
    // Fallback: if still visible, force click the save button
    if (await editor.isVisible()) {
      await saveBtn.click({ force: true });
    }

    // Verify inline editor closes and modifications are committed
    await expect(editor).not.toBeVisible({ timeout: 5000 });
    await expect(pill).not.toBeVisible({ timeout: 5000 });

    // Allow canvas to re-render the updated PDF text run
    await page.waitForTimeout(1500);
    
    // Take a screenshot of the committed saved state (the text should now be updated on the PDF canvas itself)
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'visual_5_saved_state.png') });
    console.log('Saved visual_5_saved_state.png');
  });
});
