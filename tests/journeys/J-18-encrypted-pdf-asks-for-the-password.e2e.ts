// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-18: a PDF with a user password asks for it. A wrong password says so and
// asks again; the right one opens the document. The password is not written
// anywhere the suite can find (app log, work folder).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { fill, waitForPages, waitTitle } from './lib/ui';

const USER = 'open-sesame-7';

journey('J-18', async (j) => {
  const doc = j.file('locked.pdf');
  pdfcheck.make('make-encrypted', j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), doc, USER, 'owner-key-7');
  expect(j.inspect(doc).needs_password).toBe(true);

  await j.start({ open: doc, noDocument: true });

  await j.step('the app asks for the password', () => j.waitFor('[data-testid="password-prompt-dialog"]', { timeout: 30_000 }));

  await j.step('a wrong password is refused and the app asks again', async () => {
    await fill(j, '[data-testid="password-prompt-input"]', 'not-it');
    await j.s.click('[data-testid="password-prompt-open-btn"]');
    await j.waitFor('[data-testid="password-prompt-retry"]');
    expect(await j.s.call('exists', '[data-has-document="true"]')).toBe(false);
  });

  await j.step('the right password opens it', async () => {
    await fill(j, '[data-testid="password-prompt-input"]', USER);
    await j.s.click('[data-testid="password-prompt-open-btn"]');
    await j.waitFor('[data-testid="password-prompt-dialog"]', { state: 'gone' });
    await waitForPages(j, 2);
    await waitTitle(j, 'locked.pdf');
  });

  await j.step('the password was not written down', async () => {
    const leaks: string[] = [];
    const locked: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && !p.endsWith('.pdf')) {
          try {
            if (readFileSync(p).includes(USER)) leaks.push(p);
          } catch (err) {
            // Windows: the running web view holds files of its own profile
            // (Cookies, lockfile, leveldb LOCK) open exclusively. Those are
            // Chromium's, not the app's; anything else that cannot be read is
            // a failure of this step.
            const code = (err as NodeJS.ErrnoException).code;
            // A file listed and then gone (the web view deletes its own journals,
            // e.g. DIPS-journal, while the walk is under way) holds nothing now:
            // it cannot be a leak, and it is not a failure to scan it.
            if (code === 'ENOENT') continue;
            const busy = code === 'EBUSY' && p.includes(`${path.sep}webview2${path.sep}`);
            if (!busy) throw err;
            locked.push(p);
          }
        }
      }
    };
    walk(j.work);
    if (locked.length > 0) j.note(`${locked.length} web view profile files were locked by the running web view and not read`);
    // The bridge scripts carry what the suite typed; they are the harness, not the app.
    expect(leaks.filter((p) => !p.includes(`${path.sep}bridge${path.sep}`))).toEqual([]);
  });
});
