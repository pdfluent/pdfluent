// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-A6: an opt-in crash report reaches PDFluent and the user gets a report ID.
// The app posts to report.pdfluent.com. This journey measures, without sending
// anything, that the host the app would send to resolves. It does not prove
// the report worker answers: that needs a send, which a test must not do.

import { promises as dns } from 'node:dns';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { repoFile } from './lib/env';

journey('J-A6', async (j) => {
  await j.step('the app names its report endpoint', async () => {
    const csp = JSON.parse(readFileSync(repoFile('src-tauri/tauri.conf.json'), 'utf8')).app.security.csp as string;
    expect(csp).toContain('https://report.pdfluent.com');
  });
  await j.step('the host the app sends to resolves', async () => {
    const addrs = await dns.lookup('report.pdfluent.com', { all: true });
    expect(addrs.length).toBeGreaterThan(0);
  });
});
