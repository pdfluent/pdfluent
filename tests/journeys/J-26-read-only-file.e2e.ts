// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-26: a file the user may not write opens normally; Save fails with a
// message, the change stays, and Save As to a writable place keeps the work.

import { chmodSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { lock } from './lib/files';
import { rotatePageRight, saveAs, waitDirty, waitForPages, waitForText } from './lib/ui';

journey('J-26', async (j) => {
  const dir = j.file('archive');
  mkdirSync(dir);
  const doc = path.join(dir, 'policy.pdf');
  copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), doc);
  lock(dir, doc, true);
  try {
    const before = readFileSync(doc);
    await j.start({ open: doc });
    await waitForPages(j, 2);
    await rotatePageRight(j, 0);
    await j.step('Save fails visibly and keeps the change', async () => {
      await j.s.click('[data-testid="save-btn"]');
      await waitForText(j, /save failed|could not|permission|denied|read-only|access/i);
      await waitDirty(j, true);
      expect(readFileSync(doc).equals(before)).toBe(true);
    });
    await j.step('Save As to a writable folder keeps the work', async () => {
      const copy = j.file('policy-copy.pdf');
      await saveAs(j, copy);
      await waitDirty(j, false, 30_000);
      expect(j.inspect(copy).raw.pages?.[0]?.rotate).toBe(90);
    });
  } finally {
    lock(dir, doc, false);
    chmodSync(dir, 0o755);
  }
});
