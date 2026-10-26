// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-33: select text on the page and copy it from the selection toolbar; the
// app says it copied.

import { journey } from './lib/journey';
import { waitForText } from './lib/ui';

journey('J-33', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.step('select a line and press Copy in the selection toolbar', async () => {
    await j.s.call('selectText', '[data-testid="text-span"]');
    await j.waitFor('[data-testid="sel-toolbar-copy"]');
    await j.s.click('[data-testid="sel-toolbar-copy"]');
    await waitForText(j, /copied/i, 10_000);
  });
});
