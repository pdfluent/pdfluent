// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ExportDialog — format options
// ---------------------------------------------------------------------------

describe('ExportDialog — format options', () => {
  it('renders a format selector with id export-format-select', () => {
    expect(exportDialogSource).toContain('export-format-select');
  });

  it('includes all five export format keys', () => {
    expect(exportDialogSource).toContain("'pdf'");
    expect(exportDialogSource).toContain("'compressed_pdf'");
    expect(exportDialogSource).toContain("'png'");
    expect(exportDialogSource).toContain("'jpeg'");
    expect(exportDialogSource).toContain("'docx'");
  });

  it('uses FORMAT_LABELS for format display names', () => {
    expect(exportDialogSource).toContain('FORMAT_LABELS');
    expect(exportDialogSource).toContain('PDF');
    expect(exportDialogSource).toContain('Gecomprimeerde PDF');
    expect(exportDialogSource).toContain('Word-document (.docx)');
  });

  it('invokes save_pdf for PDF export', () => {
    expect(exportDialogSource).toContain("invoke('save_pdf'");
  });

  it('invokes compress_pdf for compressed PDF export', () => {
    expect(exportDialogSource).toContain("invoke('compress_pdf'");
  });

  it('invokes export_page_as_image for PNG and JPEG export', () => {
    expect(exportDialogSource).toContain("invoke('export_page_as_image'");
  });

  it('invokes convert_to_docx for DOCX export', () => {
    expect(exportDialogSource).toContain("invoke('convert_to_docx'");
  });
});

// ---------------------------------------------------------------------------
// ExportDialog — page range controls
// ---------------------------------------------------------------------------

describe('ExportDialog — page range controls', () => {
  it('defines IMAGE_FORMATS set containing png and jpeg', () => {
    expect(exportDialogSource).toContain('IMAGE_FORMATS');
    expect(exportDialogSource).toContain("new Set(['png', 'jpeg'])");
  });

  it('shows page range controls only when isImageFormat is true', () => {
    expect(exportDialogSource).toContain('isImageFormat');
    expect(exportDialogSource).toContain('{isImageFormat && (');
  });

  it('uses radio inputs with name export-page-range', () => {
    expect(exportDialogSource).toContain('export-page-range');
    expect(exportDialogSource).toContain('type="radio"');
  });

  it('offers current page and all pages options', () => {
    expect(exportDialogSource).toContain("value=\"current\"");
    expect(exportDialogSource).toContain("value=\"all\"");
    expect(exportDialogSource).toContain('Huidige pagina');
    expect(exportDialogSource).toContain("Alle pagina's");
  });

  it('exports all pages sequentially with progress update', () => {
    expect(exportDialogSource).toContain('for (let i = 0; i < pageCount; i++)');
    expect(exportDialogSource).toContain('(i + 1) / pageCount * 100');
    expect(exportDialogSource).toContain("update(taskId, { progress:");
  });

  it('picks a directory for all-pages export', () => {
    expect(exportDialogSource).toContain('directory: true');
  });
});

// ---------------------------------------------------------------------------
// ExportDialog — task queue integration
// ---------------------------------------------------------------------------

describe('ExportDialog — task queue integration', () => {
  it('reads push and update from useTaskQueueContext', () => {
    expect(exportDialogSource).toContain('useTaskQueueContext');
    expect(exportDialogSource).toContain('push,');
    expect(exportDialogSource).toContain('update }');
  });

  it('pushes a running task at export start', () => {
    expect(exportDialogSource).toContain("status: 'running'");
    expect(exportDialogSource).toContain('push({');
  });

  it('updates task to done on success', () => {
    expect(exportDialogSource).toContain("status: 'done'");
    expect(exportDialogSource).toContain("update(taskId, { status: 'done'");
  });

  it('updates task to error on failure', () => {
    expect(exportDialogSource).toContain("status: 'error'");
    expect(exportDialogSource).toContain("update(taskId, { status: 'error'");
  });

  it('generates unique task id per export', () => {
    expect(exportDialogSource).toContain('export-${Date.now()}');
  });

  it('closes the dialog before the async operation completes', () => {
    // onClose() must appear before the awaited invoke call
    const pushIndex = exportDialogSource.indexOf('push({');
    const firstOnCloseIndex = exportDialogSource.indexOf('onClose();', pushIndex);
    const firstInvokeIndex = exportDialogSource.indexOf("await invoke('save_pdf'");
    expect(firstOnCloseIndex).toBeGreaterThan(pushIndex);
    expect(firstOnCloseIndex).toBeLessThan(firstInvokeIndex);
  });
});

// ---------------------------------------------------------------------------
// ExportDialog — dialog structure
// ---------------------------------------------------------------------------

describe('ExportDialog — dialog structure', () => {
  it('has role="dialog"', () => {
    expect(exportDialogSource).toContain('role="dialog"');
  });

  it('has aria-labelledby="export-dialog-title"', () => {
    expect(exportDialogSource).toContain('aria-labelledby="export-dialog-title"');
  });

  it('renders a cancel button', () => {
    expect(exportDialogSource).toContain('Annuleren');
  });

  it('renders an export button', () => {
    expect(exportDialogSource).toContain('Exporteren');
  });

  it('export button is disabled in non-Tauri environments', () => {
    expect(exportDialogSource).toContain('!isTauri');
  });

  it('resets state when dialog opens', () => {
    expect(exportDialogSource).toContain("setFormat('pdf')");
    expect(exportDialogSource).toContain("setPageRange('current')");
    expect(exportDialogSource).toContain('setExporting(false)');
  });

  it('renders nothing when isOpen is false', () => {
    expect(exportDialogSource).toContain('if (!isOpen) return null');
  });
});

// ---------------------------------------------------------------------------
// TopBar — export wiring
// ---------------------------------------------------------------------------

describe('TopBar — export wiring', () => {
  it('declares onOpenExport in props interface', () => {
    expect(topBarSource).toContain('onOpenExport: () => void');
  });

  it('export button calls onOpenExport on click', () => {
    expect(topBarSource).toContain('onClick={onOpenExport}');
  });

  it('export button is disabled when pageCount is zero', () => {
    expect(topBarSource).toContain('pageCount === 0');
  });

  it('no longer contains the export TODO marker', () => {
    expect(topBarSource).not.toContain('TODO(pdfluent-viewer): implement export');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — ExportDialog wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — ExportDialog wiring', () => {
  it('imports ExportDialog', () => {
    expect(viewerAppSource).toContain('ExportDialog');
  });

  it('tracks export dialog open state', () => {
    expect(viewerAppSource).toContain('exportOpen');
    expect(viewerAppSource).toContain('setExportOpen');
  });

  it('passes onOpenExport to TopBar', () => {
    expect(viewerAppSource).toContain('onOpenExport');
    expect(viewerAppSource).toContain('setExportOpen(true)');
  });

  it('renders ExportDialog with required props', () => {
    expect(viewerAppSource).toContain('<ExportDialog');
    expect(viewerAppSource).toContain('isOpen={exportOpen}');
    expect(viewerAppSource).toContain('pageIndex={pageIndex}');
    expect(viewerAppSource).toContain('pageCount={pageCount}');
  });

  it('passes onClose that sets exportOpen to false', () => {
    expect(viewerAppSource).toContain('setExportOpen(false)');
  });
});
