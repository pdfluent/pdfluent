// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 01: a document open in the viewer, thumbnails on the left. The calm first frame.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import { waitForPages } from '../../journeys/lib/ui';

scene('01-open-document', { journey: 'J-10' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await waitForPages(c, 3);
  await c.shot();
});
