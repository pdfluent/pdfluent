// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-58: flatten an AcroForm so its values become page content. Only XFA forms
// have a flatten control (xfa-flatten-btn); an AcroForm has none. Listed known
// gap "acroform-flatten-missing".

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

journey('J-58', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/sample_acroform.pdf', 'form.pdf');
  await j.start({ open: doc });
  await j.gap('acroform-flatten-missing', async () => {
    await sleep(500);
    const target = await j.s.call<string>('findText', 'button', 'Flatten', false);
    expect(target).toBeTruthy();
  });
});
