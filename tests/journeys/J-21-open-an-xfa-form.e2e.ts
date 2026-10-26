// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-21: an XFA form opens and shows all its pages, marked as XFA, with the
// way to a standard PDF on offer.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { waitForPages } from './lib/ui';

import { XFA_FIXTURE } from './lib/fixtures';

journey('J-21', async (j) => {
  const doc = j.fixture(XFA_FIXTURE, 'visa-form.pdf');
  const r = j.inspect(doc);
  expect(r.info?.xfa_detected).toBe(true);
  await j.start({ open: doc });
  await j.step('all pages are shown', () => waitForPages(j, r.page_count ?? 0));
  await j.step('the app says it is an XFA form and offers the conversion', async () => {
    await j.waitFor('[data-testid="xfa-experimental-badge"]');
    await j.waitFor('[data-testid="xfa-flatten-btn"]');
  });
});
