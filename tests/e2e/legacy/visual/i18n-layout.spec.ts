// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * i18n Layout Stability Tests — Visual QA Layer 2
 *
 * Runs the same layout assertions in both Dutch and English to ensure
 * longer NL labels (avg. 9% longer, some 120% longer) do not break layout.
 */

import { test, expect } from '@playwright/test';
import { VIEWER_URL, waitForTestHook, loadMockDocument } from '../helpers/app';
import { tid } from '../helpers/selectors';
import { assertNoOverflow, assertNoHorizontalScrollbar } from '../helpers/layout';

/**
 * Navigate to the viewer with a specific locale pre-seeded.
 */
async function gotoViewerWithLocale(page: import('@playwright/test').Page, locale: 'nl' | 'en') {
  await page.addInitScript((lang) => { localStorage.setItem('pdfluent-lang', lang); }, locale);
  await page.goto(VIEWER_URL);
  await page.locator(tid('viewer-empty-state')).waitFor({ state: 'visible', timeout: 15_000 });
}

async function gotoViewerWithDocLocale(page: import('@playwright/test').Page, locale: 'nl' | 'en') {
  await gotoViewerWithLocale(page, locale);
  await waitForTestHook(page);
  await loadMockDocument(page);
}

// Mode labels per locale — NL labels are significantly longer
const MODE_LABELS: Record<string, { nl: string; en: string }> = {
  read: { nl: 'Lezen', en: 'Read' },
  review: { nl: 'Annoteren', en: 'Annotate' },
  edit: { nl: 'Inhoud', en: 'Content' },
  sign: { nl: 'Ondertekenen', en: 'Sign' },
  organize: { nl: 'Indelen', en: 'Organize' },
  forms: { nl: 'Formulieren', en: 'Forms' },
  protect: { nl: 'Beveiligen', en: 'Protect' },
  convert: { nl: 'Converteren', en: 'Convert' },
};

for (const locale of ['nl', 'en'] as const) {
  test.describe(`layout stability [${locale}]`, () => {

    test(`ModeSwitcher tabs fit without overflow [${locale}]`, async ({ page }) => {
      await gotoViewerWithDocLocale(page, locale);
      const switcher = page.locator('.overflow-x-auto').first();
      await expect(switcher).toBeVisible();
      const overflow = await switcher.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`toolbar labels fit without truncation [${locale}]`, async ({ page }) => {
      await gotoViewerWithDocLocale(page, locale);
      // Verify each mode tab is visible and not clipped
      for (const [, labels] of Object.entries(MODE_LABELS)) {
        const label = labels[locale];
        const btn = page.getByRole('button', { name: label, exact: true });
        if (await btn.isVisible()) {
          const box = await btn.boundingBox();
          expect(box, `Mode button "${label}" has no bounding box`).not.toBeNull();
          expect(box!.width, `Mode button "${label}" is too narrow`).toBeGreaterThan(30);
        }
      }
    });

    test(`TopBar does not overflow [${locale}]`, async ({ page }) => {
      await gotoViewerWithDocLocale(page, locale);
      const topbar = page.locator('.h-12.flex.items-center').first();
      await expect(topbar).toBeVisible();
      const overflow = await topbar.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`welcome screen content fits [${locale}]`, async ({ page }) => {
      await gotoViewerWithLocale(page, locale);
      await assertNoOverflow(page, tid('viewer-empty-state'));
      await assertNoHorizontalScrollbar(page);
    });

    test(`no body horizontal scrollbar with document [${locale}]`, async ({ page }) => {
      await gotoViewerWithDocLocale(page, locale);
      await assertNoHorizontalScrollbar(page);
    });
  });
}
