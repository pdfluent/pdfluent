// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-54: attach a file to the PDF from the All tools panel; it is listed, and the
// saved file carries an embedded file.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openAllToolsPanel, save, waitDirty } from './lib/ui';

journey('J-54', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'with-file.pdf');
  const extra = j.fixture('src-tauri/tests/fixtures/sample.png', 'evidence.png');
  await j.start({ open: doc });
  await j.step('attach the file', async () => {
    await openAllToolsPanel(j);
    await j.answerNativeDialogs(extra);
    await j.answerDialog('open', extra);
    await j.s.click('[data-testid="add-attachment-btn"]');
    await j.waitFor('[data-testid="attachment-item"]');
    await waitDirty(j, true);
  });
  await j.step('save: the file embeds it', async () => {
    await save(j);
    const r = j.inspect(doc, { needles: ['EmbeddedFile', 'evidence.png'] });
    expect(r.needles[0]?.objects, 'EmbeddedFile object').toBe(true);
    expect(r.needles[1]?.raw_bytes || r.needles[1]?.objects, 'file name in the file').toBe(true);
  });
});
