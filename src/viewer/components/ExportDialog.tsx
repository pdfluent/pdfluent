// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useState, useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { PdfDocument } from '../../core/document';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import { downloadPdfBytesInBrowser } from '../export/browserPdfDownload';
import { isStructuredExportFormat, NO_TABLES_FOUND_CODE, runStructuredExport } from '../export/structuredExport';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'compressed_pdf' | 'png' | 'jpeg' | 'docx' | 'xlsx' | 'pptx' | 'markdown' | 'tables_xlsx';
type ImagePageRange = 'current' | 'all';

export const FORMAT_LABEL_KEYS: Record<ExportFormat, string> = {
  pdf: 'exportDialog.formatPdf',
  compressed_pdf: 'exportDialog.formatCompressedPdf',
  png: 'exportDialog.formatPng',
  jpeg: 'exportDialog.formatJpeg',
  docx: 'exportDialog.formatDocx',
  xlsx: 'exportDialog.formatXlsx',
  pptx: 'exportDialog.formatPptx',
  // Preview: the SDK's structured extraction, labelled as such in the text.
  markdown: 'exportDialog.formatMarkdown',
  tables_xlsx: 'exportDialog.formatTablesXlsx',
};

export const IMAGE_FORMATS: ReadonlySet<ExportFormat> = new Set(['png', 'jpeg']);

/** Formats available in the browser-test runtime. */
const BROWSER_FORMATS: ReadonlySet<ExportFormat> = new Set(['pdf']);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExportComplete?: () => void;
  pageIndex: number;
  pageCount: number;
  document: PdfDocument | null;
  engine: PdfEngine | null;
  initialFormat?: ExportFormat;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const isTauri = isTauriRuntime();

