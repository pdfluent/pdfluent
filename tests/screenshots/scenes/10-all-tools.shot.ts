// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 10: the All tools panel.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import { openMode } from '../../journeys/lib/ui';

scene('10-all-tools', { journey: 'J-38' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await openMode(c, 'All tools');
  await c.waitFor('.tool-row');
  await c.shot();
});
