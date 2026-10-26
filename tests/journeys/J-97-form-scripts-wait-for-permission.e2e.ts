// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-97: a form with scripts opens and can be filled, and its scripts wait for
// the user. The bar asks; "Don't run" and "Run for this document" are
// remembered for the file while the app runs; nothing is calculated before
// the answer. The fixture form_scripts.pdf has a format action on price and a
// calculate action on total. The Rust half is
// src-tauri/tests/form_scripts_consent.rs.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { fill, sleep } from './lib/ui';

const field = (name: string): string => `[data-form-field="${name}"]`;
const BAR = '[data-testid="script-consent-bar"]';

interface Scripts { total: number; allowed: boolean; contentHash: string }

journey('J-97', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/form_scripts.pdf', 'order.pdf');
  await j.start({ open: doc });
  await j.waitFor('[data-testid="form-overlay"]');

  await j.step('the form opens, the bar asks, and nothing has run', async () => {
    await j.waitFor(BAR);
    const detail = await j.s.call<string[]>('texts', '[data-testid="script-consent-detail"]');
    expect(detail.join(' ')).toContain('Scripts found: 2');
    const s = await j.invoke<Scripts>('get_form_scripts');
    expect(s.total).toBe(2);
    expect(s.allowed).toBe(false);
  });

  await j.step('the form can be filled and nothing is calculated', async () => {
    await fill(j, field('qty'), '3');
    await fill(j, field('price'), '4');
    await j.s.click('[data-testid="page-view"]');
    await sleep(500);
    expect(await j.s.call<string>('value', field('qty'))).toBe('3');
    expect(await j.s.call<string>('value', field('total'))).toBe('');
  });

  await j.step('"Don\'t run" closes the bar and the scripts stay blocked', async () => {
    await j.s.click('[data-testid="script-consent-dont-run"]');
    await j.waitFor(BAR, { state: 'gone' });
    expect((await j.invoke<Scripts>('get_form_scripts')).allowed).toBe(false);
  });

  await j.step('a new app run asks again; "Run for this document" gives permission', async () => {
    await j.stop();
    await j.start({ open: doc });
    await j.waitFor(BAR);
    await j.s.click('[data-testid="script-consent-run-once"]');
    await j.waitFor(BAR, { state: 'gone' });
    expect((await j.invoke<Scripts>('get_form_scripts')).allowed).toBe(true);
  });
});
