// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-71: Export > PNG / JPEG writes the current page as a real image of the
// page's size, not an empty file.

import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import { waitForFile } from './lib/ui';

async function exportAs(j: Journey, format: 'png' | 'jpeg', dest: string): Promise<void> {
  await j.s.click('.share-trigger');
  await j.waitFor('[data-testid="export-btn"]');
  await j.s.click('[data-testid="export-btn"]');
  await j.waitFor('[data-testid="export-dialog"]');
  await j.s.call('setValue', '[data-testid="export-format-select"]', format);
  await j.answerDialog('save', dest);
  await j.s.click('[data-testid="export-submit-btn"]');
  await waitForFile(dest, 60_000);
}

journey('J-71', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'page.pdf');
  await j.start({ open: doc });

  await j.step('PNG: signature bytes and a plausible size', async () => {
    const dest = j.file('page.png');
    await exportAs(j, 'png', dest);
    const b = readFileSync(dest);
    expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(b.readUInt32BE(16), 'width').toBeGreaterThan(200);
    expect(b.readUInt32BE(20), 'height').toBeGreaterThan(200);
  });

  await j.step('JPEG: starts with the JPEG marker', async () => {
    const dest = j.file('page.jpg');
    await exportAs(j, 'jpeg', dest);
    const b = readFileSync(dest);
    expect(b.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(b.length).toBeGreaterThan(2000);
  });
});
