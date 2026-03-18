// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const gridSource = readFileSync(
  new URL('../src/viewer/components/OrganizeGrid.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Locate assembly handler bodies for scoped assertions
// ---------------------------------------------------------------------------

const appendStart  = gridSource.indexOf('async function handleAppendPdf');
const appendEnd    = gridSource.indexOf('async function handleInsertPdf');
const appendBody   = gridSource.slice(appendStart, appendEnd);

const insertStart  = gridSource.indexOf('async function handleInsertPdf');
const insertEnd    = gridSource.indexOf('async function handleExportSelection');
const insertBody   = gridSource.slice(insertStart, insertEnd);

const exportStart  = gridSource.indexOf('async function handleExportSelection');
const exportEnd    = gridSource.indexOf('async function handleSplitIntoPages');
const exportBody   = gridSource.slice(exportStart, exportEnd);

const splitStart   = gridSource.indexOf('async function handleSplitIntoPages');
const splitEnd     = gridSource.indexOf('// Use refs to keep keyboard handler');
const splitBody    = gridSource.slice(splitStart, splitEnd);

// ---------------------------------------------------------------------------
// Batch 2 — Merge / Append PDF
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly: append PDF', () => {
  it('renders the PDF toevoegen button with data-testid="organize-merge-pdf-btn"', () => {
    expect(gridSource).toContain('data-testid="organize-merge-pdf-btn"');
  });

  it('disables the button when isTauri is false or pageCount is 0', () => {
    expect(gridSource).toContain('!isTauri || pageCount === 0');
  });

  it('opens a file dialog with PDF filter', () => {
    expect(appendBody).toContain("@tauri-apps/plugin-dialog");
    expect(appendBody).toContain("extensions: ['pdf']");
  });

  it('invokes append_pdf with sourcePath', () => {
    expect(appendBody).toContain("'append_pdf'");
    expect(appendBody).toContain('sourcePath');
  });

  it('calls onMarkDirty after successful append', () => {
    expect(appendBody).toContain('onMarkDirty()');
  });

  it('calls onPageMutation with new page count and navigateTo after successful append', () => {
    expect(appendBody).toContain('onPageMutation(result.page_count,');
    // navigates to the first new page (captured as firstNewPageIndex before the operation)
    expect(appendBody).toContain('firstNewPageIndex');
  });

  it('is guarded: returns early when isTauri is false, pageCount is 0, or busy', () => {
    expect(appendBody).toContain('if (!isTauri || pageCount === 0 || isAssemblyBusy) return');
  });

  it('pushes a running task on start', () => {
    expect(appendBody).toContain("status: 'running'");
    expect(appendBody).toContain('push(');
  });

  it('updates task to done on success', () => {
    expect(appendBody).toContain("status: 'done'");
    expect(appendBody).toContain("'PDF toegevoegd'");
  });

  it('updates task to error on failure', () => {
    expect(appendBody).toContain("status: 'error'");
    expect(appendBody).toContain("'PDF toevoegen mislukt'");
  });
});

// ---------------------------------------------------------------------------
// Batch 3 — Insert PDF at Position
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly: insert PDF', () => {
  it('renders the insert button with data-testid="organize-insert-before-btn"', () => {
    expect(gridSource).toContain('data-testid="organize-insert-before-btn"');
  });

  it('opens a file dialog with PDF filter', () => {
    expect(insertBody).toContain("@tauri-apps/plugin-dialog");
    expect(insertBody).toContain("extensions: ['pdf']");
  });

  it('invokes insert_pdf_at with sourcePath and atIndex', () => {
    expect(insertBody).toContain("'insert_pdf_at'");
    expect(insertBody).toContain('sourcePath');
    expect(insertBody).toContain('atIndex');
  });

  it('uses first selected page (Math.min of selectedPages) as insert position', () => {
    expect(insertBody).toContain('Math.min(...selectedPages)');
  });

  it('calls onMarkDirty after successful insert', () => {
    expect(insertBody).toContain('onMarkDirty()');
  });

  it('calls onPageMutation with new page count and navigateTo (atIndex) after successful insert', () => {
    expect(insertBody).toContain('onPageMutation(result.page_count,');
    expect(insertBody).toContain('atIndex');
  });

  it('clears selection after successful insert', () => {
    expect(insertBody).toContain('clearSelection()');
  });

  it('pushes a running task on start', () => {
    expect(insertBody).toContain("status: 'running'");
    expect(insertBody).toContain('push(');
  });

  it('updates task to error on failure', () => {
    expect(insertBody).toContain("status: 'error'");
    expect(insertBody).toContain("'PDF invoegen mislukt'");
  });
});

