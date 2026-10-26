// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-19: a document that arrives signed can be annotated and its pages
// changed; Save appends, and the signature stays valid. What cannot be
// appended — a redaction, which must remove content from the file's history —
// is not written over the signed original: the app offers a copy without the
// signature instead, and the original keeps its valid signature.

import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { P12, P12_PASSWORD } from './lib/sign';
import { clickText, fill, openTool, rotatePageRight, save, sleep, waitForText } from './lib/ui';

journey('J-19', async (j) => {
  const signed = j.file('signed-by-supplier.pdf');
  pdfcheck.make('make-signed', j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf'), signed, j.fixture(P12), P12_PASSWORD);
  expect(j.inspect(signed).signatures?.[0]?.valid).toBe(true);
  await j.start({ open: signed });

  await j.step('a page change saves as an appended revision; the signature holds', async () => {
    await rotatePageRight(j, 0);
    await save(j);
    const r = j.inspect(signed);
    expect(r.raw.pages?.[0]?.rotate).toBe(90);
    expect(r.signatures?.[0]?.valid).toBe(true);
  });

  await j.step('a redaction is not saved over the signed original', async () => {
    const before = readFileSync(signed);
    await openTool(j, 'Redact');
    const input = 'input[placeholder="Search term (e.g. SSN, phone)"]';
    await fill(j, input, 'Lorem');
    await clickText(j, '.panel button', 'Mark');
    await waitForText(j, /Matches redacted: [1-9]/);
    await sleep(500);
    if (await j.s.call<boolean>('exists', '.panel .btn-primary.accent')) {
      await j.answerDialog('message', true);
      await clickText(j, '.panel button', 'Apply redactions permanently');
      await waitForText(j, /permanently applied|Redaction failed/i, 60_000);
    }
    await j.s.click('[data-testid="save-btn"]');
    await j.waitFor('[data-testid="signed-save-dialog"]', { timeout: 20_000 });
    expect(readFileSync(signed).equals(before)).toBe(true);
    expect(j.inspect(signed).signatures?.[0]?.valid).toBe(true);
  });

  await j.step('the offered copy has no signature and no redacted word', async () => {
    const copy = j.file('redacted-copy.pdf');
    await j.answerNativeDialogs(copy);
    await j.s.click('[data-testid="signed-save-copy-btn"]');
    const until = Date.now() + 30_000;
    while (!(await import('node:fs')).existsSync(copy)) {
      if (Date.now() > until) throw new Error('the unsigned copy was not written');
      await sleep(200);
    }
    await sleep(500);
    const r = j.inspect(copy, { needles: ['Lorem'] });
    expect(r.is_signed).toBe(false);
    expect(r.needles[0]?.pages).toEqual([]);
    expect(r.needles[0]?.objects).toBe(false);
  });
});
