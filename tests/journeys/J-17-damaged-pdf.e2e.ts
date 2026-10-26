// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-17: a damaged PDF does not take the app down. The app says it cannot open
// the file in words a person understands, and stays usable. Today it shows
// the parser's raw message (plan §2.2): that part is a known gap.

import { readFileSync, writeFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { messages, sleep, waitForText } from './lib/ui';

journey('J-17', async (j) => {
  const good = readFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'));
  const bad = j.file('broken.pdf');
  writeFileSync(bad, good.subarray(0, Math.floor(good.length / 3)));
  await j.start({ open: bad, noDocument: true });
  await j.step('an error is shown and the app stays up', async () => {
    await waitForText(j, /could not|cannot|failed|damaged|corrupt|error/i, 30_000);
    await sleep(1000);
    expect(await j.s.alive()).toBe(true);
    expect(await j.s.call<boolean>('exists', '[data-has-document="true"]')).toBe(false);
  });
  await j.gap('raw-parse-error', async () => {
    const body = await messages(j);
    expect(body).not.toMatch(/Failed to parse PDF|lopdf|xref|trailer/i);
  });
});
