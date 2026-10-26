// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-50: highlight, underline and strike out text, save: the saved file holds
// standard Highlight, Underline and StrikeOut annotations on that page, as
// any other reader sees them (lopdf, not the editor's own reader).

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rawSubtypes } from './lib/pdfcheck';
import { save, waitDirty } from './lib/ui';

journey('J-50', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'review.pdf');
  await j.start({ open: doc });
  const span = '[data-testid="text-span"]';
  for (const [tool, label] of [['highlight', 'Highlight'], ['underline', 'Underline'], ['strikethrough', 'StrikeOut']] as const) {
    await j.step(`${label}`, async () => {
      await j.s.call('selectText', span);
      await j.waitFor(`[data-testid="sel-toolbar-${tool}"]`);
      await j.s.click(`[data-testid="sel-toolbar-${tool}"]`);
      await waitDirty(j, true);
    });
  }
  await j.step('save: three standard markup annotations on page 1', async () => {
    await save(j);
    const r = j.inspect(doc);
    expect(rawSubtypes(r, 0).sort()).toEqual(['Highlight', 'StrikeOut', 'Underline']);
    expect(rawSubtypes(r, 1)).toEqual([]);
  });
});
