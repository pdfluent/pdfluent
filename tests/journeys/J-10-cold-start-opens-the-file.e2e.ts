// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-10: starting the app with a PDF (a double-click, "Open with", the command
// line) opens that file: its name in the window title, all its pages shown,
// nothing else asked.

import { journey } from './lib/journey';
import { waitForPages, waitTitle } from './lib/ui';

journey('J-10', async (j) => {
  await j.start({ open: 'src-tauri/tests/golden/fixture-sample-text-3p.pdf', as: 'quarterly.pdf' });
  await j.step('the window names the file', () => waitTitle(j, 'quarterly.pdf'));
  await j.step('all three pages are shown', () => waitForPages(j, 3));
});
