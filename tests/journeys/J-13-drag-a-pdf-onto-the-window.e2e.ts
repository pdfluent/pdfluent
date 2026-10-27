// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-13: a PDF dropped on the window opens, and a second one opens next to it.
//
// The operating system's drop cannot be made from outside the app, so the
// journey sends the event the web view would raise for a drop, and the app's
// own handler (hooks/useDragDrop.ts) does the rest: it opens each dropped PDF
// in a tab, in the order dropped, and ignores what is not a PDF. On macOS the
// app runs in the store sandbox and the file is granted the way a real drop
// grants it: that one file. Opening a dropped file that was never granted is
// the failure this would catch.

import { copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep, waitForPages, waitTitle } from './lib/ui';

journey('J-13', async (j) => {
  const sandbox = process.platform === 'darwin';
  const first = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'dropped one.pdf');
  const second = path.join(j.work, 'dropped två.pdf');
  copyFileSync(first, second);
  const notPdf = path.join(j.work, 'notes.txt');
  writeFileSync(notPdf, 'not a pdf');

  await j.start({ noDocument: true, sandbox });
  await j.waitFor('[data-testid="welcome-screen"]');

  const drop = (...paths: string[]): Promise<unknown> =>
    j.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths, position: { x: 200, y: 200 } } });

  await j.step('a dropped PDF opens', async () => {
    await j.allow(first);
    await drop(first);
    await waitForPages(j, 2);
    await waitTitle(j, 'dropped one.pdf');
    expect(await j.s.alive()).toBe(true);
  });

  await j.step('a second drop opens a second document, and a non-PDF is ignored', async () => {
    await j.allow(second, notPdf);
    await drop(notPdf, second);
    await waitTitle(j, 'dropped två.pdf', 30_000);
    await waitForPages(j, 2);
    await sleep(500);
    expect(await j.s.call<number>('count', '.dirty-dot')).toBe(0);
  });
});
