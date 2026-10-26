// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-45 (#723): a picture on a page can be moved, replaced and deleted.
//
// Part 1 places a picture from a file with the Edit panel's "Place image"
// control and removes it again. Part 2 is the promise ("a picture that is
// already on the page"): the scan fixture is a page whose only content is one
// image drawn by the page itself, not an annotation. Clicking it selects it
// (until the fix in this change, a click on such a picture selected nothing:
// the click handler looked only in the annotation list), the arrow keys move
// it, "Replace image" swaps its bytes, and Delete takes it out. Every step is
// judged on the saved file, read back by pdfcheck: the image objects in it.

import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { openMode, save, waitDirty } from './lib/ui';

const IMAGE = 'src-tauri/tests/fixtures/sample.png';
const MARKER = '[data-testid="annotation-marker"][data-annotation-type="stamp"]';
const CARD = '[data-testid="selected-annotation-card"]';

const images = (j: Journey, file: string): number => j.inspect(file).raw.images ?? 0;

journey('J-45', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'images.pdf');
  const picture = j.fixture(IMAGE);
  const scan = j.file('scan.pdf');
  pdfcheck.make('make-scan', j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'source.pdf'), scan);
  expect(images(j, scan), 'the scan fixture is one page-sized picture').toBe(1);
  await j.start({ open: doc });

  await j.step('place a picture from a file; it is selected and can be moved', async () => {
    await openMode(j, 'Edit');
    await j.answerNativeDialogs(picture);
    await j.s.click('[data-testid="place-image-btn"]');
    await j.s.click('[data-testid="page-view"]');
    await j.waitFor(CARD);
    await waitDirty(j, true);
    await j.s.press('ArrowRight');
    await j.s.press('ArrowDown', ['shift']);
    await save(j);
    expect(images(j, doc), 'one picture after place').toBe(1);
  });

  await j.step('replace the placed picture, then delete it', async () => {
    await j.answerNativeDialogs(picture);
    await j.s.click('[data-testid="replace-image-btn"]');
    await save(j);
    expect(images(j, doc), 'still one picture after replace').toBe(1);
    await j.s.press('Delete');
    await save(j);
    expect(images(j, doc), 'none after delete').toBe(0);
  });

  await j.step('a picture already on the page: click it to select it', async () => {
    await j.stop();
    await j.start({ open: scan });
    await openMode(j, 'Edit');
    await j.waitFor(MARKER, { state: 'attached' });
    // A real hit test, on every platform: what is under the picture's centre
    // must be the picture's marker, not the text layer or another cover. (The
    // macOS bridge clicks by script and would never notice; WebDriver on
    // Windows did, and so does a person with a mouse.)
    expect(await j.s.call<string | null>('coveredBy', MARKER), 'nothing covers the picture').toBeNull();
    await j.s.click(MARKER);
    await j.waitFor(CARD);
    expect(await j.s.call<boolean>('exists', '[data-testid="replace-image-btn"]'), 'Replace image is offered').toBe(true);
  });

  await j.step('move it with the arrow keys; it is still one picture', async () => {
    await j.s.press('ArrowRight', ['shift']);
    await waitDirty(j, true);
    await save(j);
    expect(images(j, scan)).toBe(1);
  });

  await j.step('replace it: still one picture, and not the scan any more', async () => {
    const before = j.inspect(scan).raw.images ?? 0;
    await j.answerNativeDialogs(picture);
    await j.s.click('[data-testid="replace-image-btn"]');
    await waitDirty(j, true);
    await save(j);
    expect(images(j, scan), `one picture after replace (was ${before})`).toBe(1);
  });

  await j.step('delete it: no picture is left in the file', async () => {
    await j.s.press('Delete');
    await waitDirty(j, true);
    await save(j);
    expect(images(j, scan), 'none after delete').toBe(0);
  });
});
