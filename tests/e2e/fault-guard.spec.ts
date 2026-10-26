// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The Playwright guard (helpers/guarded-test.ts) on a page that misbehaves on
// purpose. `test.fail()` flips the verdict: these pass only when the guard
// failed the test, so a guard that stopped guarding turns this file red.
// The judgement and the page-side watch are covered without a browser in
// tests/fault-guard.test.ts.

import { expect, test } from './helpers/guarded-test';

const FIXTURE = '/__fault-guard-fixture';

const toastHtml = (severity: string, source: string): string =>
  `<div data-testid="app-error-toast" data-severity="${severity}" data-error-source="${source}">` +
  `<p>'${source}' did not complete</p><p>No resource folder for the OCR component: unknown path</p></div>`;

async function serve(page: import('@playwright/test').Page, body: string): Promise<void> {
  await page.route(`**${FIXTURE}`, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${body}</body></html>` }));
  await page.goto(FIXTURE);
}

test('an error toast fails the test', async ({ page }) => {
  test.fail(true, 'the guard must fail a test that showed an error toast');
  await serve(page, toastHtml('error', 'ocr_component_status'));
});

test('an error toast added after load fails the test', async ({ page }) => {
  test.fail(true, 'the guard must see a toast the app renders later');
  await serve(page, '<div id="stack"></div>');
  await page.evaluate((html) => { document.getElementById('stack')!.innerHTML = html; }, toastHtml('error', 'save_pdf'));
  await page.waitForTimeout(100);
});

test('a console error fails the test', async ({ page }) => {
  test.fail(true, 'the guard must fail a test that logged console.error');
  await serve(page, '');
  await page.evaluate(() => { console.error('something went wrong'); });
});

test('an unhandled rejection fails the test', async ({ page }) => {
  test.fail(true, 'the guard must fail a test that left a rejected promise behind');
  await serve(page, '');
  await page.evaluate(() => { void Promise.reject(new Error('nobody caught this')); });
  await page.waitForTimeout(100);
});

test('a warning toast does not fail the test', async ({ page }) => {
  await serve(page, toastHtml('warning', 'ocr_component_status'));
  await expect(page.locator('[data-testid="app-error-toast"]')).toHaveCount(1);
});

test('an allowed error toast does not fail the test', async ({ page, allowFaults }) => {
  allowFaults({ kind: 'error-toast', command: 'ocr_component_status', reason: 'this spec shows the toast on purpose, to prove the allowance works' });
  await serve(page, toastHtml('error', 'ocr_component_status'));
  await expect(page.locator('[data-testid="app-error-toast"]')).toHaveCount(1);
});

test('an allowance for another command does not cover the toast', async ({ page, allowFaults }) => {
  test.fail(true, 'an allowance names its command; another command is still a failure');
  allowFaults({ kind: 'error-toast', command: 'save_pdf', reason: 'this spec allows save_pdf only, to prove the allowance is specific' });
  await serve(page, toastHtml('error', 'ocr_component_status'));
});
