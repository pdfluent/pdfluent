// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// `test` for the Playwright specs: the stock one plus a guard that fails the
// test when the app shows an error the test did not expect.
//
// An error toast ("'<command>' did not complete"), a console error (the page's
// own console.error and the browser's, e.g. a failed request), an uncaught
// exception or an unhandled rejection, anywhere in the test, fails it with the
// text. The browser build has no Tauri backend, so a spec that is about a
// failure says which failure with allowFaults() and a reason:
//
//   test('...', async ({ page, allowFaults }) => {
//     allowFaults({ kind: 'console-error', match: /ipc/, reason: 'the spec opens a file the mock refuses; the refusal is logged' });
//
// Import `test` and `expect` from here, never from '@playwright/test'
// (tests/fault-guard.test.ts fails a spec that does).

import { expect, test as base } from '@playwright/test';
import { faultFailure, judgeFaults, validateExpectations, type ExpectedFault, type Fault } from '../../lib/fault-guard';
import { FAULT_WATCH_SOURCE } from '../../lib/fault-watch-source';

interface Fixtures {
  allowedFaults: ExpectedFault[];
  /** Say which faults this test is about. Every entry needs a reason in words. */
  allowFaults: (...expected: ExpectedFault[]) => void;
  faultGuard: void;
}

export const test = base.extend<Fixtures>({
  allowedFaults: async ({}, use) => {
    await use([]);
  },
  allowFaults: async ({ allowedFaults }, use, testInfo) => {
    await use((...expected) => {
      const problems = validateExpectations(expected, testInfo.title);
      if (problems.length > 0) throw new Error(problems.join('; '));
      allowedFaults.push(...expected);
    });
  },
  faultGuard: [
    async ({ page, allowedFaults }, use, testInfo) => {
      const faults: Fault[] = [];
      const warnings: unknown[] = [];
      // Navigation takes the page's own list with it; the sink keeps every fault.
      await page.exposeFunction('__pjFaultSink', (fault: Omit<Fault, 'kind'> & { kind: Fault['kind'] | 'warning-toast' }) => {
        if (fault.kind === 'warning-toast') warnings.push(fault);
        // console errors come from the browser's own console events below, which also
        // carry the errors the page never logged itself (a failed request).
        else if (fault.kind !== 'console-error') faults.push({ ...fault, kind: fault.kind });
      });
      await page.addInitScript(FAULT_WATCH_SOURCE);
      page.on('console', (msg) => {
        if (msg.type() === 'error') faults.push({ kind: 'console-error', text: msg.text(), at: Date.now() });
      });

      await use();

      const verdict = judgeFaults(faults, allowedFaults);
      await testInfo.attach('faults.json', {
        body: JSON.stringify({ unexpected: verdict.unexpected, expected: verdict.expected, warnings }, null, 2),
        contentType: 'application/json',
      });
      if (verdict.unexpected.length > 0) throw new Error(faultFailure(testInfo.title, verdict.unexpected));
    },
    { auto: true },
  ],
});

export { expect };
export type { Page, Locator, Request } from '@playwright/test';
