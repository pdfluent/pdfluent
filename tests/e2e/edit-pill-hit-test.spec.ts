// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-40 product bug: in a 1028x729 window the floating edit pill's Save button
// was clipped by the page (.page is overflow:hidden) and a click on it landed
// on div.canvas. jsdom has no layout, so the hit test runs in a browser against
// the real pill and the real shell stylesheet (tests/e2e/harness/edit-pill.*).

import { test, expect, type Page } from './helpers/guarded-test';
import { tid } from './helpers/selectors';

const POSITIONS = [
  { name: 'centre of the page', query: 'top=300&left=300' },
  { name: 'paragraph near the page top (pill flips below)', query: 'top=10&left=300' },
  { name: 'paragraph at the left edge', query: 'top=300&left=0' },
  { name: 'paragraph low and right (pill past the page edge)', query: 'top=700&left=330' },
];

async function openHarness(page: Page, query: string): Promise<void> {
  await page.goto(`/tests/e2e/harness/edit-pill.html?${query}`);
  await page.locator(tid('text-edit-save-btn')).waitFor({ state: 'visible', timeout: 15_000 });
}

test.use({ viewport: { width: 1028, height: 729 } });

for (const pos of POSITIONS) {
  test(`edit pill Save is hit-testable and clickable: ${pos.name}`, async ({ page }) => {
    await openHarness(page, pos.query);
    const save = page.locator(tid('text-edit-save-btn'));

    const hit = await save.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        isSave: !!top && (top === el || el.contains(top)),
        what: top ? (top.getAttribute('data-testid') ?? `${top.tagName.toLowerCase()}.${top.getAttribute('class') ?? ''}`) : 'nothing',
        inView: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      };
    });
    expect(hit.what.startsWith('text-edit-save-btn') || hit.isSave, `Save is covered by ${hit.what}`).toBe(true);
    expect(hit.inView, 'Save lies inside the window').toBe(true);

    // A real mouse click, not a dispatched event: the bridge in the journeys
    // never notices an overlay, a mouse does.
    await page.mouse.click(
      ...(await save.evaluate((el): [number, number] => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })),
    );
    expect(await page.evaluate(() => (window as unknown as { __committed?: number }).__committed)).toBe(1);
  });
}

test('edit pill stays reachable after the canvas scrolls', async ({ page }) => {
  await openHarness(page, 'top=300&left=300');
  await page.locator('.canvas').evaluate((el) => { el.scrollTop = 120; });
  await expect.poll(() => page.locator(tid('text-edit-save-btn')).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  })).toBe(true);
});