// ---------------------------------------------------------------------------
// Batch 4 — Export Selected Pages
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly: export selection', () => {
  it('renders the export button with data-testid="organize-export-selection-btn"', () => {
    expect(gridSource).toContain('data-testid="organize-export-selection-btn"');
  });

  it('opens a save dialog', () => {
    expect(exportBody).toContain("@tauri-apps/plugin-dialog");
    expect(exportBody).toContain('save(');
  });

  it('invokes extract_pages_to_file with pageIndices and outputPath', () => {
    expect(exportBody).toContain("'extract_pages_to_file'");
    expect(exportBody).toContain('pageIndices');
    expect(exportBody).toContain('outputPath');
  });

  it('does NOT call onMarkDirty (current document unchanged)', () => {
    expect(exportBody).not.toContain('onMarkDirty');
  });

  it('does NOT call onPageMutation (current document unchanged)', () => {
    expect(exportBody).not.toContain('onPageMutation');
  });

  it('is guarded: returns early when no pages selected', () => {
    expect(exportBody).toContain('selectedPages.size === 0');
  });

  it('sorts selected indices before sending', () => {
    expect(exportBody).toContain('.sort(');
  });

  it('pushes a running task on start', () => {
    expect(exportBody).toContain("status: 'running'");
    expect(exportBody).toContain('push(');
  });

  it('updates task to done on success', () => {
    expect(exportBody).toContain("status: 'done'");
    expect(exportBody).toContain('geëxporteerd');
  });

  it('updates task to error on failure', () => {
    expect(exportBody).toContain("status: 'error'");
    expect(exportBody).toContain("'Exporteren mislukt'");
  });
});

// ---------------------------------------------------------------------------
// Batch 5 — Split into Pages
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly: split into pages', () => {
  it('renders the split button with data-testid="organize-split-btn"', () => {
    expect(gridSource).toContain('data-testid="organize-split-btn"');
  });

  it('only shows split button when pageCount > 1', () => {
    expect(gridSource).toContain('{pageCount > 1 && (');
  });

  it('opens a directory picker', () => {
    expect(splitBody).toContain("@tauri-apps/plugin-dialog");
    expect(splitBody).toContain('directory: true');
  });

  it('invokes split_into_pages with outputDir', () => {
    expect(splitBody).toContain("'split_into_pages'");
    expect(splitBody).toContain('outputDir');
  });

  it('does NOT call onMarkDirty (current document unchanged)', () => {
    expect(splitBody).not.toContain('onMarkDirty');
  });

  it('does NOT call onPageMutation (current document unchanged)', () => {
    expect(splitBody).not.toContain('onPageMutation');
  });

  it('is guarded by pageCount <= 1', () => {
    expect(splitBody).toContain('pageCount <= 1');
  });

  it('pushes a running task on start', () => {
    expect(splitBody).toContain("status: 'running'");
    expect(splitBody).toContain('push(');
  });

  it('updates task to done reporting how many pages were saved', () => {
    expect(splitBody).toContain("status: 'done'");
    expect(splitBody).toContain("paths.length");
  });

  it('updates task to error on failure', () => {
    expect(splitBody).toContain("status: 'error'");
    expect(splitBody).toContain("'Splitsen mislukt'");
  });
});

// ---------------------------------------------------------------------------
// Batch 6 — Assembly action bar layout
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly: action bar layout', () => {
  it('renders PDF toevoegen button in the no-selection organize-header', () => {
    // The ternary puts batch-action-bar first, then organize-header (else branch)
    const headerStart = gridSource.indexOf('data-testid="organize-header"');
    // The header section ends at the next sibling — pending-order bar or page grid
    const headerEnd   = gridSource.indexOf('data-testid="organize-order-bar"', headerStart);
    const headerSection = gridSource.slice(headerStart, headerEnd > 0 ? headerEnd : headerStart + 2000);
    expect(headerSection).toContain('data-testid="organize-merge-pdf-btn"');
  });

  it('renders insert-before and export-selection in the batch-action-bar', () => {
    const barStart = gridSource.indexOf('data-testid="batch-action-bar"');
    const barSection = gridSource.slice(barStart, barStart + 2000);
    expect(barSection).toContain('data-testid="organize-insert-before-btn"');
    expect(barSection).toContain('data-testid="organize-export-selection-btn"');
  });
});

// ---------------------------------------------------------------------------
// Batch 7 — Dirty state consistency
// ---------------------------------------------------------------------------

describe('ViewerApp — dirty on page mutation', () => {
  it('handlePageMutation calls markDirty()', () => {
    const mutationStart = viewerAppSource.indexOf('const handlePageMutation = useCallback');
    const mutationEnd   = viewerAppSource.indexOf('}, [updatePageCount', mutationStart);
    const mutationBody  = viewerAppSource.slice(mutationStart, mutationEnd + 40);
    expect(mutationBody).toContain('markDirty()');
  });

  it('handlePageMutation includes markDirty in its dependency array', () => {
    expect(viewerAppSource).toContain('markDirty]');
  });

  it('passes onMarkDirty={markDirty} to OrganizeGrid', () => {
    expect(viewerAppSource).toContain('onMarkDirty={markDirty}');
  });
});

// ---------------------------------------------------------------------------
// Batch 8 — Guards
// ---------------------------------------------------------------------------

describe('OrganizeGrid — assembly guards', () => {
  it('append PDF button is disabled when pageCount === 0 or assembly is busy', () => {
    expect(gridSource).toContain('disabled={!isTauri || pageCount === 0 || isAssemblyBusy}');
  });

  it('export selection is disabled when no selection (guarded in handler)', () => {
    expect(exportBody).toContain('selectedPages.size === 0');
  });

  it('split button is hidden when pageCount <= 1', () => {
    expect(gridSource).toContain('{pageCount > 1 && (');
  });

  it('split handler guards against pageCount <= 1 or busy', () => {
    expect(splitBody).toContain('if (!isTauri || pageCount <= 1 || isAssemblyBusy) return');
  });
});
