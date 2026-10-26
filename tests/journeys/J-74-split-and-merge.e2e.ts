// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-74: Split per page writes one PDF per page, each with that page's text;
// Merge files combines the open document with another into one PDF with all
// pages in order.

import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { clickText, openTool, waitForFile, waitForText } from './lib/ui';

journey('J-74', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'bundle.pdf');
  const other = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'annex.pdf');
  const source = j.inspect(doc);
  await j.start({ open: doc });

  await j.step('split per page into a folder', async () => {
    const out = j.file('split');
    mkdirSync(out);
    await openTool(j, 'Split PDF');
    await j.waitFor('.panel[data-panel-open="split"]');
    // The method button itself. The selector was '.panel *', whose first match
    // is the whole panel body: the click landed in its middle, which on
    // Windows is "Back to tools", and the later click on "Split PDF" then
    // found the tool row of that name instead of the button that splits.
    await clickText(j, '.panel button.fmt', 'Split per page', false);
    await j.answerDialog('open', out);
    await clickText(j, '.panel[data-panel-open="split"] button', 'Split PDF', false);
    await waitForText(j, /PDF files? saved|Split failed/, 60_000);
    const files = readdirSync(out).filter((f) => f.endsWith('.pdf')).sort();
    expect(files).toHaveLength(3);
    files.forEach((f, i) => {
      const r = j.inspect(path.join(out, f));
      expect(r.page_count, f).toBe(1);
      expect(r.pages?.[0]?.text, f).toBe(source.pages?.[i]?.text);
    });
  });

  await j.step('merge with another file', async () => {
    const merged = j.file('merged.pdf');
    await openTool(j, 'Merge files');
    await j.answerDialog('open', [other]);
    await clickText(j, '.panel button', 'Add file', false);
    await j.waitFor('.panel', { text: 'annex.pdf' });
    await j.answerDialog('save', merged);
    await clickText(j, '.panel button', 'Merge files', false);
    await waitForFile(merged);
    const r = j.inspect(merged);
    expect(r.page_count).toBe(5);
    expect(r.pages?.[0]?.text).toBe(source.pages?.[0]?.text);
    expect(r.pages?.[3]?.text).toBe(j.inspect(other).pages?.[0]?.text);
  });
});
