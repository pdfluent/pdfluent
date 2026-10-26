// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-59: "Fill and flatten forms, including legacy XFA" (/pricing, /mac, /faq).
// Open an XFA order form whose total is a script (quantity times unit price),
// type a quantity, watch the script recalculate the total, save, close the app,
// reopen the file and read both values back, then convert the filled form to a
// standard PDF. The read-only reference cannot be typed into.
//
// The recalculation needs the `xfa-interactive` build (the engine's commit
// loop, #406). A build without it writes the quantity and leaves the total
// alone, which fails the recalculation step: that is the promise being held.

import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import { save, sleep, waitDirty, waitForPages, fill } from './lib/ui';
import { XFA_CALC_FIXTURE } from './lib/fixtures';

const QUANTITY = '[data-xfa-field="order.lines.quantity"]';
const TOTAL = '[data-xfa-field="order.lines.total"]';
const REFERENCE = '[data-xfa-field="order.lines.internal_ref"]';

/** Wait until the overlay input `selector` shows `want`. */
async function waitForValue(j: Journey, selector: string, want: string, timeout = 15_000): Promise<void> {
  const until = Date.now() + timeout;
  let got = '';
  for (;;) {
    got = await j.s.call<string>('value', selector);
    if (got === want) return;
    if (Date.now() > until) throw new Error(`${selector} shows ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    await sleep(150);
  }
}

/** Answer the bar that asks whether the form's scripts may run. */
async function agreeToScripts(j: Journey): Promise<void> {
  await j.waitFor('[data-testid="script-consent-bar"]', { timeout: 10_000 });
  await j.s.click('[data-testid="script-consent-run-once"]');
  await j.waitFor('[data-testid="script-consent-bar"]', { state: 'gone' });
}

journey('J-59', async (j) => {
  const doc = j.fixture(XFA_CALC_FIXTURE, 'order.pdf');
  const pages = j.inspect(doc).page_count ?? 0;
  await j.start({ open: doc });
  await waitForPages(j, pages);
  await j.waitFor('[data-testid="xfa-form-overlay"] [data-testid="xfa-field-input"]', { timeout: 10_000 });

  await j.step('the form asks before its scripts run; agreeing runs them', async () => {
    await agreeToScripts(j);
    await waitForValue(j, QUANTITY, '1');
    await waitForValue(j, TOTAL, '5');
  });

  await j.step('a field the form marks read-only cannot be typed into', async () => {
    expect(await j.s.call<boolean>('exists', `${REFERENCE}[readonly]`)).toBe(true);
  });

  await j.step('type a quantity; the script recalculates the total', async () => {
    await fill(j, QUANTITY, '4');
    // Field edits commit on blur.
    await j.s.click('[data-testid="page-view"]');
    await waitDirty(j, true);
    await waitForValue(j, TOTAL, '20');
  });

  await j.step('save', () => save(j));

  await j.step('after a restart the value and the recalculated total are there', async () => {
    await j.stop();
    await j.start({ open: doc });
    await waitForPages(j, pages);
    await j.waitFor('[data-testid="xfa-form-overlay"] [data-testid="xfa-field-input"]', { timeout: 10_000 });
    await agreeToScripts(j); // permission belongs to the open document, not to the file
    await waitForValue(j, QUANTITY, '4');
    await waitForValue(j, TOTAL, '20');
    const model = await j.invoke<{ fields: Array<{ name: string; value: string }> }>('xfa_form_model');
    const value = (name: string) => model.fields.find((f) => f.name === name)?.value;
    expect(value('order.lines.quantity')).toBe('4');
    expect(value('order.lines.total')).toBe('20');
  });

  await j.step('convert the filled form to a standard PDF and save it', async () => {
    await j.s.click('[data-testid="xfa-flatten-btn"]');
    await sleep(1000);
    if (await j.s.call<boolean>('exists', '[data-testid="xfa-flatten-status"]')) {
      throw new Error(`flatten failed: ${await j.s.call<string>('text', '[data-testid="xfa-flatten-status"]')}`);
    }
    await save(j);
    const r = j.inspect(doc);
    expect(r.opens).toBe(true);
    expect(r.info?.xfa_detected).toBe(false);
    expect(r.page_count).toBe(pages);
  });
});
