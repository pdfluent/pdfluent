// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The Export dialog, driven the way a person drives it: Share > Export, pick a
// format, answer the save dialog, wait for the file.

import { existsSync } from 'node:fs';
import type { Journey } from './journey';
import { sleep } from './ui';

export type ExportFormatId = 'docx' | 'xlsx' | 'pptx' | 'markdown' | 'tables_xlsx';

/** Open the Export dialog and choose `format`; returns the labels of all formats offered. */
export async function openExport(j: Journey, format: ExportFormatId): Promise<string[]> {
  await j.s.click('.share-trigger');
  await j.waitFor('[data-testid="export-btn"]');
  await j.s.click('[data-testid="export-btn"]');
  await j.waitFor('[data-testid="export-dialog"]');
  await j.s.call('setValue', '[data-testid="export-format-select"]', format);
  return j.s.call<string[]>('texts', '[data-testid="export-format-select"] option');
}

/** Close the dialog if it is still open (an export that failed leaves it up or closes it). */
export async function closeExportDialog(j: Journey): Promise<void> {
  if (await j.s.call<boolean>('visible', '[data-testid="export-dialog"]')) {
    if (await j.s.call<boolean>('exists', '[data-testid="export-close-btn"]')) await j.s.click('[data-testid="export-close-btn"]');
  }
}

/** Export as `format` into `dest` and wait until the file exists. */
export async function exportAs(j: Journey, format: ExportFormatId, dest: string): Promise<void> {
  await openExport(j, format);
  await j.answerDialog('save', dest);
  await j.s.click('[data-testid="export-submit-btn"]');
  const until = Date.now() + 120_000;
  while (!existsSync(dest)) {
    if (Date.now() > until) throw new Error(`no ${format} file was written within 120 s`);
    await sleep(250);
  }
  await sleep(500);
  await closeExportDialog(j);
}
