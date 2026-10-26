// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// J-A7: "Help us improve PDFluent" in the browser-test build. The form is the
// same component the desktop app mounts; the endpoint is intercepted, so the
// assertions are on the request the Send button actually makes.

import { expect, test, type Page, type Request } from './helpers/guarded-test';

const ENDPOINT = 'https://report.pdfluent.com/v1/feedback';

async function openForm(page: Page, detail: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate((d) => window.dispatchEvent(new CustomEvent('pdfluent:open-feedback', { detail: d })), detail);
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
}

function recordReportRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://report.pdfluent.com')) seen.push(r);
  });
  return seen;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('pdfluent-lang', 'en'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('.pfv3')).toBeVisible({ timeout: 15_000 });
});

test('nothing is sent until Send, and the request is what the form showed', async ({ page }) => {
  const seen = recordReportRequests(page);
  await page.route(`${ENDPOINT}`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'FB-ABCDEFGH', delete_token: 'd'.repeat(64) }) }),
  );
  await openForm(page, { action: 'open', errorCode: 'open.corrupt' });

  await page.getByTestId('feedback-area').selectOption('forms');
  await page.getByTestId('feedback-trying-to').fill('Fill in C:\\Users\\jan\\tax.pdf');
  await page.getByTestId('feedback-what-happened').fill('The checkbox lost its tick after saving');
  await page.getByTestId('feedback-doc-type').selectOption('form');
  await expect(page.getByTestId('feedback-ctx-error')).toContainText('open.corrupt');
  expect(seen).toHaveLength(0);

  await page.getByTestId('feedback-send-btn').click();
  await expect(page.getByTestId('feedback-sent-id')).toHaveText('FB-ABCDEFGH');

  expect(seen).toHaveLength(1);
  const body = JSON.parse(seen[0]?.postData() ?? '{}');
  expect(body.area).toBe('forms');
  expect(body.doc_type).toBe('form');
  expect(body.what_happened).toBe('The checkbox lost its tick after saving');
  expect(body.trying_to).not.toContain('jan');
  expect(body.context.error_code).toBe('open.corrupt');
  expect(body.attachment).toBe(null);
  expect(body.contact).toBe(null);

  // The ID is kept on this machine for the "fixed" notice.
  const kept = await page.evaluate(() => localStorage.getItem('pdfluent.feedback.sent'));
  expect(kept).toContain('FB-ABCDEFGH');
});

test('switching system details off leaves them out of the request', async ({ page }) => {
  const seen = recordReportRequests(page);
  await page.route(`${ENDPOINT}`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'FB-ABCDEFGH', delete_token: 'd' }) }),
  );
  await openForm(page, { errorCode: 'open.corrupt' });
  await page.getByTestId('feedback-what-happened').fill('x');
  await page.getByTestId('feedback-context-toggle').uncheck();
  await expect(page.getByTestId('feedback-ctx-error')).toHaveText('not included');
  await page.getByTestId('feedback-send-btn').click();
  await expect(page.getByTestId('feedback-sent')).toBeVisible();
  const body = JSON.parse(seen[0]?.postData() ?? '{}');
  expect(Object.keys(body.context)).toEqual(['app_version']);
});

test('an address is sent only with a follow-up box ticked, and must look like one', async ({ page }) => {
  const seen = recordReportRequests(page);
  await page.route(`${ENDPOINT}`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'FB-ABCDEFGH', delete_token: 'd' }) }),
  );
  await openForm(page);
  await page.getByTestId('feedback-what-happened').fill('x');
  await page.getByTestId('feedback-consent-fixed').check();
  await page.getByTestId('feedback-email').fill('not-an-address');
  await page.getByTestId('feedback-send-btn').click();
  await expect(page.getByRole('alert')).toContainText('does not look like an email address');
  expect(seen).toHaveLength(0);

  await page.getByTestId('feedback-email').fill('reporter@example.com');
  await page.getByTestId('feedback-send-btn').click();
  await expect(page.getByTestId('feedback-sent')).toBeVisible();
  const body = JSON.parse(seen[0]?.postData() ?? '{}');
  expect(body.contact).toEqual({
    email: 'reporter@example.com', consent_contact: false, consent_fixed: true, consent_text_version: 'fb-contact-1',
  });
});

test('offline: says nothing was sent and keeps the text for another try', async ({ page, allowFaults }) => {
  // The route below cuts the connection; Chromium logs every request it kills. The form's
  // own answer ("Nothing was sent") is what this test is about, and it is asserted.
  allowFaults({
    kind: 'console-error',
    match: 'net::ERR_INTERNET_DISCONNECTED',
    reason: 'this test aborts the feedback request on purpose; the browser logs the aborted request',
  });
  await page.route(`${ENDPOINT}`, (route) => route.abort('internetdisconnected'));
  await openForm(page);
  await page.getByTestId('feedback-what-happened').fill('keep me');
  await page.getByTestId('feedback-send-btn').click();
  await expect(page.getByTestId('feedback-failed')).toContainText('Nothing was sent');
  await expect(page.getByTestId('feedback-what-happened')).toHaveValue('keep me');
  await expect(page.getByTestId('feedback-send-btn')).toHaveText('Try again');
});

test('without an open document there is no share option, and Escape closes', async ({ page }) => {
  await openForm(page);
  await expect(page.getByText('No document is open.')).toBeVisible();
  await expect(page.getByTestId('feedback-document-toggle')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('feedback-dialog')).toHaveCount(0);
});

test('an update that fixes a report says so', async ({ page }) => {
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('pdfluent:fixed-feedback', { detail: { version: '1.0.1', ids: ['FB-ABCDEFGH'] } })),
  );
  await expect(page.getByTestId('feedback-fixed-notice')).toContainText('Version 1.0.1 fixes your report FB-ABCDEFGH');
});
