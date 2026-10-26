// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-11 (Windows): double-clicking a second PDF while PDFluent runs opens it in
// a new tab of the running app (J-90), instead of starting a second process
// with its own empty state. macOS routes a second open to the
// running app itself (RunEvent::Opened), so this journey is Windows-only.

import { spawnSync } from 'node:child_process';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { pidsOf } from './lib/driver';
import { waitForPages, waitTitle } from './lib/ui';

journey('J-11', async (j) => {
  const second = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'second.pdf');
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf', as: 'first.pdf', env: { PDFLUENT_E2E_SINGLE_INSTANCE: '1' } });
  await waitForPages(j, 2);
  const app = process.env.PDFLUENT_E2E_APP as string;
  const before = pidsOf(app).length;

  await j.step('the second launch hands its file over and exits', async () => {
    const r = spawnSync(app, [second], { timeout: 30_000, env: { ...process.env, PDFLUENT_E2E_SINGLE_INSTANCE: '1' } });
    expect(r.status).toBe(0);
    expect(pidsOf(app).length).toBe(before);
  });
  await j.step('the running window opens the second file in a tab beside the first', async () => {
    await waitTitle(j, 'second.pdf');
    await waitForPages(j, 3);
    await j.waitFor('[data-testid="document-tab"][data-tab-title="first.pdf"]');
  });
});
