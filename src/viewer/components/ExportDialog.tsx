// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskQueueContext } from '../context/TaskQueueContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'compressed_pdf' | 'png' | 'jpeg' | 'docx';
type ImagePageRange = 'current' | 'all';

export const FORMAT_LABEL_KEYS: Record<ExportFormat, string> = {
  pdf: 'exportDialog.formatPdf',
  compressed_pdf: 'exportDialog.formatCompressedPdf',
  png: 'exportDialog.formatPng',
  jpeg: 'exportDialog.formatJpeg',
  docx: 'exportDialog.formatDocx',
};

export const IMAGE_FORMATS: ReadonlySet<ExportFormat> = new Set(['png', 'jpeg']);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pageIndex: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export function ExportDialog({ isOpen, onClose, pageIndex, pageCount }: ExportDialogProps) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [pageRange, setPageRange] = useState<ImagePageRange>('current');
  const [exporting, setExporting] = useState(false);

  // Reset state on each open
  useEffect(() => {
    if (isOpen) {
      setFormat('pdf');
      setPageRange('current');
      setExporting(false);
    }
  }, [isOpen]);

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

  async function handleExport(): Promise<void> {
    if (exporting || !isTauri) return;
    setExporting(true);

    const taskId = `export-${Date.now()}`;

    try {
      if (format === 'pdf') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.exportRunning'), progress: null, status: 'running' });
        onClose();

        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path });
        update(taskId, { status: 'done', label: t('tasks.exportDone') });

      } else if (format === 'compressed_pdf') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (!path) { setExporting(false); return; }

        push({ id: taskId, label: t('tasks.compressRunning'), progress: null, status: 'running' });
        onClose();

        const { invoke } = await import('@tauri-apps/api/core');
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

          const { invoke } = await import('@tauri-apps/api/core');
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

          const { invoke } = await import('@tauri-apps/api/core');
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

        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('convert_to_docx', { outputPath: path });
        update(taskId, { status: 'done', label: t('tasks.exportWordDone') });
      }
    } catch {
      update(taskId, { status: 'error', label: t('tasks.exportFailed', { format: t(FORMAT_LABEL_KEYS[format]) }) });
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
        role="dialog"
        aria-labelledby="export-dialog-title"
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
              value={format}
              onChange={e => { setFormat(e.target.value as ExportFormat); }}
              className="w-full text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(FORMAT_LABEL_KEYS) as ExportFormat[]).map(f => (
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
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => { void handleExport(); }}
            disabled={exporting || !isTauri}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? t('exportDialog.exporting') : t('common.export')}
          </button>
        </div>
      </div>
    </>
  );
}
