// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-61: signing with your own .p12 writes a signed copy whose signature
// verifies, names the signer, and covers the document as it was: same pages,
// same text. The editor signs PAdES B-B (no timestamp); the panel says so.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { signWithCertificate } from './lib/sign';
import { waitForText } from './lib/ui';

journey('J-61', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'agreement.pdf');
  const signed = j.file('agreement-signed.pdf');
  const text = allText(j.inspect(doc));
  await j.start({ open: doc });

  await j.step('sign and save a copy', () => signWithCertificate(j, signed));
  await j.step('the panel states the signature level', () => waitForText(j, 'PAdES B-B'));

  await j.step('the copy carries one valid signature by the test signer', async () => {
    const r = j.inspect(signed);
    expect(r.is_signed).toBe(true);
    expect(r.signatures).toHaveLength(1);
    expect(r.signatures?.[0]?.valid).toBe(true);
    expect(r.signatures?.[0]?.signer ?? '').toContain('PDFluent Test Signer');
    expect(r.page_count).toBe(2);
    expect(allText(r)).toBe(text);
    // The original is not signed.
    expect(j.inspect(doc).is_signed).toBe(false);
  });
});
