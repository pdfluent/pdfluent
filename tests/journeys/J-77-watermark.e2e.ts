// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-77: a watermark added in the Watermark tool is in the saved file, on the
// pages, and the file's own text is still there.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { clickText, fill, openTool, save, waitForText } from './lib/ui';

const MARK = 'CONFIDENTIAL-J77';

journey('J-77', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'draft.pdf');
  const before = j.inspect(doc, { needles: [MARK] });
  expect(before.needles[0]?.pages ?? [], 'the fixture must not carry the mark yet').toEqual([]);
  await j.start({ open: doc });

  await j.step('add the watermark', async () => {
    await openTool(j, 'Watermark');
    await j.waitFor('[aria-label="Watermark"]');
    await fill(j, '[aria-label="Watermark"]', MARK);
    await clickText(j, 'button', 'Apply watermark', false);
    await waitForText(j, 'Watermark added', 30_000);
  });

  await j.step('save; the mark is in the file and the text is intact', async () => {
    await save(j);
    const r = j.inspect(doc, { needles: [MARK] });
    expect(r.opens).toBe(true);
    expect(r.needles[0]?.pages?.length, 'pages carrying the mark').toBeGreaterThan(0);
    expect(r.pages?.[0]?.text).toContain('Hello Page One');
  });
});
