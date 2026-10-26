// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// "Export as Markdown" and "Tables to Excel" (Preview).
//
// Both run the SDK's structured extraction in the backend
// (src-tauri/src/structured_export.rs). The SDK marks that extraction Preview,
// so the export dialog labels both formats Preview as well.
//
// Kept out of the dialog component so the routing -- which command, which
// file filter, what a cancel or a failure does -- is testable without a DOM:
// tests/structured-export.test.ts drives it with a fake picker and invoker.
// A failure is never swallowed here: the rejection propagates to the dialog,
// which puts it on the task as an error the user sees.
// ---------------------------------------------------------------------------

export type StructuredExportFormat = 'markdown' | 'tables_xlsx';

export interface StructuredExportRoute {
  /** The Tauri command that writes the file. */
  readonly command: 'export_as_markdown' | 'export_tables_to_xlsx';
  /** The save dialog's filter. The backend accepts only this extension. */
  readonly filter: { readonly name: string; readonly extensions: readonly string[] };
}

export const STRUCTURED_EXPORT_ROUTES: Readonly<Record<StructuredExportFormat, StructuredExportRoute>> = {
  markdown: {
    command: 'export_as_markdown',
    filter: { name: 'Markdown', extensions: ['md'] },
  },
  tables_xlsx: {
    command: 'export_tables_to_xlsx',
    filter: { name: 'Excel', extensions: ['xlsx'] },
  },
};

/** The backend's refusal for a document without a recognisable table. */
export const NO_TABLES_FOUND_CODE = 'no-tables-found';

/** The backend command that counts the tables before the save dialog opens. */
export const TABLE_COUNT_COMMAND = 'count_document_tables';

export function isStructuredExportFormat(format: string): format is StructuredExportFormat {
  return format === 'markdown' || format === 'tables_xlsx';
}

export interface StructuredExportDeps {
  /** Ask the user where to save; `null` when they cancel. */
  pickPath: (filter: StructuredExportRoute['filter']) => Promise<string | null>;
  /** Run a backend command; rejects with the backend's message. */
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Called once the path is chosen and before the backend runs. */
  onStart?: () => void;
}

export type StructuredExportOutcome =
  | { readonly status: 'cancelled' }
  | { readonly status: 'done'; readonly tables: number | null };

/**
 * Pick a path and run the export. Resolves `cancelled` when the user closes
 * the save dialog; rejects with the backend's error when the export fails.
 */
export async function runStructuredExport(
  format: StructuredExportFormat,
  deps: StructuredExportDeps,
): Promise<StructuredExportOutcome> {
  const route = STRUCTURED_EXPORT_ROUTES[format];
  // A document without a table is refused before any save dialog opens: the
  // person is not asked for a file name for a file that will not be written.
  if (format === 'tables_xlsx') {
    const found = await deps.invoke(TABLE_COUNT_COMMAND, {});
    if (typeof found !== 'number') {
      throw new Error(`${TABLE_COUNT_COMMAND} returned no table count`);
    }
    if (found === 0) throw new Error(`${NO_TABLES_FOUND_CODE}: no tables were recognised in this document.`);
  }
  const path = await deps.pickPath(route.filter);
  if (!path) return { status: 'cancelled' };
  deps.onStart?.();
  const result = await deps.invoke(route.command, { outputPath: path });
  if (format === 'tables_xlsx') {
    if (typeof result !== 'number') {
      throw new Error(`${route.command} returned no table count`);
    }
    return { status: 'done', tables: result };
  }
  return { status: 'done', tables: null };
}
