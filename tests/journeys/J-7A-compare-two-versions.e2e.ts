// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-7A: "Compare two versions" (/vs-adobe-acrobat ✓). There is no compare
// control in the app (toolbar.compare had no action, plan §2.8); a known gap
// with its owner until it is built or the promise is taken down.

import { journey } from './lib/journey';
import { openTool } from './lib/ui';

journey('J-7A', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.gap('no-compare', async () => {
    await openTool(j, 'Compare');
  });
});
