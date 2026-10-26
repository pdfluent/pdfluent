// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 05: an XFA form. The fixture is the repository's own golden file
// (src-tauri/tests/golden/MANIFEST.json). Check that its fields hold no real data
// before the shot goes anywhere; the first field is filled with an invented value.

import { scene } from '../lib/scene';
import { XFA_FIXTURE } from '../../journeys/lib/fixtures';
import { fill, waitForPages } from '../../journeys/lib/ui';

scene('05-xfa-form', { journey: 'J-59' }, async (c) => {
  await c.start({ open: XFA_FIXTURE, as: 'Application-XFA.pdf' });
  await waitForPages(c, 1).catch(() => undefined);
  await c.waitFor('[data-testid="xfa-experimental-badge"]');
  const fillable = await c.s.call<boolean>('exists', '[data-testid="xfa-form-overlay"] [data-testid="xfa-field-input"]');
  // Where in-place filling exists the shot shows it; where it does not, the
  // gap is in the manifest (J-59 xfa-fill-in-place) and the compositor stops.
  if (fillable) await fill(c, '[data-testid="xfa-form-overlay"] [data-testid="xfa-field-input"]', 'Mara Lindqvist');
  await c.shot();
});
