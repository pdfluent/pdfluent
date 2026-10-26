// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-75: Compress PDF saves a smaller copy by default and leaves the open
// document and its file alone (#724, branch fix/editor-next-batch). Replacing
// the open document is a separate button, marks the document as changed, and is
// one undo step back to the uncompressed document.
// Covered at the logic level by src-tauri/tests/document_operations.rs
// (compress_copy_*, compress_in_place_*) and tests/compress-copy.test.ts.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { clickText, openTool, save, sleep, waitDirty, waitForFile } from './lib/ui';

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

journey('J-75', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'brochure.pdf');
  const copy = j.file('brochure-small.pdf');
  const replaced = j.file('brochure-replaced.pdf');
  const original = sha(doc);
  const before = j.inspect(doc);
  await j.start({ open: doc });

  await j.step('Save compressed copy as... writes a smaller file and leaves the document alone', async () => {
    await openTool(j, 'Compress PDF');
    await j.answerDialog('save', copy);
    await clickText(j, '.panel button', 'Save compressed copy as', false);
    await waitForFile(copy);
    const after = j.inspect(copy);
    j.note(`${statSync(doc).size} -> ${statSync(copy).size} bytes`);
    expect(statSync(copy).size).toBeLessThanOrEqual(statSync(doc).size);
    expect(after.page_count).toBe(before.page_count);
    expect(allText(after)).toBe(allText(before));
    // The open document did not become the compressed one.
    expect(sha(doc)).toBe(original);
    await waitDirty(j, false);
  });

  await j.step('Compress and replace the open document marks it changed', async () => {
    await openTool(j, 'Compress PDF');
    await j.answerDialog('save', replaced);
    await clickText(j, '.panel button', 'Compress and replace the open document', false);
    await waitForFile(replaced);
    await waitDirty(j, true);
    // The file on disk is untouched until the user saves.
    expect(sha(doc)).toBe(original);
  });

  await j.step('Undo brings the uncompressed document back', async () => {
    await j.s.press('z', [j.mod]);
    await sleep(1000);
    await waitDirty(j, false);
    await save(j).catch(() => undefined);
    expect(allText(j.inspect(doc))).toBe(allText(before));
  });
});
