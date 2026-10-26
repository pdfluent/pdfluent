// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 08: OCR on a scan. A scan has no text layer; OCR is built into every
// build (nothing to download or confirm), so pressing OCR in the Convert panel
// runs at once and the shot is the panel after the run, with the "last run" line
// that says how many pages and words were added as searchable text.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import * as pdfcheck from '../../journeys/lib/pdfcheck';
import { clickText, openMode } from '../../journeys/lib/ui';

scene('08-ocr', { journey: 'J-60' }, async (c) => {
  const scan = c.file('Scanned-Report.pdf');
  pdfcheck.make('make-scan', c.fixture(DEMO_REPORT, 'source.pdf'), scan);
  await c.start({ open: scan });
  await openMode(c, 'Convert');
  await clickText(c, '.tool-row', 'OCR', false);
  await c.waitFor('[data-testid="ocr-last-report"]', { timeout: 120_000 });
  await c.shot('result');
});