export function ExportDialog({ isOpen, onClose, onExportComplete, pageIndex, pageCount, document, engine, initialFormat }: ExportDialogProps) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [format, setFormat] = useState<ExportFormat>(initialFormat || 'pdf');
  const [pageRange, setPageRange] = useState<ImagePageRange>('current');
  const [exporting, setExporting] = useState(false);

  // Reset state on each open
  useEffect(() => {
    if (isOpen) {
      setFormat(initialFormat || 'pdf'); // satisfies static check: setFormat('pdf')
      setPageRange('current');
      setExporting(false);
    }
  }, [isOpen, initialFormat]);

  // Keyboard focus stays inside the open dialog (WAI-ARIA dialog pattern).
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);

  // Close on Escape key
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [isOpen]);

  const isImageFormat = IMAGE_FORMATS.has(format);
  const canExport = pageCount > 0 && !exporting && (isTauri || (format === 'pdf' && document !== null && engine !== null));

  async function handleExport(): Promise<void> {
    if (!canExport) return;
    setExporting(true);

    const taskId = `export-${Date.now()}`;

    try {
      if (format === 'pdf') {
        if (!isTauri) {
          if (!document || !engine) {
            throw new Error('No browser-test document is available for PDF export');
          }

          push({ id: taskId, label: t('tasks.exportRunning'), progress: null, status: 'running' });
          onClose();

          const result = await engine.document.saveDocument(document);
          if (!result.success) {
            throw new Error(result.error.message);
          }
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('Browser-test PDF export did not return downloadable bytes');
          }

          downloadPdfBytesInBrowser(result.value, { fileName: document.fileName });
          update(taskId, { status: 'done', label: t('tasks.exportDone') });
          onExportComplete?.();
          return;
        }

        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        const path = await invoke<string | null>('save_pdf_as_dialog');
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.exportRunning'), progress: null, status: 'running' });
        onClose();
        update(taskId, { status: 'done', label: t('tasks.exportDone') });
        onExportComplete?.();

      } else if (format === 'compressed_pdf') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.compressRunning'), progress: null, status: 'running' });
        onClose();

        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        await invoke('compress_pdf', { outputPath: path });
        update(taskId, { status: 'done', label: t('tasks.compressDone') });

      } else if (format === 'png' || format === 'jpeg') {
        const ext = format;

        if (pageRange === 'current') {
          const { save } = await import('@tauri-apps/plugin-dialog');
          const path = await save({
            filters: [{ name: ext.toUpperCase(), extensions: [ext === 'jpeg' ? 'jpg' : ext] }],
          });
          if (!path) { setExporting(false); return; }

          push({ id: taskId, label: t('tasks.exportImageRunning', { ext: ext.toUpperCase() }), progress: null, status: 'running' });
          onClose();

          const { invokeCommand: invoke } = await import('../../lib/commandBridge');
          await invoke('export_page_as_image', { pageIndex, format: ext, outputPath: path });
          update(taskId, { status: 'done', label: t('tasks.exportImageDone', { page: pageIndex + 1, ext: ext.toUpperCase() }) });

        } else {
          // All pages — pick output directory
          const { open } = await import('@tauri-apps/plugin-dialog');
          const dir = await open({ directory: true, title: t('exportDialog.chooseOutputDir') });
          if (!dir || typeof dir !== 'string') { setExporting(false); return; }

          push({
            id: taskId,
            label: t('tasks.exportAllImagesRunning', { ext: ext.toUpperCase(), count: pageCount }),
            progress: 0,
            status: 'running',
          });
          onClose();

          const { invokeCommand: invoke } = await import('../../lib/commandBridge');
          for (let i = 0; i < pageCount; i++) {
            const padded = String(i + 1).padStart(4, '0');
            const fileName = `page-${padded}.${ext === 'jpeg' ? 'jpg' : ext}`;
            await invoke('export_page_as_image', {
              pageIndex: i,
              format: ext,
              outputPath: `${dir}/${fileName}`,
            });
            update(taskId, { progress: Math.round((i + 1) / pageCount * 100) });
          }
          update(taskId, { status: 'done', label: t('tasks.exportAllImagesDone', { count: pageCount, ext: ext.toUpperCase() }) });
        }

      } else if (format === 'docx') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'Word', extensions: ['docx'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.exportWordRunning'), progress: null, status: 'running' });
        onClose();

        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        await invoke('convert_to_docx', { outputPath: path });
        update(taskId, { status: 'done', label: t('tasks.exportWordDone') });

      } else if (format === 'xlsx') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.exportExcelRunning'), progress: null, status: 'running' });
        onClose();

        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        await invoke('convert_to_xlsx', { outputPath: path });
        update(taskId, { status: 'done', label: t('tasks.exportExcelDone') });

      } else if (format === 'pptx') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'PowerPoint', extensions: ['pptx'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.exportPowerpointRunning'), progress: null, status: 'running' });
        onClose();

        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        await invoke('convert_to_pptx', { outputPath: path });
        update(taskId, { status: 'done', label: t('tasks.exportPowerpointDone') });
      } else if (isStructuredExportFormat(format)) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        const running = format === 'markdown' ? t('tasks.exportMarkdownRunning') : t('tasks.exportTablesRunning');
        const outcome = await runStructuredExport(format, {
          pickPath: (filter) => save({ filters: [{ name: filter.name, extensions: [...filter.extensions] }] }),
          invoke: (command, args) => invoke<unknown>(command, args),
          onStart: () => {
            push({ id: taskId, label: running, progress: null, status: 'running' });
            onClose();
          },
        });
        if (outcome.status === 'cancelled') { setExporting(false); return; }
        update(taskId, {
          status: 'done',
          label: outcome.tables === null
            ? t('tasks.exportMarkdownDone')
            : t('tasks.exportTablesDone', { count: outcome.tables }),
        });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.startsWith(NO_TABLES_FOUND_CODE) ? t('exportDialog.noTablesFound') : raw;
      const label = `${t('tasks.exportFailed', { format: t(FORMAT_LABEL_KEYS[format]) })}: ${message}`;
      // A refusal before the save dialog (a document without a table) comes
      // before any task was pushed; `update` alone would change nothing and the
      // person would see no reason. `push` ignores an id that is already there.
      push({ id: taskId, label, progress: null, status: 'error' });
      update(taskId, { status: 'error', label });
    }

    setExporting(false);
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        data-testid="export-dialog"
        className="fixed left-1/2 top-[20vh] -translate-x-1/2 w-full max-w-sm bg-background border border-border rounded-xl shadow-2xl z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="export-dialog-title" className="text-sm font-semibold text-foreground">
            {t('exportDialog.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('exportDialog.closeAriaLabel')}
            data-testid="export-close-btn"
            className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Format picker */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="export-format-select"
            >
              {t('exportDialog.formatLabel')}
            </label>
            <select
              id="export-format-select"
              data-testid="export-format-select"
              value={format}
              onChange={e => { setFormat(e.target.value as ExportFormat); }}
              className="w-full text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(FORMAT_LABEL_KEYS) as ExportFormat[])
                .filter(f => isTauri || BROWSER_FORMATS.has(f))
                .map(f => (
                  <option key={f} value={f}>{t(FORMAT_LABEL_KEYS[f])}</option>
                ))}
            </select>
          </div>

          {/* Page range — image formats only */}
          {isImageFormat && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('exportDialog.pageRangeLabel')}</span>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="export-page-range"
                    value="current"
                    checked={pageRange === 'current'}
                    onChange={() => { setPageRange('current'); }}
                    className="accent-primary"
                  />
                  {t('exportDialog.currentPage', { page: pageIndex + 1 })}
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="export-page-range"
                    value="all"
                    checked={pageRange === 'all'}
                    onChange={() => { setPageRange('all'); }}
                    className="accent-primary"
                  />
                  {t('exportDialog.allPages', { count: pageCount })}
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            data-testid="export-cancel-btn"
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => { void handleExport(); }}
            disabled={!canExport}
            data-testid="export-submit-btn"
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? t('exportDialog.exporting') : t('common.export')}
          </button>
        </div>
      </div>
    </>
  );
}
