// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-14: a file you opened is in Recent once the document is closed, also
// after a restart, and clicking it opens that file again.

import { journey } from './lib/journey';
import { clickText, waitForPages, waitTitle } from './lib/ui';

journey('J-14', async (j) => {
  const name = `recent-${Date.now().toString(36)}.pdf`;
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', name);
  await j.start({ open: doc });
  await waitForPages(j, 2);

  await j.step('close the document; it is listed under Recent', async () => {
    await j.s.click('.more-trigger');
    await clickText(j, '.topbar-more-menu .dd-item', 'Close document', false);
    await j.waitFor('.recent-v3', { text: name });
  });

  await j.step('after a restart it is still there, and opens', async () => {
    await j.stop();
    await j.start();
    await j.waitFor('.recent-v3', { text: name, timeout: 30_000 });
    await clickText(j, '.recent-v3 .recent-row button', name, false);
    await waitTitle(j, name);
    await waitForPages(j, 2);
  });
});
