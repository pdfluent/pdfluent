// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-83: Save As writes a new file with the change, leaves the original alone,
// and from then on the app is working on the new file — its name is in the
// window title and the next Save goes there. A Save As that cannot be written
// says so.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rotatePageRight, save, saveAs, waitDirty, waitForText, waitTitle } from './lib/ui';

journey('J-83', async (j) => {
  const original = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'draft.pdf');
  const copy = j.file('final.pdf');
  await j.start({ open: original });

  await j.step('Save As writes the new file with the change', async () => {
    await rotatePageRight(j, 0);
    await saveAs(j, copy);
    await waitDirty(j, false, 30_000);
    expect(j.inspect(copy).raw.pages?.map((p) => p.rotate)).toEqual([90, 0]);
    expect(j.inspect(original).raw.pages?.map((p) => p.rotate)).toEqual([0, 0]);
  });

  await j.step('the window now names the new file', () => waitTitle(j, 'final.pdf', 10_000));

  await j.step('the next Save goes to the new file', async () => {
    await rotatePageRight(j, 1);
    await save(j);
    expect(j.inspect(copy).raw.pages?.map((p) => p.rotate)).toEqual([90, 90]);
    expect(j.inspect(original).raw.pages?.map((p) => p.rotate)).toEqual([0, 0]);
  });

  await j.step('a Save As into a folder that does not exist fails visibly', async () => {
    await rotatePageRight(j, 0);
    await saveAs(j, j.file('no-such-folder/x.pdf'));
    // The app's own words, not the operating system's: a Dutch Windows says
    // "Het systeem kan het opgegeven bestand niet vinden" where macOS says
    // "No such file or directory".
    await waitForText(j, /save failed|could not|cannot access|no such|not found|cannot find|does not exist|failed/i);
    // Said in the app's own message, not in the crash report dialog an
    // unhandled rejection used to open.
    expect(await j.s.call('exists', '[data-testid="report-dialog"]')).toBe(false);
    await waitDirty(j, true);
    expect(await j.s.alive()).toBe(true);
  });
});
