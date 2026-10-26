// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-85: Cmd/Ctrl-Z undoes the last action, whatever it was. Form fields have
// undo; annotations, text edits and page changes do not yet (plan §2.9). The
// annotation case is the known gap measured here.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { save, sleep, waitDirty } from './lib/ui';

journey('J-85', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'draft.pdf');
  await j.start({ open: doc });
  await j.step('highlight a line', async () => {
    await j.s.call('selectText', '[data-testid="text-span"]');
    await j.s.click('[data-testid="sel-toolbar-highlight"]');
    await waitDirty(j, true);
  });
  await j.gap('undo-annotations', async () => {
    await j.s.press('z', [j.mod]);
    await sleep(1000);
    const left = await j.invoke<unknown[]>('get_annotations', { pageIndex: 0 });
    expect(left).toEqual([]);
    await save(j);
    expect(j.inspect(doc).raw.pages?.[0]?.annotations ?? []).toEqual([]);
  });
});
