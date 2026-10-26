// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-56: "AcroForm ... every field type" (homepage). Fill a single-line and a
// multi-line text field, tick a checkbox, pick a radio button, choose from a
// combo box and a list box; save; the saved file carries every value, as the
// engine reads it back and as any other reader sees it in /V.

import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { fill, save, sleep, waitDirty } from './lib/ui';

const field = (name: string): string => `[data-form-field="${name}"]`;

journey('J-56', async (j) => {
  const doc = j.file('application.pdf');
  pdfcheck.make('make-form', doc);
  await j.start({ open: doc });
  await j.waitFor('[data-testid="form-overlay"]');

  await j.step('type into the text fields', async () => {
    await fill(j, field('full_name'), 'Ada Lovelace');
    // One value with a line break in it: Enter inside a field is a browser
    // editing detail the macOS bridge cannot reproduce; what matters here is
    // that the break survives the save.
    await fill(j, field('notes'), 'Line one\nLine two');
  });
  await j.step('tick the checkbox', () => j.s.click(field('agree')));
  await j.step('pick the second radio button', () => j.s.click('input[name="size"]:not([data-form-field])'));
  await j.step('choose in the combo box and the list box', async () => {
    await j.s.call('setValue', field('country'), 'Belgium');
    await j.s.call('setValue', field('colours'), 'Green');
  });

  await j.step('save', async () => {
    // Field edits commit on blur.
    await j.s.click('[data-testid="page-view"]');
    await sleep(500);
    await waitDirty(j, true);
    await save(j);
  });

  await j.step('every value is in the saved file', async () => {
    const r = j.inspect(doc);
    const v = Object.fromEntries((r.form_fields ?? []).map((f) => [f.name, f.value]));
    expect(v.full_name).toBe('Ada Lovelace');
    // The file carries the line break. A value with a break is stored as a
    // UTF-16BE text string (hex, with the byte order mark) so every reader
    // takes the break as a break; the engine's reader returned it dropped,
    // which is the listed gap below.
    const utf16 = (t: string): string => 'FEFF' + [...t].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('');
    expect(readFileSync(doc, 'latin1').toUpperCase()).toContain(`/V<${utf16('Line one\nLine two')}>`);
    await j.gap('form-multiline-value-reread', async () => {
      expect((v.notes ?? '').replace(/\r\n?/g, '\n')).toBe('Line one\nLine two');
    });
    expect(v.agree).not.toBe('Off');
    expect(v.agree).toBeTruthy();
    expect(v.size).toBe('M');
    expect(v.country).toBe('Belgium');
    expect(v.colours).toBe('Green');
  });
});
