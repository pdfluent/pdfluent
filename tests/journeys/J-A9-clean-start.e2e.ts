// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-A9: starting the app shows no error. Not an error toast, not a console
// error, not an uncaught exception, whether it starts empty or with a file.
//
// The owner saw "'ocr_component_status' did not complete" on a plain start, a
// toast no journey had flagged because no journey looked. Every journey now
// fails on such a fault (lib/journey.ts); this one is the plain statement of
// the promise, with the start-up probes given time to finish and say so.

import { expect } from 'vitest';
import { describeFaults } from '../lib/fault-guard';
import { journey } from './lib/journey';
import { sleep } from './lib/ui';

// Start-up probes (component status, licence, updates) answer within a second
// or two; five seconds leaves room for a slow runner without hiding a late one.
const SETTLE_MS = 5_000;

journey('J-A9', async (j) => {
  await j.start({ noDocument: true });
  await j.step('an empty start stays quiet', async () => {
    await sleep(SETTLE_MS);
    expect(await j.s.call<number>('count', '[data-testid="app-error-toast"]'), 'error toasts on screen').toBe(0);
    const faults = await j.faults();
    expect(faults, `the app showed or logged errors on start:\n${describeFaults(faults)}`).toEqual([]);
  });

  await j.start({ open: 'src-tauri/tests/golden/fixture-sample-text-3p.pdf', as: 'quiet.pdf' });
  await j.step('a start with a file stays quiet', async () => {
    await j.waitForDocument(3);
    await sleep(SETTLE_MS);
    expect(await j.s.call<number>('count', '[data-testid="app-error-toast"]'), 'error toasts on screen').toBe(0);
    const faults = await j.faults();
    expect(faults, `the app showed or logged errors on start with a file:\n${describeFaults(faults)}`).toEqual([]);
  });
});
