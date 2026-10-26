// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 11: a picture placed on a page, selected, with its card.

import { scene } from '../lib/scene';
import { DEMO_IMAGE, DEMO_REPORT } from '../lib/demo';
import { openMode } from '../../journeys/lib/ui';

scene('11-page-images', { journey: 'J-45' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await openMode(c, 'Edit');
  await c.answerDialog('open', c.fixture(DEMO_IMAGE));
  await c.s.click('[data-testid="place-image-btn"]');
  await c.s.click('[data-testid="page-view"]');
  await c.waitFor('[data-testid="selected-annotation-card"]');
  await c.shot();
});
