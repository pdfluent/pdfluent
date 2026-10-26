// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-73: rotate, delete and reorder pages in Organize pages, save: the file has
// the new page set in the new order, and every remaining page keeps its text.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openTool, rotatePageRight, save, sleep } from './lib/ui';

journey('J-73', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'pack.pdf');
  const before = j.inspect(doc);
  const page = (i: number): string => before.pages?.[i]?.text ?? '';
  await j.start({ open: doc });
  await openTool(j, 'Organize pages');
  await j.waitFor('[data-testid="organize-page-tile-2"]');

  await j.step('rotate page 1', () => rotatePageRight(j, 0));
  await j.step('delete page 2', async () => {
    await j.answerDialog('message', true);
    await j.s.click('[data-testid="organize-delete-1"]');
    const until = Date.now() + 15_000;
    while (await j.s.call<boolean>('exists', '[data-testid="organize-page-tile-2"]')) {
      if (Date.now() > until) throw new Error('page 2 is still there 15 s after Delete');
      await sleep(200);
    }
  });
  await j.step('save: two pages, page 1 rotated, page 3 now second', async () => {
    await save(j);
    const r = j.inspect(doc);
    expect(r.page_count).toBe(2);
    expect(r.raw.pages?.map((p) => p.rotate)).toEqual([90, 0]);
    expect(r.pages?.[0]?.text).toBe(page(0));
    expect(r.pages?.[1]?.text).toBe(page(2));
  });
});
