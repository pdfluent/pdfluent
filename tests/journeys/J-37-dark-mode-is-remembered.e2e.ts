// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-37: dark mode set in the app stays set after a restart, on the first frame.
// Fixed by #721 (branch fix/editor-next-batch): the saved themePreference is read
// before React mounts and mirrored on <html> (theme-dark / theme-light), and the
// shell takes its dark class from the same preference.
// For the merge into test/real-app-e2e: the 'theme-not-persisted' gap entry in
// docs/JOURNEY_TESTS.json is removed by this spec (step below replaces j.gap).
// Covered at the logic level by tests/theme-persistence.test.ts.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { clickText, sleep } from './lib/ui';

journey('J-37', async (j) => {
  const doc = 'src-tauri/tests/fixtures/two_pages.pdf';
  const shellDark = async (): Promise<boolean> => j.s.call<boolean>('exists', '.pfv3.theme-dark');
  const rootDark = async (): Promise<boolean> => j.s.call<boolean>('exists', 'html.theme-dark');

  await j.start({ open: doc });
  const before = await shellDark();
  await j.step('More > Dark mode switches the theme', async () => {
    await j.s.click('.more-trigger');
    await clickText(j, '.topbar-more-menu .dd-item', 'Dark mode', false);
    await sleep(300);
    expect(await shellDark()).toBe(!before);
    expect(await rootDark()).toBe(!before);
  });
  await j.step('after a restart the choice is still there, on the first frame', async () => {
    await j.stop();
    await j.start({ open: doc });
    // <html> is set before React mounts, so it is the first-frame witness.
    expect(await rootDark()).toBe(!before);
    expect(await shellDark()).toBe(!before);
  });
  await j.step('switching back is remembered too', async () => {
    await j.s.click('.more-trigger');
    await clickText(j, '.topbar-more-menu .dd-item', 'Dark mode', false);
    await sleep(300);
    await j.stop();
    await j.start({ open: doc });
    expect(await shellDark()).toBe(before);
    expect(await rootDark()).toBe(before);
  });
});
