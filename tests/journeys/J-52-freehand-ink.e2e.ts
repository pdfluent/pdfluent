// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-52: draw freehand on the page with the Draw tool: the saved file holds an
// Ink annotation on that page.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rawSubtypes } from './lib/pdfcheck';
import { clickAria, save, waitDirty } from './lib/ui';

journey('J-52', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'sketch.pdf');
  await j.start({ open: doc });
  await j.step('draw a stroke', async () => {
    await clickAria(j, 'Draw');
    await j.s.call('drag', '[data-testid="annotation-overlay"]', [80, 120], [260, 200]);
    await waitDirty(j, true);
  });
  await j.step('save: an Ink annotation on page 1', async () => {
    await save(j);
    expect(rawSubtypes(j.inspect(doc), 0)).toContain('Ink');
  });
});
