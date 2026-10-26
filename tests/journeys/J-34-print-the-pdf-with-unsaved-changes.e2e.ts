// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-34: Print prints the PDF — the document as it is on screen, unsaved
// changes included — not the web view around it. The e2e build captures the
// copy the system print panel would receive (PDFLUENT_E2E_PRINT_CAPTURE, see
// src-tauri/src/e2e.rs); the panel itself is the OS's and is not driven.

import { existsSync, readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { clickText, rotatePageRight, sleep } from './lib/ui';

journey('J-34', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'handout.pdf');
  const text = allText(j.inspect(doc));
  await j.start({ open: doc });
  await rotatePageRight(j, 1);

  await j.step('More > Print', async () => {
    await j.s.click('.more-trigger');
    await clickText(j, '.topbar-more-menu .dd-item', 'Print', false);
  });

  await j.step('the print copy is the PDF with the unsaved change', async () => {
    const capture = j.file('print-capture.txt');
    const until = Date.now() + 30_000;
    while (!existsSync(capture)) {
      if (Date.now() > until) throw new Error('nothing was handed to the print path within 30 s');
      await sleep(200);
    }
    const copy = readFileSync(capture, 'utf8').trim();
    const r = j.inspect(copy);
    expect(r.opens).toBe(true);
    expect(r.page_count).toBe(3);
    expect(r.raw.pages?.map((p) => p.rotate)).toEqual([0, 90, 0]);
    expect(allText(r)).toBe(text);
    // The file on disk was not saved to get there.
    expect(j.inspect(doc).raw.pages?.map((p) => p.rotate)).toEqual([0, 0, 0]);
  });
});
