// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 09: a typed signature in a chosen signature font. The name is invented.

import { scene } from '../lib/scene';
import { DEMO_REPORT, SIGNER } from '../lib/demo';
import { fill, openMode } from '../../journeys/lib/ui';

scene('09-signature', { journey: 'J-62' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Services-Agreement.pdf' });
  await openMode(c, 'Sign');
  await c.s.click('[data-testid="add-signature-btn"]');
  await c.waitFor('[data-testid="signature-name-input"]');
  await fill(c, '[data-testid="signature-name-input"]', SIGNER);
  const first = await c.s.call<string | null>('attr', '[data-testid="signature-font-select"] option:nth-of-type(1)', 'value');
  if (first) await c.s.call('setValue', '[data-testid="signature-font-select"]', first);
  await c.waitFor('[data-testid="signature-preview"]');
  await c.shot();
});
