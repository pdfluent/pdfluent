// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-99: Share > Export > Tables to Excel (Preview) writes every table the
// extraction recognises to its own sheet, and says so when there is none.
// The fixture table_report.pdf (src-tauri/tests/fixtures/make_table_report.py)
// has one ruled table: Item / Quantity / Price and three rows. The workbook is
// read back from the zip: the header and the item names are shared strings, the
// quantities and prices are numbers. A document without a table gets the
// message "No tables were recognised in this document." and no file. The Rust
// half is src-tauri/tests/structured_export_files.rs.

import { existsSync } from 'node:fs';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { exportAs, openExport } from './lib/export';
import { officeText } from './lib/office';
import { sleep, waitForText } from './lib/ui';

journey('J-99', async (j) => {
  const table = j.fixture('src-tauri/tests/fixtures/table_report.pdf', 'stock.pdf');
  const prose = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'prose.pdf');
  await j.start({ open: table });

  await j.step('the dialog offers Tables to Excel and says it is a preview', async () => {
    const labels = await openExport(j, 'tables_xlsx');
    expect(labels.some((l) => /tables/i.test(l) && /preview/i.test(l)), JSON.stringify(labels)).toBe(true);
    await j.s.click('[data-testid="export-close-btn"]');
  });

  await j.step('export the table; the workbook has its header, names and numbers', async () => {
    const dest = j.file('stock.xlsx');
    await exportAs(j, 'tables_xlsx', dest);
    const text = await officeText(dest, /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/);
    for (const cell of ['Item', 'Quantity', 'Price', 'Widget', 'Gadget', 'Gizmo']) {
      expect(text, `the workbook has ${cell}`).toContain(cell);
    }
    for (const n of ['2.5', '12', '3.75']) expect(text, `the workbook has the number ${n}`).toContain(n);
  });

  await j.step('a document without a table says so and writes no file', async () => {
    await j.stop();
    await j.start({ open: prose });
    const dest = j.file('prose.xlsx');
    await openExport(j, 'tables_xlsx');
    await j.answerDialog('save', dest);
    await j.s.click('[data-testid="export-submit-btn"]');
    await waitForText(j, /No tables were recognised/, 60_000);
    await sleep(1000);
    expect(existsSync(dest), 'a refused export leaves no file').toBe(false);
  });
});
