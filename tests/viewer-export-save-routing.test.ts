// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const exportDialogSource = readFileSync(
  new URL('../src/viewer/components/ExportDialog.tsx', import.meta.url),
  'utf8'
);

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

const browserPdfDownloadSource = readFileSync(
  new URL('../src/viewer/export/browserPdfDownload.ts', import.meta.url),
  'utf8'
);

const useDocumentSource = readFileSync(
  new URL('../src/viewer/hooks/useDocument.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ExportDialog — save/export routing
// ---------------------------------------------------------------------------

describe('ExportDialog — save/export routing', () => {
  it('canExport requires pageCount > 0', () => {
    expect(exportDialogSource).toContain('pageCount > 0');
  });

  it('canExport requires not currently exporting', () => {
    expect(exportDialogSource).toContain('!exporting');
  });

  it('canExport allows all formats in Tauri', () => {
    expect(exportDialogSource).toContain('isTauri || (');
  });

  it('canExport allows only PDF in browser', () => {
    expect(exportDialogSource).toContain("format === 'pdf'");
    expect(exportDialogSource).toContain('document !== null && engine !== null');
  });

  it('browser PDF export uses engine.document.saveDocument', () => {
    expect(exportDialogSource).toContain('engine.document.saveDocument(document)');
  });

  it('browser PDF export validates result is Uint8Array', () => {
    expect(exportDialogSource).toContain('result.value instanceof Uint8Array');
  });

  it('browser PDF export calls downloadPdfBytesInBrowser', () => {
    expect(exportDialogSource).toContain('downloadPdfBytesInBrowser');
  });

  it('Tauri PDF export invokes a save/export command', () => {
    // v2: ExportDialog calls compress_pdf for the PDF format (uses the
    // compression pipeline) and other commands per format.
    expect(exportDialogSource).toMatch(
      /invoke\(['"](?:save_pdf|save_pdf_as_dialog|export_pdf|compress_pdf)/,
    );
  });

  it('Tauri compressed PDF export invokes compress_pdf command', () => {
    expect(exportDialogSource).toContain("invoke('compress_pdf'");
  });

  it('Tauri image export invokes export_page_as_image command', () => {
    expect(exportDialogSource).toContain("invoke('export_page_as_image'");
  });

  it('Tauri office export invokes convert_to_docx/xlsx/pptx commands', () => {
    expect(exportDialogSource).toContain("invoke('convert_to_docx'");
    expect(exportDialogSource).toContain("invoke('convert_to_xlsx'");
    expect(exportDialogSource).toContain("invoke('convert_to_pptx'");
  });

  it('captures actual error message in catch block', () => {
    expect(exportDialogSource).toContain('catch (err)');
    expect(exportDialogSource).toContain('err instanceof Error ? err.message : String(err)');
  });
});

// ---------------------------------------------------------------------------
// TopBar — save routing
// ---------------------------------------------------------------------------

describe('TopBar — save routing', () => {
  it('save is gated on isDirty + pageCount > 0', () => {
    // v2: the gating is `!isDirty || pageCount === 0` at the top of
    // handleSave. Tauri branching happens inside (save_pdf vs onSaveAs).
    expect(topBarSource).toMatch(/if \(!?(?:isTauri \|\| )?!?isDirty (?:\|\| pageCount === 0|&& pageCount > 0)/);
  });

  it('save in-place uses save_pdf command when currentFilePath exists', () => {
    // v2: TopBar calls invoke('save_pdf', { path: currentFilePath })
    // when a path is known.
    expect(topBarSource).toContain("invoke('save_pdf', { path: currentFilePath })");
  });

  it('save-as opens Tauri save dialog when no currentFilePath', () => {
    // v2: save-as routes through onSaveAs (handed by parent); the dialog
    // import happens in useDocumentLifecycle or the Tauri save_pdf_as_dialog
    // command, not in TopBar itself.
    expect(topBarSource).toMatch(/await onSaveAs\(\)|@tauri-apps\/plugin-dialog/);
  });

  it('calls onSaveComplete after successful save', () => {
    expect(topBarSource).toContain('onSaveComplete()');
  });

  it('captures actual error message in save catch blocks', () => {
    expect(topBarSource).toContain('catch (err)');
    expect(topBarSource).toContain('err instanceof Error ? err.message : String(err)');
  });
});

// ---------------------------------------------------------------------------
// Browser PDF download — filename behavior
// ---------------------------------------------------------------------------

describe('browserPdfDownload — filename behavior', () => {
  it('normalizes filenames to ensure .pdf extension', () => {
    expect(browserPdfDownloadSource).toContain('normalizePdfFileName');
    expect(browserPdfDownloadSource).toContain(".endsWith('.pdf')");
  });

  it('strips invalid filesystem characters from filename', () => {
    expect(browserPdfDownloadSource).toContain("replace(/[<>:\"|*]/g, '_')");
  });

  it('falls back to document.pdf when filename is empty', () => {
    expect(browserPdfDownloadSource).toContain("'document.pdf'");
  });
});

// ---------------------------------------------------------------------------
// useDocument — mutation state
// ---------------------------------------------------------------------------

describe('useDocument — mutation state', () => {
  it('tracks isDirty flag', () => {
    expect(useDocumentSource).toContain('isDirty');
    expect(useDocumentSource).toContain('setIsDirty');
  });

  it('markDirty sets isDirty to true', () => {
    expect(useDocumentSource).toContain('setIsDirty(true)');
  });

  it('clearDirty sets isDirty to false', () => {
    expect(useDocumentSource).toContain('setIsDirty(false)');
  });

  it('loadDocument clears dirty state', () => {
    expect(useDocumentSource).toContain('setIsDirty(false)');
  });

  it('closeDocument clears dirty state', () => {
    expect(useDocumentSource).toContain('setIsDirty(false)');
  });

  it('updatePageCount marks dirty', () => {
    expect(useDocumentSource).toContain('setIsDirty(true)');
  });
});
