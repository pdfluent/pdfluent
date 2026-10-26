// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Scene 02: editing a line in place, with a system font chosen in the font picker.
// The picker is a native <select>; its open list is not part of the page, so the
// shot shows the chosen font in the picker and on the line.

import { scene } from '../lib/scene';
import { DEMO_REPORT } from '../lib/demo';
import { LINE_NEW, LINE_OLD } from '../lib/demo';
import { pickTypeface } from '../lib/steps';
import { editLine } from '../../journeys/lib/ui';

scene('02-edit-text-fonts', { journey: 'J-43' }, async (c) => {
  await c.start({ open: DEMO_REPORT, as: 'Quarterly-Operations-Report.pdf' });
  await editLine(c, LINE_OLD, LINE_NEW);
  await c.waitFor('[data-testid="edit-typeface"]');
  await pickTypeface(c);
  await c.shot();
});
