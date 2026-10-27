// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-B2: a save that cannot be written keeps the document. A file the user may
// not write, a disk that fills up halfway (the e2e build fails the write on
// request, through the real save path), and on Windows a file another program
// holds open. In each case the person is told, the file on disk is byte for
// byte what it was, nothing is left beside it, the document stays unsaved in
// the app, and the next attempt works once the cause is gone.

import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { lock } from './lib/files';
import * as pdfcheck from './lib/pdfcheck';
import { expectMarked, holdOpen, markDocument } from './lib/savecases';
import { save, saveAs, sleep, waitDirty, waitForText } from './lib/ui';

const FAILED = /save failed|failed to save|could not|denied|read-only|no space|another program|permission|access/i;

journey('J-B2', async (j) => {
  const sandbox = process.platform === 'darwin';
  const dir = j.file('Documents');
  mkdirSync(dir);
  const doc = path.join(dir, 'Contract.pdf');
  pdfcheck.make('make-form', doc);
  const first = readFileSync(doc);
  await j.start({ open: doc, sandbox });

  await j.step('a read-only file: Save says so, the file is untouched, the work stays unsaved', async () => {
    await markDocument(j, 'ro');
    lock(dir, doc, true);
    try {
      await j.s.click('[data-testid="save-btn"]');
      await waitForText(j, FAILED);
      await sleep(500);
      await waitDirty(j, true);
      // The words are all on screen: a long message wraps inside the toast and
      // the toast stays inside the window (a Dutch notice was cut off at the edge).
      expect(await j.s.call<string[]>('textOverflow', '[data-testid="app-error-toast"]')).toEqual([]);
      expect(readFileSync(doc).equals(first)).toBe(true);
      expect(readdirSync(dir)).toEqual(['Contract.pdf']);
    } finally {
      lock(dir, doc, false);
    }
  });

  await j.step('the same Save works once the file is writable again', async () => {
    await save(j);
    expectMarked(j, doc, 'ro');
  });

  const afterRo = readFileSync(doc);
  await j.step('a full disk during Save: the file keeps what it had, nothing is left beside it', async () => {
    await markDocument(j, 'full');
    await j.invoke('e2e_inject_write_failure', { name: 'Contract.pdf', count: 1 });
    await j.s.click('[data-testid="save-btn"]');
    await waitForText(j, /no space|save failed|failed to save|could not/i);
    await sleep(500);
    await waitDirty(j, true);
    expect(readFileSync(doc).equals(afterRo)).toBe(true);
    expect(readdirSync(dir)).toEqual(['Contract.pdf']);
    expect(await j.s.alive()).toBe(true);
  });

  await j.step('and the retry saves it', async () => {
    await save(j);
    expectMarked(j, doc, 'full');
  });

  await j.step('a full disk during Save As to a new file leaves no file behind', async () => {
    const target = path.join(dir, 'New copy.pdf');
    await markDocument(j, 'copy');
    await j.invoke('e2e_inject_write_failure', { name: 'New copy.pdf', count: 1 });
    await saveAs(j, target);
    await waitForText(j, /no space|save failed|failed to save|could not/i);
    await sleep(500);
    expect(readdirSync(dir)).toEqual(['Contract.pdf']);
    await waitDirty(j, true);
    await saveAs(j, target);
    await waitDirty(j, false, 30_000);
    expectMarked(j, target, 'copy');
  });

  await j.step('a full disk during Save As over an existing file keeps the old file whole', async () => {
    const target = path.join(dir, 'Old version.pdf');
    copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'seed.pdf'), target);
    const old = readFileSync(target);
    await markDocument(j, 'over');
    await j.invoke('e2e_inject_write_failure', { name: 'Old version.pdf', count: 1 });
    await saveAs(j, target);
    await waitForText(j, /no space|save failed|failed to save|could not/i);
    await sleep(500);
    expect(readFileSync(target).equals(old)).toBe(true);
  });

  if (process.platform === 'win32') {
    for (const share of ['None', 'Read'] as const) {
      await j.step(`a file another program holds open (FileShare.${share}): Save says so and nothing is lost`, async () => {
        await markDocument(j, `held${share}`);
        const before = readFileSync(doc);
        const held = await holdOpen(doc, share);
        try {
          await j.s.click('[data-testid="save-btn"]');
          await waitForText(j, /another program|denied|access|being used|could not|save failed/i, 30_000);
          await waitDirty(j, true);
          expect(readFileSync(doc).equals(before)).toBe(true);
        } finally {
          held.release();
        }
        await sleep(1000);
        await save(j);
        expectMarked(j, doc, `held${share}`);
      });
    }
  }
}, 900_000);
