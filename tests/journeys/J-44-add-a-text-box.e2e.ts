// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-44: Add a text box on the page. The control exists in the Edit panel's
// code but sits behind LOCAL_OVERLAY_CONTROLS_ENABLED and the "More tools"
// entry for it was removed (EditorV3Shell handleMoreTool). Listed known gap
// "text-box-hidden": the journey looks for the Insert text box button.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openMode } from './lib/ui';

journey('J-44', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.gap('text-box-hidden', async () => {
    await openMode(j, 'Edit');
    const target = await j.s.call<string>('findText', 'button', 'Insert text box', false);
    expect(target).toBeTruthy();
  });
});
