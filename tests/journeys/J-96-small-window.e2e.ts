// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-96: at 1024x640 the controls a person needs are all still on screen.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

journey('J-96', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.step('resize the window to 1024x640', async () => {
    await j.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1024, height: 640 } } });
    await sleep(800);
  });
  await j.step('save, zoom, search and the page are visible', async () => {
    for (const id of ['save-btn', 'zoom-in-btn', 'search-btn', 'page-view']) {
      expect(await j.s.call<boolean>('visible', `[data-testid="${id}"]`), id).toBe(true);
    }
  });
  await j.step('the page is refitted to the smaller window (nobody zoomed by hand)', async () => {
    const page = await j.s.call<{ width: number } | null>('size', '[data-testid="page-view"]');
    const canvas = await j.s.call<{ width: number } | null>('size', '.canvas');
    expect(page!.width).toBeLessThanOrEqual(canvas!.width);
  });
});
