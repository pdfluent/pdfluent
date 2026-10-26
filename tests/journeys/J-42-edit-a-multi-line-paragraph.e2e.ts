// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-42: double-click a paragraph of several lines, rewrite it as a whole,
// save: the new text is in the file, reflowed inside the paragraph, and the
// old lines are gone. Logic: src-tauri/tests/paragraph_edit.rs (cargo-test).
// Fixture: scripts/fixtures/make-paragraph-pdf.mjs.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { editLine, save, waitDirty } from './lib/ui';

const NEW = 'A completely new paragraph that is noticeably longer than the old one, so it has to wrap over more lines.';

journey('J-42', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/paragraph_3_lines.pdf', 'letter.pdf');
  await j.start({ open: doc });

  await j.step('rewrite the whole paragraph in the inline editor', async () => {
    await editLine(j, 'The quick brown fox', NEW);
    await j.s.click('[data-testid="text-edit-save-btn"]');
    await j.waitFor('[data-testid="text-inline-editor"]', { state: 'gone' });
    expect(await j.s.call<boolean>('exists', '[data-testid="text-edit-rejection"]')).toBe(false);
    await waitDirty(j, true);
  });

  await j.step('save; the file has the new paragraph and none of the old lines', async () => {
    await save(j);
    const r = j.inspect(doc, { needles: ['quick brown fox', 'lazy dog', 'trial'] });
    const flat = (r.pages?.[0]?.text ?? '').split(/\s+/).join(' ');
    for (const word of NEW.replace(/[,.]/g, '').split(' ')) expect(flat).toContain(word);
    expect(flat).toContain('Heading stays');
    for (const n of r.needles) expect(n.pages, n.needle).toEqual([]);
  });
});
