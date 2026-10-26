// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-80: Save writes the change into the file, as one complete file, and a
// save that cannot be written leaves the original intact and says so.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { lock } from './lib/files';
import { rotatePageRight, save, sleep, waitDirty, waitForText } from './lib/ui';

journey('J-80', async (j) => {
  const dir = j.file('docs');
  (await import('node:fs')).mkdirSync(dir);
  const doc = path.join(dir, 'contract.pdf');
  (await import('node:fs')).copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), doc);
  await j.start({ open: doc });

  await j.step('Save writes the change into the same file', async () => {
    await rotatePageRight(j, 0);
    await save(j);
    const r = j.inspect(doc);
    expect(r.opens).toBe(true);
    expect(r.page_count).toBe(2);
    expect(r.raw.pages?.map((p) => p.rotate)).toEqual([90, 0]);
    // Nothing left beside it: no temp file, no half-written copy.
    expect(readdirSync(dir).sort()).toEqual(['contract.pdf']);
  });

  await j.step('a save that cannot be written fails visibly; the file stays as it was', async () => {
    const before = readFileSync(doc);
    await rotatePageRight(j, 1);
    lock(dir, doc, true);
    try {
      await j.s.click('[data-testid="save-btn"]');
      await waitForText(j, /save failed|could not|permission|denied|read-only|access/i);
      await sleep(500);
      await waitDirty(j, true);
      expect(readFileSync(doc).equals(before)).toBe(true);
      expect(await j.s.alive()).toBe(true);
    } finally {
      lock(dir, doc, false);
    }
    expect(readdirSync(dir).sort()).toEqual(['contract.pdf']);
  });
});
