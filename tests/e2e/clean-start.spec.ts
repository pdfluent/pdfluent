// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Browser-mode twin of J-A9: the editor starts, with and without a document,
// and nothing goes wrong on screen or in the console. The guard in
// helpers/guarded-test.ts would fail any spec for such a fault; this one says
// the promise out loud and gives the start-up probes five seconds to answer.

import { expect, test } from './helpers/guarded-test';
import { gotoViewer, gotoViewerWithDoc } from './helpers/app';
import { tid } from './helpers/selectors';

const SETTLE_MS = 5_000;

test('an empty start shows no error toast and logs no console error', async ({ page }) => {
  await gotoViewer(page);
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator(tid('app-error-toast'))).toHaveCount(0);
});

test('a start with a document shows no error toast and logs no console error', async ({ page }) => {
  await gotoViewerWithDoc(page);
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator(tid('app-error-toast'))).toHaveCount(0);
});
