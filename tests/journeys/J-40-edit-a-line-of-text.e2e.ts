// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-40: "Edit text in place... click a line and rewrite it" (the editor's
// headline promise). Double-click a line, rewrite it, commit, save: the saved
// file says the new line and not the old one, the other page is untouched,
// and nothing was stamped into the file on the way (the September PDF/A
// stamp was exactly this class: plan §6).

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { editLine, save, sleep, waitDirty } from './lib/ui';

const OLD = 'Hello Page One';
const NEW = 'Quarterly figures approved';

journey('J-40', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'memo.pdf');
  const before = j.inspect(doc);
  await j.start({ open: doc });

  // 1028x729 is the window a 1280x800 Windows laptop gives the app (DPI
  // scaling). The same size everywhere keeps the editor, its pill and the top
  // bar competing for the same few pixels, as they do on that laptop.
  await j.step('use a 1028x729 window', async () => {
    await j.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1028, height: 729 } } });
    await sleep(800);
  });

  await j.step('rewrite the line', async () => {
    await editLine(j, OLD, `${NEW} — PDFluent operation test.`);
    // A real click lands where elementFromPoint says; null means the Save
    // button itself (or a child) is on top, anything else names the cover.
    expect(await j.s.call<string | null>('coveredBy', '[data-testid="text-edit-save-btn"]')).toBeNull();
    await j.s.click('[data-testid="text-edit-save-btn"]');
    await j.waitFor('[data-testid="text-inline-editor"]', { state: 'gone' });
    expect(await j.s.call<boolean>('exists', '[data-testid="text-edit-rejection"]')).toBe(false);
    await waitDirty(j, true);
  });

  await j.step('the screen shows the new line', async () => {
    const spans = await j.s.call<string[]>('texts', '[data-testid="text-span"]');
    expect(spans.join(' ')).toContain(NEW);
  });

  await j.step('save; the file says the new line, the rest is as it was', async () => {
    await save(j);
    const r = j.inspect(doc, { needles: [OLD, 'trial', 'Free Tier'] });
    expect(r.opens).toBe(true);
    expect(r.pages?.[0]?.text).toContain(NEW);
    expect(r.needles[0]?.pages).toEqual([]);
    expect(r.pages?.[1]?.text).toBe(before.pages?.[1]?.text);
    for (const stamp of r.needles.slice(1)) expect(stamp.objects, stamp.needle).toBe(false);
  });
});
