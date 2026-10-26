// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90: two documents are open at once, each in its own tab, each with its own
// changes. Opening a second file does not replace the first, switching tabs
// brings each back as it was, closing one with unsaved changes asks first and
// leaves the other alone, and saving one saves only that one.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { openViaMenu, rotatePageRight, save, waitDirty, waitForPages, waitTitle } from './lib/ui';
import type { Journey } from './lib/journey';

const TAB = '[data-testid="document-tab"]';

function tab(fileName: string): string {
  return `${TAB}[data-tab-title="${fileName}"]`;
}

async function tabCount(j: Journey): Promise<number> {
  return j.s.call<number>('count', TAB);
}

journey('J-90', async (j) => {
  const first = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'first.pdf');
  const second = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'second.pdf');
  await j.start({ open: first });
  await waitForPages(j, 2);

  await j.step('with one document there is no tab strip', async () => {
    expect(await tabCount(j)).toBe(0);
  });

  await j.step('opening a second file adds a tab and keeps the first open', async () => {
    await openViaMenu(j, second);
    await waitTitle(j, 'second.pdf');
    await waitForPages(j, 3);
    await j.waitFor(tab('first.pdf'));
    await j.waitFor(tab('second.pdf'));
    expect(await tabCount(j)).toBe(2);
  });

  await j.step('edit the second document', () => rotatePageRight(j, 0));

  await j.step('edit the first document: its own change, not the second one', async () => {
    await j.s.click(tab('first.pdf'));
    await waitTitle(j, 'first.pdf');
    await waitForPages(j, 2);
    await waitDirty(j, false);
    await rotatePageRight(j, 1);
    await waitDirty(j, true);
  });

  await j.step('each tab comes back with its own unsaved changes', async () => {
    await j.s.click(tab('second.pdf'));
    await waitTitle(j, 'second.pdf');
    await waitForPages(j, 3);
    await waitDirty(j, true);
    await j.s.click(tab('first.pdf'));
    await waitTitle(j, 'first.pdf');
    await waitForPages(j, 2);
    await waitDirty(j, true);
    expect(await j.s.call<number>('count', '[data-testid="tab-dirty-dot"]')).toBe(2);
  });

  await j.step('opening a file that is already open brings its tab to the front', async () => {
    await openViaMenu(j, second);
    await waitTitle(j, 'second.pdf');
    await waitForPages(j, 3);
    expect(await tabCount(j)).toBe(2);
  });

  await j.step('closing a tab with unsaved changes asks; Cancel keeps it', async () => {
    await j.s.click(`${tab('second.pdf')} [data-testid="tab-close-btn"]`);
    await j.waitFor('[data-testid="unsaved-changes-dialog"]');
    await j.s.click('[data-testid="unsaved-cancel-btn"]');
    await j.waitFor('[data-testid="unsaved-changes-dialog"]', { state: 'gone' });
    expect(await tabCount(j)).toBe(2);
    await waitDirty(j, true);
  });

  await j.step("Don't save closes that tab and leaves the other one alone", async () => {
    await j.s.click(`${tab('second.pdf')} [data-testid="tab-close-btn"]`);
    await j.waitFor('[data-testid="unsaved-changes-dialog"]');
    await j.s.click('[data-testid="unsaved-discard-btn"]');
    await waitTitle(j, 'first.pdf');
    await waitForPages(j, 2);
    await waitDirty(j, true);
    expect(await tabCount(j)).toBe(0);
    expect(j.inspect(second).raw.pages?.map((p) => p.rotate ?? 0)).toEqual([0, 0, 0]);
  });

  await j.step('saving the remaining document writes its change', async () => {
    await save(j);
    expect(j.inspect(first).raw.pages?.map((p) => p.rotate ?? 0)).toEqual([0, 90]);
  });
});
