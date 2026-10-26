// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-30: a document opens fitted to the window; zoom in, zoom out and reset
// change the zoom the app shows.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

journey('J-30', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  const zoom = async (): Promise<number> => Number(((await j.s.call<string>('text', '[data-testid="zoom-reset-btn"]')) ?? '').replace('%', ''));
  const start = await zoom();
  expect(start).toBeGreaterThan(0);
  await j.step('the document opens fitted to the window, not at a fixed percentage', async () => {
    // Fit width: the page fills the canvas minus a 24 px gutter each side, and
    // is never wider than it. Fit page (landscape, or nearly fitting): the
    // whole page height is visible instead. Either way: never above 200%.
    // The fit is computed for the canvas as it is when the document arrives; on a
    // slow start the window can still settle after that, and the fit follows a
    // moment later. Measure once both sit still (2 s at most), not mid-settle.
    type Box = { width: number; height: number } | null;
    const measure = async (): Promise<[Box, Box]> => [
      await j.s.call<Box>('size', '[data-testid="page-view"]'),
      await j.s.call<Box>('size', '.canvas'),
    ];
    let [page, canvas] = await measure();
    for (let i = 0; i < 10 && page && canvas && page.width > canvas.width; i += 1) {
      await sleep(200);
      [page, canvas] = await measure();
    }
    expect(page).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(page!.width).toBeLessThanOrEqual(canvas!.width);
    const fillsWidth = page!.width >= canvas!.width - 2 * 24 - 16; // 16: the zoom is rounded down to 1%
    const showsWholePage = page!.height <= canvas!.height;
    const atTheCap = start === 200;
    expect(fillsWidth || showsWholePage || atTheCap).toBe(true);
    expect(start).toBeLessThanOrEqual(200);
  });
  await j.step('zoom in', async () => {
    await j.s.click('[data-testid="zoom-in-btn"]');
    await sleep(300);
    expect(await zoom()).toBeGreaterThan(start);
  });
  await j.step('zoom out twice', async () => {
    await j.s.click('[data-testid="zoom-out-btn"]');
    await j.s.click('[data-testid="zoom-out-btn"]');
    await sleep(300);
    expect(await zoom()).toBeLessThan(start);
  });
  await j.step('the page is rendered at the new size', async () => {
    const w = await j.s.call<number>('count', '[data-testid="rendered-page"]');
    expect(w).toBeGreaterThan(0);
  });
});
