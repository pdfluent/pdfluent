// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-66: "Strip hidden metadata in one click" (homepage). After the strip and a
// save, the document information dictionary carries no author, title,
// subject, keywords, creator or producer the user put there, and there is no
// XMP packet left. The homepage also promises automatic PII detection (SSNs,
// IBANs, names): the app has no such feature (plan §2.7), so that step is a
// known gap with its owner, not a pass.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { openTool, save, setProperties, waitForText } from './lib/ui';

const PERSONAL = ['Author', 'Title', 'Subject', 'Keywords', 'Creator'];

journey('J-66', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'hr-file.pdf');
  const text = allText(j.inspect(doc));
  await j.start({ open: doc });

  await j.step('give the document an author and a title first, and save', async () => {
    await setProperties(j, 'Salary review J. Jansen', 'Jan Jansen');
    await save(j);
    expect(j.inspect(doc).raw.info?.Author).toBe('Jan Jansen');
  });

  await j.step('Redact > strip metadata', async () => {
    await openTool(j, 'Redact');
    await j.waitFor('[data-testid="redact-metadata-btn"]');
    await j.s.click('[data-testid="redact-metadata-btn"]');
    await waitForText(j, 'Metadata stripped', 30_000);
  });

  await j.step('save; nothing personal left in the info dictionary or XMP', async () => {
    await save(j);
    const r = j.inspect(doc);
    for (const key of PERSONAL) expect(r.raw.info?.[key] ?? '', key).toBe('');
    expect(r.raw.has_xmp).toBe(false);
    expect(allText(r)).toBe(text);
  });

  await j.gap('pii-detection', async () => {
    // The promise: the app finds an IBAN or a social security number itself.
    await openTool(j, 'Redact');
    await waitForText(j, /IBAN|social security|personal data|PII/i, 3_000);
  });
});
