// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-63: Check signatures says a signature is valid when the signed bytes are
// intact, names the signer, and says invalid once the signed content was
// changed behind the signature's back.

import { readFileSync, writeFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { P12, P12_PASSWORD } from './lib/sign';
import { clickText, openMode, waitForText } from './lib/ui';

async function check(j: Journey): Promise<string> {
  await openMode(j, 'Sign');
  await clickText(j, '.panel button', 'Check signatures', false);
  return waitForText(j, /\bvalid\b|\binvalid\b/i, 30_000);
}

journey('J-63', async (j) => {
  const signed = j.file('contract-signed.pdf');
  pdfcheck.make('make-signed', j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), signed, j.fixture(P12), P12_PASSWORD);

  await j.step('an intact signature is valid, with its signer', async () => {
    await j.start({ open: signed });
    const body = await check(j);
    expect(body).toMatch(/\bvalid\b/i);
    expect(body).toContain('PDFluent Test Signer');
    await j.stop();
  });

  await j.step('a change inside the signed bytes makes it invalid', async () => {
    const bytes = readFileSync(signed);
    // The first bytes are inside the signed range whatever the file's streams
    // look like (they are compressed, so the page text is not readable raw).
    const at = bytes.indexOf('%PDF-1.') + '%PDF-1.'.length;
    expect(at, 'the file must start with a PDF header').toBeGreaterThan(5);
    bytes.write(bytes[at] === 0x35 ? '4' : '5', at);
    const tampered = j.file('contract-tampered.pdf');
    writeFileSync(tampered, bytes);
    expect(j.inspect(tampered).signatures?.[0]?.valid).toBe(false);
    await j.start({ open: tampered });
    const body = await check(j);
    expect(body).toMatch(/\binvalid\b/i);
  });
});
