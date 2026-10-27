// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-A3: inside the Mac App Store sandbox the app can touch the file the user
// picked and nothing around it. Open, edit, Save, Save As to a new file and
// Save As over an existing one all work on that footing, and what was saved
// opens again with every value in it.
//
// This is GOV-001. In 1.1.1 a Save As to a new file failed with "Operation not
// permitted" in the store build: the save wrote a temporary file beside the
// target, and the sandbox grants the target only. No journey saw it because
// the suite ran an unsandboxed binary and answered the save panel with a path
// the app could write anyway. This one runs the e2e build inside a bundle
// signed with the store entitlements (lib/sandbox.ts) and grants the app, per
// path, what the open and save panels would: one file, not its folder.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { expectMarked, markDocument, reopenAndVerify } from './lib/savecases';
import { clickText, save, saveAs, waitDirty, waitForText, waitTitle } from './lib/ui';

journey('J-A3', async (j) => {
  const documents = j.file('Documents');
  const downloads = j.file('Downloads');
  const desktop = j.file('Desktop');
  for (const d of [documents, downloads, desktop]) mkdirSync(d);
  const original = path.join(documents, 'Application form.pdf');
  pdfcheck.make('make-form', original);
  const existing = path.join(desktop, 'Already there.pdf');
  copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), existing);
  const placeholder = readFileSync(existing);

  await j.start({ open: original, sandbox: true });

  await j.step('the sandbox is real: a path nobody granted is refused', async () => {
    const stranger = path.join(downloads, 'not granted.pdf');
    // Queued directly, without the grant the panel would have issued.
    await j.invoke('e2e_queue_dialog_answers', { answers: [stranger] });
    await j.s.click('.share-trigger');
    await j.waitFor('[data-testid="save-as-btn"]');
    await j.s.click('[data-testid="save-as-btn"]');
    await waitForText(j, /save failed|failed to save|not permitted|permission|denied|access/i);
    expect(existsSync(stranger)).toBe(false);
  });

  await j.step('Save writes into the file that was opened, with nothing left beside it', async () => {
    await markDocument(j, 'one');
    await save(j);
    expectMarked(j, original, 'one');
    expect(readdirSync(documents)).toEqual(['Application form.pdf']);
  });

  const copy = path.join(downloads, 'Filled in.pdf');
  await j.step('Save As to a NEW file works with access to that file only', async () => {
    await markDocument(j, 'two');
    await saveAs(j, copy);
    await waitDirty(j, false, 30_000);
    expectMarked(j, copy, 'two');
    expect(readdirSync(downloads)).toEqual(['Filled in.pdf']);
    // The first file keeps what the first Save wrote.
    expectMarked(j, original, 'one');
    await waitTitle(j, 'Filled in.pdf', 10_000);
  });

  await j.step('the next Save goes to the new file', async () => {
    await markDocument(j, 'three');
    await save(j);
    expectMarked(j, copy, 'three');
    expect(readdirSync(downloads)).toEqual(['Filled in.pdf']);
  });

  await j.step('Save As over an EXISTING file replaces it', async () => {
    expect(readFileSync(existing).equals(placeholder)).toBe(true);
    await markDocument(j, 'four');
    await saveAs(j, existing);
    await waitDirty(j, false, 30_000);
    expectMarked(j, existing, 'four');
    expect(readdirSync(desktop)).toEqual(['Already there.pdf']);
  });

  await j.step('every file opens again in a new session with its values', async () => {
    await reopenAndVerify(j, original, 'one', 1, { sandbox: true });
    await reopenAndVerify(j, copy, 'three', 1, { sandbox: true });
    await reopenAndVerify(j, existing, 'four', 1, { sandbox: true });
  });

  await j.step('a recent file opens after a restart with nothing granted: the stored bookmark does it', async () => {
    // A new session, no document asked for, so nothing was granted for any file.
    await j.stop();
    await j.start({ noDocument: true, sandbox: true });
    await j.waitFor('.recent-v3', { text: 'Filled in.pdf', timeout: 30_000 });
    await clickText(j, '.recent-v3 .recent-row button', 'Filled in.pdf', false);
    await waitTitle(j, 'Filled in.pdf', 30_000);
    await j.waitForDocument(1);
    expect(await j.s.call<string>('value', '[data-form-field="full_name"]')).toBe('Ada three');
  });
}, 600_000);
