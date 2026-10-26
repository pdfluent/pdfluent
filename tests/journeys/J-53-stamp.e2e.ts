// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-53: place a stamp ("Approved", "Draft", ...). There is no stamp tool: the
// tile in All tools is hidden because it has no handler (EditorV3Shell,
// handleMoreTool comment). Listed known gap "stamps-missing".

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openMode } from './lib/ui';

journey('J-53', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.gap('stamps-missing', async () => {
    await openMode(j, 'All tools');
    const n = await j.s.call<number>('count', '.tool-row');
    expect(n).toBeGreaterThan(0);
    const target = await j.s.call<string>('findText', '.tool-row', 'Stamp', false);
    expect(target).toBeTruthy();
  });
});
