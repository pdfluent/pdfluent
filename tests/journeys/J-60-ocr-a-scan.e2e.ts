// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-60: OCR on a scan gives a searchable PDF: run OCR, save, and the saved
// file has a text layer with the page's words. Locally, without installing
// anything by hand: Tesseract is bundled in every build (owner decision 19-10),
// and the e2e build gets the same bundle (scripts/ci/build-e2e.sh).

import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { clickText, openMode, save, sleep } from './lib/ui';

journey('J-60', async (j) => {
  const scan = j.file('scan.pdf');
  pdfcheck.make('make-scan', j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), scan);
  const before = j.inspect(scan, { needles: ['Hello'] });
  expect(before.needles[0]?.pages, 'the scan fixture must have no text layer').toEqual([]);
  await j.start({ open: scan });

  await openMode(j, 'Convert');
  await clickText(j, '.tool-row', 'OCR', false);
  // OCR of one page: give it a minute, then judge the saved file.
  const until = Date.now() + 60_000;
  while (Date.now() < until && !(await j.s.call<boolean>('exists', '.dirty-dot'))) await sleep(1000);
  await save(j);
  const r = j.inspect(scan, { needles: ['Hello'] });
  expect(r.needles[0]?.pages).toEqual([0]);
});
