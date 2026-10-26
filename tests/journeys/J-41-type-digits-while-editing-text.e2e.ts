// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-41: typing digits while editing a line puts the digits in the text. It
// must not switch the editor's mode (customer report, #642: the number keys
// are mode shortcuts and fired inside the inline editor).

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { editLine } from './lib/ui';

journey('J-41', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'invoice.pdf');
  await j.start({ open: doc });
  const modeBefore = await j.s.call<string>('attr', '.pfv3', 'data-mode');

  await j.gap('digits-switch-mode', async () => {
    await editLine(j, 'Hello Page One', 'Invoice 2026-0042 paid');
    expect(await j.s.call<boolean>('visible', '[data-testid="text-inline-editor"]')).toBe(true);
    expect(await j.s.call<string>('text', '[data-testid="text-inline-editor"]')).toBe('Invoice 2026-0042 paid');
    expect(await j.s.call<string>('attr', '.pfv3', 'data-mode')).toBe(modeBefore);
  });
});
