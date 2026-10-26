// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-32: search finds every hit and steps through them.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

journey('J-32', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'manual.pdf');
  const pagesWithHit = j.inspect(doc, { needles: ['Lorem'] }).needles[0]?.pages ?? [];
  expect(pagesWithHit.length).toBeGreaterThan(1);
  await j.start({ open: doc });
  await j.step('search', async () => {
    await j.s.click('[data-testid="search-btn"]');
    await j.waitFor('.searchpop input');
    await j.s.call('focus', '.searchpop input');
    await j.s.type('Lorem');
  });
  await j.step('every page with a hit is counted, and Next steps on', async () => {
    let count = '';
    const until = Date.now() + 15_000;
    while (!/^\d+\/\d+$/.test(count)) {
      if (Date.now() > until) throw new Error(`no hit count shown (got "${count}")`);
      await sleep(200);
      count = (await j.s.call<string>('text', '.searchpop .count')) ?? '';
    }
    const total = Number(count.split('/')[1]);
    expect(total).toBeGreaterThanOrEqual(pagesWithHit.length);
    expect(count).toBe(`1/${total}`);
    await j.s.call('click', '.searchpop .row button:last-of-type');
    await sleep(500);
    expect(await j.s.call<string>('text', '.searchpop .count')).toBe(`2/${total}`);
  });
});
