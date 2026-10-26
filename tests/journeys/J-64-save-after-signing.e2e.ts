// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-64: after signing, a change and a Save keep the signature valid. The save
// appends to the signed file instead of rewriting it, so the signed bytes are
// the same and the signature still verifies; the change is in the file.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { signWithCertificate } from './lib/sign';
import { rotatePageRight, save, waitTitle } from './lib/ui';

journey('J-64', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'order.pdf');
  const signed = j.file('order-signed.pdf');
  await j.start({ open: doc });
  await j.step('sign', () => signWithCertificate(j, signed));

  await j.step('reopen the signed copy, change it, save', async () => {
    await j.stop();
    await j.start({ open: signed });
    await waitTitle(j, 'order-signed.pdf');
    const before = j.inspect(signed);
    expect(before.signatures?.[0]?.valid).toBe(true);
    await rotatePageRight(j, 1);
    await save(j);
    const after = j.inspect(signed);
    expect(after.raw.pages?.map((p) => p.rotate)).toEqual([0, 90]);
    expect(after.revisions).toBeGreaterThan(before.revisions);
    expect(after.signatures).toHaveLength(1);
    expect(after.signatures?.[0]?.valid).toBe(true);
  });
});
