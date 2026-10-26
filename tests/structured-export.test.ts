// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// "Export as Markdown" and "Tables to Excel" (Preview): the routing from the
// export dialog to the backend, driven with a fake save dialog and a fake
// invoker. The content of what the backend writes is checked in
// src-tauri/tests/exports_keep_their_content.rs.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isStructuredExportFormat,
  runStructuredExport,
  STRUCTURED_EXPORT_ROUTES,
  type StructuredExportDeps,
  type StructuredExportRoute,
} from '../src/viewer/export/structuredExport';

interface Recorder {
  deps: StructuredExportDeps;
  calls: { command: string; args: Record<string, unknown> }[];
  filters: StructuredExportRoute['filter'][];
  started: () => number;
}

function recorder(path: string | null, result: unknown, tableCount: unknown = 1): Recorder {
  const calls: Recorder['calls'] = [];
  const filters: Recorder['filters'] = [];
  let started = 0;
  const deps: StructuredExportDeps = {
    pickPath: (filter) => {
      filters.push(filter);
      return Promise.resolve(path);
    },
    invoke: (command, args) => {
      calls.push({ command, args });
      if (command === 'count_document_tables') return Promise.resolve(tableCount);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    onStart: () => { started += 1; },
  };
  return { deps, calls, filters, started: () => started };
}

describe('structured export routing', () => {
  it('Markdown asks for a .md path and runs export_as_markdown with it', async () => {
    const rec = recorder('/tmp/out.md', null);
    const outcome = await runStructuredExport('markdown', rec.deps);
    expect(outcome).toEqual({ status: 'done', tables: null });
    expect(rec.filters).toEqual([{ name: 'Markdown', extensions: ['md'] }]);
    expect(rec.calls).toEqual([{ command: 'export_as_markdown', args: { outputPath: '/tmp/out.md' } }]);
    expect(rec.started()).toBe(1);
  });

  it('Tables to Excel asks for an .xlsx path and reports the table count', async () => {
    const rec = recorder('/tmp/tables.xlsx', 3);
    const outcome = await runStructuredExport('tables_xlsx', rec.deps);
    expect(outcome).toEqual({ status: 'done', tables: 3 });
    expect(rec.filters).toEqual([{ name: 'Excel', extensions: ['xlsx'] }]);
    expect(rec.calls).toEqual([
      { command: 'count_document_tables', args: {} },
      { command: 'export_tables_to_xlsx', args: { outputPath: '/tmp/tables.xlsx' } },
    ]);
  });

  it('a document without a table is refused before any save dialog opens', async () => {
    const rec = recorder('/tmp/none.xlsx', 0, 0);
    await expect(runStructuredExport('tables_xlsx', rec.deps)).rejects.toThrow('no-tables-found');
    expect(rec.filters, 'no save dialog was opened').toEqual([]);
    expect(rec.calls.map((c) => c.command)).toEqual(['count_document_tables']);
    expect(rec.started()).toBe(0);
  });

  it('a cancelled save dialog runs nothing', async () => {
    const rec = recorder(null, null);
    const outcome = await runStructuredExport('markdown', rec.deps);
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(rec.calls).toEqual([]);
    expect(rec.started()).toBe(0);
  });

  it('a backend failure reaches the caller instead of being swallowed', async () => {
    const rec = recorder('/tmp/tables.xlsx', new Error('no-tables-found: no tables were recognised in this document.'));
    await expect(runStructuredExport('tables_xlsx', rec.deps)).rejects.toThrow('no-tables-found');
  });

  it('a tables export that answers without a count is a failure, not a success', async () => {
    const rec = recorder('/tmp/tables.xlsx', null);
    await expect(runStructuredExport('tables_xlsx', rec.deps)).rejects.toThrow('no table count');
  });

  it('knows its own formats and no others', () => {
    expect(isStructuredExportFormat('markdown')).toBe(true);
    expect(isStructuredExportFormat('tables_xlsx')).toBe(true);
    expect(isStructuredExportFormat('xlsx')).toBe(false);
    expect(Object.keys(STRUCTURED_EXPORT_ROUTES).sort()).toEqual(['markdown', 'tables_xlsx']);
  });
});

describe('structured export wiring', () => {
  const dialog = readFileSync(new URL('../src/viewer/components/ExportDialog.tsx', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const en = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')) as {
    exportDialog: Record<string, string>;
    tasks: Record<string, string>;
  };

  it('the dialog offers both formats and routes them through runStructuredExport', () => {
    expect(dialog).toContain("markdown: 'exportDialog.formatMarkdown'");
    expect(dialog).toContain("tables_xlsx: 'exportDialog.formatTablesXlsx'");
    expect(dialog).toContain('runStructuredExport(format,');
  });

  // A refusal before the save dialog happens before any task exists: the catch
  // must push the failed task itself, or `update` changes nothing and the person
  // sees no reason (J-99 on macOS and Windows, run 39675678283).
  it('a failure before the first task was pushed still shows its message', () => {
    const catchBlock = dialog.slice(dialog.indexOf('} catch (err) {'));
    const pushAt = catchBlock.indexOf("push({ id: taskId, label, progress: null, status: 'error' })");
    const updateAt = catchBlock.indexOf("update(taskId, { status: 'error', label })");
    expect(pushAt, 'the catch pushes the failed task').toBeGreaterThan(-1);
    expect(updateAt, 'and then updates it').toBeGreaterThan(pushAt);
  });

  it('both formats are labelled Preview', () => {
    expect(en.exportDialog.formatMarkdown).toMatch(/Preview/);
    expect(en.exportDialog.formatTablesXlsx).toMatch(/Preview/);
  });

  it('the backend registers both commands and validates the extension', () => {
    for (const { command } of Object.values(STRUCTURED_EXPORT_ROUTES)) {
      expect(lib).toMatch(new RegExp(`^\\s+${command},$`, 'm'));
      expect(lib).toContain(`async fn ${command}(`);
    }
    expect(lib).toContain('validate_dialog_output_path(&output_path, &["md"])');
    expect(lib).toMatch(/^\s+count_document_tables,$/m);
    expect(lib).toContain('async fn count_document_tables(');
  });
});
