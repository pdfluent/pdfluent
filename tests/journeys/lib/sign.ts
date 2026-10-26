// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { Journey } from './journey';
import { fill, openMode, waitForText } from './ui';

export const P12 = 'src-tauri/tests/fixtures/signer-test.p12';
export const P12_PASSWORD = 'pdfluent-test';

/** Sign > Sign with a certificate, saving the signed copy as `dest`. */
export async function signWithCertificate(j: Journey, dest: string, reason = 'approved'): Promise<void> {
  const cert = j.fixture(P12, 'signer.p12');
  await openMode(j, 'Sign');
  await j.waitFor('[data-testid="sign-cert-pick"]');
  await j.answerDialog('open', cert);
  await j.s.click('[data-testid="sign-cert-pick"]');
  await j.waitFor('[data-testid="sign-cert-pick"]', { text: 'signer.p12' });
  await fill(j, '[data-testid="sign-cert-password"]', P12_PASSWORD);
  await fill(j, '[data-testid="sign-reason"]', reason);
  await j.answerDialog('save', dest);
  await j.s.click('[data-testid="sign-with-certificate"]');
  await waitForText(j, /Signed copy saved as|Signing failed/, 60_000).then((body) => {
    if (body.includes('Signing failed')) throw new Error(`signing failed: ${body.slice(body.indexOf('Signing failed'), body.indexOf('Signing failed') + 200)}`);
  });
}
