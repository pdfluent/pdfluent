// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-72: Convert to PDF/A writes a new file that declares the conformance level
// in its XMP, and the source document is left as it was.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { clickText, openTool, waitForFile } from './lib/ui';

journey('J-72', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'archive-me.pdf');
  const out = j.file('archive-me-pdfa.pdf');
  await j.start({ open: doc });

  await j.step('convert to PDF/A-2b', async () => {
    await openTool(j, 'PDF/A');
    await j.waitFor('[data-testid="pdfa-level-select"]');
    await j.s.call('setValue', '[data-testid="pdfa-level-select"]', '2b');
    await j.answerDialog('save', out);
    await clickText(j, 'button', 'Save as PDF/A', false);
    await waitForFile(out, 120_000);
  });

  await j.step('the copy declares PDF/A, the original does not', async () => {
    const r = j.inspect(out, { needles: ['pdfaid:part', 'pdfaid:conformance'] });
    expect(r.opens).toBe(true);
    expect(r.needles[0]?.raw_bytes || r.needles[0]?.objects, 'pdfaid:part in the copy').toBe(true);
    expect(j.inspect(doc, { needles: ['pdfaid:part'] }).needles[0]?.raw_bytes).toBe(false);
    expect(r.page_count).toBe(2);
  });
});
