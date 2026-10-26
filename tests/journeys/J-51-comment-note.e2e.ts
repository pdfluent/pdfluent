// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-51: add a sticky note with the Note tool: the saved file holds a Text
// annotation on that page with the comment as its contents.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rawSubtypes } from './lib/pdfcheck';
import { clickAria, fill, save, waitDirty } from './lib/ui';

journey('J-51', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'review.pdf');
  await j.start({ open: doc });
  await j.step('place a note and write the comment', async () => {
    await clickAria(j, 'Note');
    await j.s.click('[data-testid="page-view"]');
    await j.waitFor('[data-testid="comment-edit-textarea"]');
    await fill(j, '[data-testid="comment-edit-textarea"]', 'Check the totals on this page');
    await j.s.click('[data-testid="comment-edit-confirm-btn"]');
    await waitDirty(j, true);
  });
  await j.step('save: a Text annotation with the comment', async () => {
    await save(j);
    const r = j.inspect(doc);
    expect(rawSubtypes(r, 0)).toContain('Text');
    const note = r.raw.pages?.find((p) => p.page === 0)?.annotations.find((a) => a.subtype === 'Text');
    expect(note?.contents ?? '').toContain('Check the totals');
  });
});
