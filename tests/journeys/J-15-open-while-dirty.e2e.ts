// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-15: opening another file while the document has unsaved changes does not
// cost those changes. The file opens in a tab of its own (J-90) and nothing is
// asked: the first document stays open behind it, unsaved, and comes back as
// it was. Nothing is written to the first file.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openViaMenu, rotatePageRight, waitDirty, waitForPages, waitTitle } from './lib/ui';

journey('J-15', async (j) => {
  const first = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'first.pdf');
  const second = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'second.pdf');
  await j.start({ open: first });
  await waitForPages(j, 2);
  await j.step('make a change', () => rotatePageRight(j, 0));

  await j.step('File > Open opens the other file without asking', async () => {
    await openViaMenu(j, second);
    await waitTitle(j, 'second.pdf');
    await waitForPages(j, 3);
    await waitDirty(j, false);
    expect(await j.s.call<boolean>('exists', '[data-testid="unsaved-changes-dialog"]')).toBe(false);
  });

  await j.step('the first document is still there with its change', async () => {
    await j.s.click('[data-testid="document-tab"][data-tab-title="first.pdf"]');
    await waitTitle(j, 'first.pdf');
    await waitForPages(j, 2);
    await waitDirty(j, true);
  });

  await j.step('the first file on disk is as it was', async () => {
    expect(j.inspect(first).raw.pages?.map((p) => p.rotate)).toEqual([0, 0]);
  });
});
