// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// J-17 / J-18 on screen: a file that does not open shows what happened, what
// to do, and a way to tell us, in the user's language, with none of the
// engine's own text.
//
// The browser build runs on MockPdfEngine, which fails an open the way
// open_pdf does when the source is `mock-open-failure:<code>`: the code, and
// the engine's raw text as the detail. The Rust side, which produces those
// codes from real bytes, is src-tauri/tests/open_errors.rs.

import { test, expect, type Page } from './helpers/guarded-test';
import { tid } from './helpers/selectors';
import { readFileSync } from 'node:fs';

type Messages = { openError: Record<string, { title: string; body: string; action: string }> & { feedback: string } };
const locale = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${name}.json`, import.meta.url), 'utf8')) as Messages;
const en = locale('en');
const nl = locale('nl');

type TestHook = { loadDocument: (source: string | ArrayBuffer) => Promise<void> };

const RAW_ENGINE_TEXT = 'Failed to parse PDF';

async function openFailing(page: Page, code: string, lang = 'en'): Promise<void> {
  await page.addInitScript((language) => {
    localStorage.setItem('pdfluent-lang', language);
  }, lang);
  await page.goto('/');
  await page.locator('.pfv3[data-has-document="false"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __pdfluent_test__?: TestHook }).__pdfluent_test__ !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async (source) => {
    await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(source);
  }, `mock-open-failure:${code}`);
  await page.locator(tid('open-error')).waitFor({ state: 'visible', timeout: 15_000 });
}

test('a damaged PDF says so, offers another file and feedback, and hides the engine text', async ({ page }) => {
  await openFailing(page, 'open.corrupt');

  const panel = page.locator(tid('open-error'));
  await expect(panel).toHaveAttribute('data-error-code', 'open.corrupt');
  await expect(page.locator(tid('open-error-title'))).toHaveText(en.openError.corrupt.title);
  await expect(page.locator(tid('open-error-body'))).toHaveText(en.openError.corrupt.body);
  await expect(page.locator(tid('open-error-action'))).toHaveText(en.openError.corrupt.action);
  await expect(page.locator(tid('open-error-feedback'))).toHaveText(en.openError.feedback);
  await expect(page.getByText(RAW_ENGINE_TEXT, { exact: false })).toHaveCount(0);
});

test('the feedback button asks for the feedback form with the error code', async ({ page }) => {
  await openFailing(page, 'open.corrupt');
  await page.evaluate(() => {
    const seen: unknown[] = [];
    (window as unknown as { __feedbackSeen: unknown[] }).__feedbackSeen = seen;
    window.addEventListener('pdfluent:open-feedback', (e) => { seen.push((e as CustomEvent).detail); });
  });

  await page.locator(tid('open-error-feedback')).click();

  const seen = await page.evaluate(() => (window as unknown as { __feedbackSeen: unknown[] }).__feedbackSeen);
  expect(seen).toEqual([{ action: 'open', errorCode: 'open.corrupt' }]);
});

test('a PDF with protection no password opens says so, and offers another file', async ({ page }) => {
  await openFailing(page, 'open.unsupported_encryption');

  await expect(page.locator(tid('open-error-title'))).toHaveText(en.openError.unsupported_encryption.title);
  await expect(page.locator(tid('open-error-action'))).toHaveText(en.openError.unsupported_encryption.action);
  await expect(page.locator(tid('open-error-action'))).toHaveAttribute('data-action', 'open-another');
  await expect(page.locator(tid('open-error-feedback'))).toBeVisible();
  await expect(page.getByText(RAW_ENGINE_TEXT, { exact: false })).toHaveCount(0);
});

test('a PDF that needs its password offers to enter it', async ({ page }) => {
  await openFailing(page, 'open.encrypted_needs_password');

  await expect(page.locator(tid('open-error-title'))).toHaveText(en.openError.encrypted_needs_password.title);
  await expect(page.locator(tid('open-error-action'))).toHaveText(en.openError.encrypted_needs_password.action);
  await expect(page.locator(tid('open-error-action'))).toHaveAttribute('data-action', 'retry');
});

test('the message is in the user\'s language', async ({ page }) => {
  await openFailing(page, 'open.corrupt', 'nl');

  await expect(page.locator(tid('open-error-title'))).toHaveText(nl.openError.corrupt.title);
  await expect(page.locator(tid('open-error-feedback'))).toHaveText(nl.openError.feedback);
});

test('a code the app does not know gets the generic message, not its name', async ({ page }) => {
  await openFailing(page, 'open.from_the_future');

  await expect(page.locator(tid('open-error'))).toHaveAttribute('data-error-code', 'open.unknown');
  await expect(page.locator(tid('open-error-title'))).toHaveText(en.openError.unknown.title);
  // Scoped to the error panel: the breadcrumb shows the file's name, and the
  // mock names the file after the code it makes fail.
  await expect(page.locator(tid('open-error')).getByText('from_the_future', { exact: false })).toHaveCount(0);
});

test('Open another file leaves the error and goes back to choosing a file', async ({ page }) => {
  await openFailing(page, 'open.not_pdf');

  await page.locator(tid('open-error-action')).click();

  await expect(page.locator(tid('open-error'))).toHaveCount(0);
  await expect(page.locator(tid('welcome-screen'))).toBeVisible();
});
