// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 07: the export dialog. Markdown and tables-to-Excel are labelled Preview
// in the app; the shot shows the dialog as it is.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
scene('07-export-markdown-excel', { journey: 'J-70' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await c.s.click('.share-trigger');
  await c.waitFor('[data-testid="export-btn"]');
  await c.s.click('[data-testid="export-btn"]');
  await c.waitFor('[data-testid="export-dialog"]');
  await c.s.call('setValue', '[data-testid="export-format-select"]', 'markdown');
  await c.shot('markdown');
  await c.s.call('setValue', '[data-testid="export-format-select"]', 'tables_xlsx');
  await c.shot('excel');
});
