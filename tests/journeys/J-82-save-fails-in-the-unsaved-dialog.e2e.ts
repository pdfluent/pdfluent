// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-82: when Save in the unsaved-changes dialog fails, the action that asked
// (here: closing the window) does not go ahead. The app stays open with the
// change, the failure is on screen, and the file is as it was.

import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { lock } from './lib/files';
import { closeWindow, rotatePageRight, sleep, waitDirty, waitForText } from './lib/ui';

journey('J-82', async (j) => {
  const dir = j.file('locked');
  mkdirSync(dir);
  const doc = path.join(dir, 'minutes.pdf');
  copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), doc);
  await j.start({ open: doc });
  await rotatePageRight(j, 0);
  const before = readFileSync(doc);

  lock(dir, doc, true);
  try {
    await j.step('close asks; Save fails', async () => {
      await closeWindow(j);
      await j.waitFor('[data-testid="unsaved-changes-dialog"]');
      await j.s.click('[data-testid="unsaved-save-btn"]');
      await waitForText(j, /save failed|could not|permission|denied|read-only|access/i);
    });
    await j.step('the app did not close and still holds the change', async () => {
      await sleep(2000);
      expect(await j.s.alive()).toBe(true);
      await waitDirty(j, true);
      expect(await j.backendDirty()).toBe(true);
      expect(readFileSync(doc).equals(before)).toBe(true);
    });
  } finally {
    lock(dir, doc, false);
  }
});
