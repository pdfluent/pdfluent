// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Multi-Viewport Visual Tests — Visual QA Layer 3
 *
 * Layout assertions + screenshots at three representative viewport sizes.
 * Catches responsive breakage and scaling issues.
 */

import { test, expect } from '@playwright/test';
import { gotoViewerWithDoc } from '../helpers/app';
import { tid } from '../helpers/selectors';
import {
  assertNoHorizontalScrollbar,
  assertImageLoaded,
  assertMinimumSize,
} from '../helpers/layout';

const VIEWPORTS = [
  { name: 'small', width: 1024, height: 768 },
  { name: 'standard', width: 1440, height: 900 },
  { name: 'full-hd', width: 1920, height: 1080 },
] as const;

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.01, animations: 'disabled' as const };

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`screenshot baseline [${vp.name}]`, async ({ page }) => {
      await gotoViewerWithDoc(page);
      await expect(page).toHaveScreenshot(`viewport-${vp.name}.png`, SCREENSHOT_OPTS);
    });

    test(`no horizontal scrollbar [${vp.name}]`, async ({ page }) => {
      await gotoViewerWithDoc(page);
      await assertNoHorizontalScrollbar(page);
    });

    test(`rendered page image loads [${vp.name}]`, async ({ page }) => {
      await gotoViewerWithDoc(page);
      await assertImageLoaded(page, tid('rendered-page'));
    });

    test(`rendered page proportional to viewport [${vp.name}]`, async ({ page }) => {
      await gotoViewerWithDoc(page);
      // Page should be at least 15% of viewport width and 25% of viewport height
      await assertMinimumSize(
        page,
        tid('rendered-page'),
        Math.round(vp.width * 0.15),
        Math.round(vp.height * 0.25),
      );
    });

    test(`floating controls within viewport [${vp.name}]`, async ({ page }) => {
      await gotoViewerWithDoc(page);
      const zoomBtn = page.locator(tid('zoom-reset-btn'));
      await expect(zoomBtn).toBeVisible();
      const box = await zoomBtn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    });
  });
}
