// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-38: the command palette opens with the keyboard shortcut, filters while
// you type, and closes with Escape.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

journey('J-38', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.step('Cmd/Ctrl+K opens the palette', async () => {
    await j.s.press('k', [j.mod]);
    await j.waitFor('[data-testid="command-palette-input"]');
  });
  await j.step('typing filters the list', async () => {
    const before = await j.s.call<number>('count', '[data-testid="command-palette"] [role="option"]');
    await j.s.call('focus', '[data-testid="command-palette-input"]');
    await j.s.type('zoom');
    await sleep(400);
    const after = await j.s.call<number>('count', '[data-testid="command-palette"] [role="option"]');
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
  });
  await j.step('Escape closes it', async () => {
    await j.s.press('Escape');
    await j.waitFor('[data-testid="command-palette"]', { state: 'gone' });
  });
});
