// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 04: an AcroForm being filled. The form is made by pdfcheck, fictitious values.

import { scene } from '../lib/scene';
import { FORM_NAME } from '../lib/demo';
import * as pdfcheck from '../../journeys/lib/pdfcheck';
import { fill } from '../../journeys/lib/ui';

scene('04-forms', { journey: 'J-56' }, async (c) => {
  const form = c.file('Application-Form.pdf');
  pdfcheck.make('make-form', form);
  await c.start({ open: form });
  await c.waitFor('[data-testid="form-overlay"]');
  await fill(c, '[data-form-field="full_name"]', FORM_NAME);
  await c.s.click('[data-form-field="agree"]');
  await c.s.call('setValue', '[data-form-field="country"]', 'Belgium');
  await c.shot();
});
