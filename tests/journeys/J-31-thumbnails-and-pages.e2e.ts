// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-31: the thumbnail strip shows every page and a click on one goes there.
// Bookmarks and links need a fixture with an outline and are not judged here.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep, waitForPages } from './lib/ui';

journey('J-31', async (j) => {
  await j.start({ open: 'src-tauri/tests/golden/fixture-sample-text-3p.pdf' });
  await waitForPages(j, 3);
  await j.step('the thumbnail strip is shown with one tile per page', async () => {
    await j.waitFor('[data-testid="thumbnail-scroll-container"]');
    const tiles = await j.s.call<number>('count', '[data-testid="thumbnail-scroll-container"] button');
    expect(tiles).toBeGreaterThanOrEqual(3);
  });
  await j.step('a click on the third thumbnail goes to page 3', async () => {
    const third = (await j.s.call<string[]>('texts', '[data-testid="thumbnail-scroll-container"] button')).length;
    expect(third).toBeGreaterThanOrEqual(3);
    await j.s.click('[data-testid="thumbnail-scroll-container"] button:nth-of-type(3)');
    await sleep(800);
    const indicator = await j.s.call<string>('text', '[data-testid="floating-page-indicator"]');
    expect(indicator).toMatch(/3\s*\/\s*3/);
  });
});
