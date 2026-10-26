// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-81: closing the window, or quitting, with unsaved changes asks Save /
// Don't save / Cancel, and the answer is what happens — to the app and to the
// file on disk.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { closeWindow, menu, rotatePageRight, sleep, waitDirty } from './lib/ui';

const FIXTURE = 'src-tauri/tests/fixtures/two_pages.pdf';

journey('J-81', async (j) => {
  const doc = j.fixture(FIXTURE, 'report.pdf');
  await j.start({ open: doc });
  await j.step('make a change', () => rotatePageRight(j, 0));

  await j.step('the close button asks', async () => {
    await closeWindow(j);
    await j.waitFor('[data-testid="unsaved-changes-dialog"]');
  });

  await j.step('Cancel keeps the app, the document and the change', async () => {
    await j.s.click('[data-testid="unsaved-cancel-btn"]');
    await j.waitFor('[data-testid="unsaved-changes-dialog"]', { state: 'gone' });
    await sleep(1000);
    expect(await j.s.alive()).toBe(true);
    await waitDirty(j, true);
    expect(j.inspect(doc).raw.pages?.[0]?.rotate ?? 0).toBe(0);
  });

  await j.step('Quit asks too', async () => {
    await menu(j, 'app_quit');
    await j.waitFor('[data-testid="unsaved-changes-dialog"]');
  });

  await j.step("Don't save closes the app and leaves the file as it was", async () => {
    await j.s.click('[data-testid="unsaved-discard-btn"]');
    const until = Date.now() + 15_000;
    while (await j.s.alive()) {
      if (Date.now() > until) throw new Error("the app was still running 15 s after Don't save");
      await sleep(200);
    }
    const r = j.inspect(doc);
    expect(r.opens).toBe(true);
    expect(r.raw.pages?.map((p) => p.rotate)).toEqual([0, 0]);
  });

  await j.step('Save at the close writes the change, then closes', async () => {
    await j.start({ open: doc });
    await rotatePageRight(j, 1);
    await closeWindow(j);
    await j.waitFor('[data-testid="unsaved-changes-dialog"]');
    await j.s.click('[data-testid="unsaved-save-btn"]');
    const until = Date.now() + 20_000;
    while (await j.s.alive()) {
      if (Date.now() > until) throw new Error('the app was still running 20 s after Save at the close');
      await sleep(200);
    }
    expect(j.inspect(doc).raw.pages?.map((p) => p.rotate)).toEqual([0, 90]);
  });
});
