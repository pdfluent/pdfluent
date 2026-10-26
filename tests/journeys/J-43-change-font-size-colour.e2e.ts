// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-43: edit a line, choose an installed (system) font in the typeface picker
// of the Edit panel, save, reopen: the font is embedded in the file (not just
// named), it is a font the file did not carry before, and the line still
// extracts as text.
//
// The picker is the native <select> `edit-typeface` with one <optgroup> per
// installed family. Which families exist depends on the machine, so the journey
// takes Georgia, Arial or Verdana when one is installed and otherwise the first
// family that may be embedded; what it judges is the saved bytes. A face whose
// licence forbids embedding is disabled in the list and never chosen here.
// The Rust half is src-tauri/tests (set_text_run_font) and the picker's own
// unit test (src/viewer/text/__tests__/typefaceSelect.test.tsx).

import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import { editLine, save, sleep, waitDirty } from './lib/ui';

const PREFERRED = ['Georgia', 'Arial', 'Verdana', 'Times New Roman'];
const OLD = 'Hello Page One';
const NEW = 'Quarterly figures approved';
const PICKER = '[data-testid="edit-typeface"]';

/** Choose an embeddable installed face; returns the family it belongs to. */
async function chooseTypeface(j: Journey): Promise<string> {
  const until = Date.now() + 20_000;
  while (await j.s.call<boolean>('exists', `${PICKER}[disabled]`)) {
    if (Date.now() > until) throw new Error('the font list never loaded');
    await sleep(200);
  }
  for (const family of PREFERRED) {
    const value = await j.s.call<string | null>('attr', `${PICKER} optgroup[label="${family}"] option:not([disabled])`, 'value');
    if (value) {
      await j.s.call('setValue', PICKER, value);
      return family;
    }
  }
  const value = await j.s.call<string | null>('attr', `${PICKER} optgroup option:not([disabled])`, 'value');
  if (!value) throw new Error('the list has no installed font that may be embedded');
  await j.s.call('setValue', PICKER, value);
  return value;
}

journey('J-43', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'memo.pdf');
  const before = new Set((j.inspect(doc).raw.fonts ?? []).map((f) => f.base_font ?? ''));
  await j.start({ open: doc });

  await j.step('rewrite the line', async () => {
    await editLine(j, OLD, `${NEW} \u2014 PDFluent operation test.`);
  });

  let family = '';
  await j.step('choose an installed font in the typeface picker', async () => {
    await j.waitFor(PICKER);
    family = await chooseTypeface(j);
    j.note(`typeface: ${family}`);
  });

  await j.step('apply the edit and save', async () => {
    await j.s.click('[data-testid="text-edit-save-btn"]');
    await j.waitFor('[data-testid="text-inline-editor"]', { state: 'gone' });
    expect(await j.s.call<boolean>('exists', '[data-testid="text-edit-rejection"]'), 'the font was refused').toBe(false);
    await waitDirty(j, true);
    await save(j);
  });

  await j.step('reopen: the line is text and the chosen font is embedded', async () => {
    await j.stop();
    await j.start({ open: doc });
    const r = j.inspect(doc);
    expect(r.opens).toBe(true);
    expect(r.pages?.[0]?.text).toContain(NEW);
    const fonts = r.raw.fonts ?? [];
    const added = fonts.filter((f) => !before.has(f.base_font ?? ''));
    expect(added.length, `a font the file did not have before, in ${JSON.stringify(fonts)}`).toBeGreaterThan(0);
    expect(added.every((f) => f.embedded), `the new font is embedded: ${JSON.stringify(added)}`).toBe(true);
  });
});
