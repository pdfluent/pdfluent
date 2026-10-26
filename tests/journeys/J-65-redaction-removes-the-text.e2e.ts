// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-65: "Redact text so it is actually removed". Search redaction marks every
// occurrence; once applied and saved, the word is nowhere in the file — not in
// the page text, not in any object or decompressed stream, not in the raw
// bytes — and the rest of the page survives. An earlier revision cannot hold
// it either: the saved file has one.
//
// Both ways of redacting are driven, and each is judged twice: on the saved
// file, and on the page the person is looking at. 1.1.0 redacted the document
// correctly but kept showing the old text until the zoom changed, because the
// page render was not told (a redaction is applied to the file while the screen
// is only a cached picture of it). The picture is checked here, with no zoom
// change in between.
//
// Written against the SDK 1.1.1 behaviour: where the engine cannot remove
// what is under a mark it must refuse out loud. A redaction that reports
// success and leaves the text is the one outcome this journey rejects.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { clickText, fill, openTool, save, settledPageDigest, waitForPageToChange, waitForText } from './lib/ui';

const WORD = 'Lorem';
const AREA_WORD = 'ipsum';
const SURVIVOR = 'checkpoint';
const OVERLAY = '[data-testid="annotation-overlay"]';
// fixture-sample-text-3p.pdf is US Letter; its first line spans y 55-77 pt.
const PAGE_PT = { width: 612, height: 792 };

journey('J-65', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'personnel.pdf');
  const before = j.inspect(doc, { needles: [WORD, AREA_WORD] });
  expect(before.needles[0]?.pages?.length ?? 0).toBeGreaterThan(0);
  expect(before.needles[1]?.pages?.length ?? 0).toBeGreaterThan(0);
  expect(allText(before)).toContain(SURVIVOR);
  await j.start({ open: doc });

  let shown = '';
  await j.step('the first page is on screen', async () => {
    await j.waitFor('[data-testid="rendered-page"]');
    shown = await settledPageDigest(j);
  });

  await j.step('Redact > drag a box over the first line: a draft appears', async () => {
    await openTool(j, 'Redact');
    await j.waitFor(OVERLAY);
    const size = await j.s.call<{ width: number; height: number } | null>('size', OVERLAY);
    expect(size).not.toBeNull();
    const px = (x: number, y: number): [number, number] =>
      [(x / PAGE_PT.width) * size!.width, (y / PAGE_PT.height) * size!.height];
    await j.s.call('dragPaced', OVERLAY, px(60, 50), px(460, 82));
    await waitForText(j, /draft redactions \(1\)/i, 15_000);
    // The draft is itself drawn on the page; what the apply must change is this.
    shown = await settledPageDigest(j);
  });

  await j.step('apply the draft: the page on screen shows it, without a zoom change', async () => {
    await j.answerDialog('message', true);
    await clickText(j, '.panel button', 'Apply redactions permanently');
    const body = await waitForText(j, /permanently applied|Redaction failed|redaction-incomplete/i, 60_000);
    expect(body).toMatch(/permanently applied/i);
    await waitForPageToChange(j, shown);
    shown = await settledPageDigest(j);
    expect(await j.s.call<boolean>('exists', '.panel .btn-primary.accent')).toBe(false);
  });

  await j.step('Redact > search and mark the word: the page on screen shows it too', async () => {
    const input = 'input[placeholder="Search term (e.g. SSN, phone)"]';
    await j.waitFor(input);
    await fill(j, input, WORD);
    await clickText(j, '.panel button', 'Mark');
    const body = await waitForText(j, /Matches redacted: \d+|No text matches|redaction failed|redaction-incomplete/i, 30_000);
    expect(body).toMatch(/Matches redacted: [1-9]/);
    expect(body).not.toMatch(/No text matches|redaction failed|redaction-incomplete/i);
    // The word is on page one's second line, so the picture must change.
    await waitForPageToChange(j, shown);
    // Search redaction is applied at once: there is no draft left to apply.
    expect(await j.s.call<boolean>('exists', '.panel .btn-primary.accent')).toBe(false);
  });

  await j.step('save', () => save(j));

  await j.step('both words are gone from the saved file, everywhere; the rest is there', async () => {
    const r = j.inspect(doc, { needles: [WORD, AREA_WORD] });
    expect(r.opens).toBe(true);
    expect(r.needles[0]).toEqual({ needle: WORD, raw_bytes: false, objects: false, pages: [] });
    expect(r.needles[1]).toEqual({ needle: AREA_WORD, raw_bytes: false, objects: false, pages: [] });
    expect(allText(r)).toContain(SURVIVOR);
    expect(r.page_count).toBe(before.page_count);
    expect(r.revisions).toBe(1);
    expect(r.raw.has_prev).toBe(false);
  });
});
