// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 06: the page organiser, one page selected.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import { openTool } from '../../journeys/lib/ui';

scene('06-page-organiser', { journey: 'J-73' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await openTool(c, 'Organize pages');
  await c.waitFor('[data-testid="organize-page-tile-2"]');
  await c.s.click('[data-testid="organize-page-tile-1"]');
  await c.shot();
});
