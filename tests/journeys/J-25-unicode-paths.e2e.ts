// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-25: a file whose folder and name carry accents, CJK and an emoji opens,
// and Save writes back to that same path.

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { rotatePageRight, save, waitForPages, waitTitle } from './lib/ui';

journey('J-25', async (j) => {
  const dir = j.file('Ünïcødé 文件夹');
  mkdirSync(dir);
  const name = 'Bericht é 中文 📄.pdf';
  const doc = path.join(dir, name);
  copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf'), doc);
  await j.start({ open: doc });
  await j.step('it opens', async () => {
    await waitForPages(j, 2);
    await waitTitle(j, 'Bericht é 中文');
  });
  await j.step('Save writes to the same path', async () => {
    await rotatePageRight(j, 0);
    await save(j);
    expect(readdirSync(dir)).toEqual([name]);
    expect(j.inspect(doc).raw.pages?.[0]?.rotate).toBe(90);
  });
});
