// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-62 (#725): a typed signature placed on the page is drawn in Dancing Script;
// the font is embedded in the saved file and the typed name extracts as text.
//
// Needs PR #767 (feat/1.2-images-signature-font): `add-signature-btn`,
// `signature-name-input`, `signature-font-select`. Until it is on the trunk the
// flow is the listed known gap "typed-signature-767".

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { fill, openMode, save, waitDirty } from './lib/ui';

const NAME = 'Ada Lovelace';

journey('J-62', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'contract.pdf');
  await j.start({ open: doc });

  await j.gap('typed-signature-767', async () => {
    await openMode(j, 'Sign');
    await j.s.click('[data-testid="add-signature-btn"]');
    await j.waitFor('[data-testid="signature-name-input"]');
    await fill(j, '[data-testid="signature-name-input"]', NAME);
    await j.s.call('setValue', '[data-testid="signature-font-select"]', 'font-signature-1');
    await j.s.click('[data-testid="signature-preview"]');
    await j.s.click('[data-testid="page-view"]');
    await waitDirty(j, true);
    await save(j);
    // Reopen: judged on the saved bytes.
    await j.stop();
    await j.start({ open: doc });
    const r = j.inspect(doc, { needles: [NAME] });
    const fonts = r.raw.fonts ?? [];
    const script = fonts.filter((f) => /dancing/i.test(f.base_font ?? ''));
    expect(script.length, `Dancing Script in ${JSON.stringify(fonts)}`).toBeGreaterThan(0);
    expect(script.every((f) => f.embedded), 'Dancing Script is embedded').toBe(true);
    expect(r.pages?.[0]?.text ?? '').toContain(NAME);
  });
});
