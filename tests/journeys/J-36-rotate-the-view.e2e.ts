// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-36: rotate the view (not the file) clockwise and back. The editor has no
// view rotation control today: the pages can be rotated in the file (Organize
// pages) but not the view. Listed known gap "view-rotation-missing".

import { expect } from 'vitest';
import { journey } from './lib/journey';

journey('J-36', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.gap('view-rotation-missing', async () => {
    const count = await j.s.call<number>('count', '[aria-label*="Rotate view" i], [data-testid="rotate-view-btn"]');
    expect(count, 'a rotate-view control').toBeGreaterThan(0);
  });
});
