// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-55: delete a comment again: the saved file has no Text annotation left.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rawSubtypes } from './lib/pdfcheck';
import { clickAria, fill, openAllToolsPanel, save, waitDirty } from './lib/ui';

journey('J-55', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'review.pdf');
  await j.start({ open: doc });
  await j.step('add a note', async () => {
    await clickAria(j, 'Note');
    await j.s.click('[data-testid="page-view"]');
    await j.waitFor('[data-testid="comment-edit-textarea"]');
    await fill(j, '[data-testid="comment-edit-textarea"]', 'Remove me');
    await j.s.click('[data-testid="comment-edit-confirm-btn"]');
    await waitDirty(j, true);
  });
  await j.step('delete it from the comments list', async () => {
    await openAllToolsPanel(j);
    await j.answerDialog('message', true);
    await j.s.click('[data-testid="delete-comment-btn"]');
  });
  await j.step('save: no annotation left', async () => {
    await save(j);
    expect(rawSubtypes(j.inspect(doc), 0)).not.toContain('Text');
  });
});
