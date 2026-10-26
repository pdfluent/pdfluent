// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-84: with Autosave on (the default), unsaved work survives a crash. The
// app writes a recovery copy while there are unsaved changes; after a hard
// kill (no exit path runs, as in a crash or a power cut) the next start offers
// it, Recover brings the change back as unsaved work, and Save puts it in the
// original file.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rotatePageRight, save, sleep, waitDirty, waitForPages } from './lib/ui';

journey('J-84', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'thesis.pdf');
  await j.start({ open: doc });
  await rotatePageRight(j, 0);

  await j.step('the app writes a recovery copy while the change is unsaved', async () => {
    // The copy is written every 30 s (src/viewer/state/recoveryCopy.ts).
    const until = Date.now() + 75_000;
    for (;;) {
      const pending = await j.invoke<unknown>('pending_recovery').catch(() => null);
      if (pending) break;
      if (Date.now() > until) throw new Error('no recovery copy 75 s after the change');
      await sleep(2000);
    }
  });

  await j.step('crash: kill the app', async () => {
    await j.s.kill();
    expect(await j.s.alive()).toBe(false);
    expect(j.inspect(doc).raw.pages?.[0]?.rotate ?? 0).toBe(0);
  });

  await j.step('the next start offers the copy', async () => {
    await j.start({ keepStartupDialogs: true });
    await j.waitFor('[data-testid="recovery-dialog"]', { timeout: 60_000 });
    const name = await j.s.call<string>('text', '[data-testid="recovery-document-name"]');
    expect(name).toContain('thesis.pdf');
  });

  await j.step('Recover brings the change back as unsaved work; Save writes it', async () => {
    await j.s.click('[data-testid="recovery-recover-btn"]');
    await waitForPages(j, 2);
    await waitDirty(j, true);
    await save(j);
    expect(j.inspect(doc).raw.pages?.map((p) => p.rotate)).toEqual([90, 0]);
  });
}, 420_000);
