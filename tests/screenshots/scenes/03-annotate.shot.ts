// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 03: markup and a comment on the demo report.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import { clickAria, fill, waitDirty } from '../../journeys/lib/ui';

scene('03-annotate', { journey: 'J-50' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await c.s.call('selectText', '[data-testid="text-span"]');
  await c.waitFor('[data-testid="sel-toolbar-highlight"]');
  await c.s.click('[data-testid="sel-toolbar-highlight"]');
  await waitDirty(c, true);
  await clickAria(c, 'Note');
  await c.s.click('[data-testid="page-view"]');
  await c.waitFor('[data-testid="comment-edit-textarea"]');
  await fill(c, '[data-testid="comment-edit-textarea"]', 'Check the regional totals before this goes out.');
  await c.shot('comment');
});
