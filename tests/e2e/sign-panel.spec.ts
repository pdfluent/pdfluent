// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The Sign panel, on screen, with a document open.
//
// The source-level guard for this panel is tests/viewer-v3-sign-panel.test.ts;
// this spec is the part that only a rendered shell can answer: that the Sign
// tab reaches the panel at all, that the certificate controls are on it, and
// that the two badges the panel used to show over an in-memory drawing are
// gone from the rendered DOM rather than merely from the source.
//
// Signing itself needs the native dialogs and the Rust command, neither of
// which exists in the browser build, so the button is disabled here and the
// panel says so. The signature this test cannot make is made in
// src-tauri/src/pdf_engine.rs::op_sign_with_certificate_verifies_after_reopen.

import { test, expect, type Page } from '@playwright/test';
import { tid } from './helpers/selectors';

type TestHook = { loadDocument: (source: string | ArrayBuffer) => Promise<void> };

async function openSignPanel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('pdfluent-lang', 'en');
  });
  await page.goto('/');
  await page.locator('.pfv3[data-has-document="false"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __pdfluent_test__?: TestHook }).__pdfluent_test__ !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async (path) => {
    await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(path);
  }, 'tests/fixtures/sample-text.pdf');
  await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign', exact: true }).first().click();
}

test('the Sign tab opens a panel that offers certificate signing', async ({ page }) => {
  await openSignPanel(page);

  await expect(page.locator(tid('sign-cert-pick'))).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(tid('sign-cert-password'))).toBeVisible();
  await expect(page.locator(tid('sign-reason'))).toBeVisible();
  await expect(page.locator(tid('sign-with-certificate'))).toBeVisible();
});

test('the panel names the signature level it produces', async ({ page }) => {
  await openSignPanel(page);

  await expect(page.getByText('PAdES B-B', { exact: false })).toBeVisible({ timeout: 15_000 });
});

test('the panel no longer claims a signature the document does not have', async ({ page }) => {
  await openSignPanel(page);

  await expect(page.getByText('Locally signed', { exact: false })).toHaveCount(0);
  await expect(page.getByText('PAdES-compliant digital signature', { exact: false })).toHaveCount(0);
});

test('signing is offered as a desktop action, not as a dead button', async ({ page }) => {
  await openSignPanel(page);

  // No Tauri runtime in the browser build: the control must be disabled and
  // say why, rather than accept a click that reaches nothing.
  await expect(page.locator(tid('sign-with-certificate'))).toBeDisabled();
  await expect(page.getByText('Available in the desktop app', { exact: false }).first()).toBeVisible();
});
