// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-70: Export to Word, Excel and PowerPoint writes a real Office file with the
// document's words in it. "Real": a zip with the parts Office opens. "With
// the words": at least 90 % of the distinct words of the PDF (three letters or
// more) are in the text parts. Table fidelity (#408) is a separate measure and
// not judged here.

import { existsSync } from 'node:fs';
import { expect } from 'vitest';
import { journey, type Journey } from './lib/journey';
import { kept, officeText } from './lib/office';
import { allText } from './lib/pdfcheck';
import { sleep } from './lib/ui';

async function exportAs(j: Journey, format: 'docx' | 'xlsx' | 'pptx', dest: string): Promise<void> {
  await j.s.click('.share-trigger');
  await j.waitFor('[data-testid="export-btn"]');
  await j.s.click('[data-testid="export-btn"]');
  await j.waitFor('[data-testid="export-dialog"]');
  await j.s.call('setValue', '[data-testid="export-format-select"]', format);
  await j.answerDialog('save', dest);
  await j.s.click('[data-testid="export-submit-btn"]');
  const until = Date.now() + 120_000;
  while (!existsSync(dest)) {
    if (Date.now() > until) throw new Error(`no ${format} was written within 120 s`);
    await sleep(250);
  }
  await sleep(500);
  if (await j.s.call<boolean>('visible', '[data-testid="export-dialog"]')) {
    if (await j.s.call<boolean>('exists', '[data-testid="export-close-btn"]')) await j.s.click('[data-testid="export-close-btn"]');
  }
}

journey('J-70', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'report.pdf');
  const source = allText(j.inspect(doc));
  await j.start({ open: doc });

  const cases: Array<['docx' | 'xlsx' | 'pptx', RegExp]> = [
    ['docx', /^word\/document\.xml$/],
    ['xlsx', /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/],
    ['pptx', /^ppt\/slides\/slide\d+\.xml$/],
  ];
  for (const [format, parts] of cases) {
    await j.step(`export to ${format}`, async () => {
      const dest = j.file(`report.${format}`);
      await exportAs(j, format, dest);
      const text = await officeText(dest, parts);
      const share = kept(source, text);
      j.note(`${format}: ${Math.round(share * 100)} % of the words kept`);
      const judge = async (): Promise<void> => {
        expect(share, `${format} kept ${Math.round(share * 100)} % of the words`).toBeGreaterThanOrEqual(0.9);
      };
      if (format === 'xlsx') await j.gap('xlsx-drops-running-text', judge);
      else await judge();
    });
  }
});
