// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// =============================================================================
// TopBar — the editor's primary chrome row
//
// Applies the PDFluent design philosophy:
//   1. Content is the hero — chrome serves the document, never competes.
//      The bar is a single 44 px row; brand mark is small; nothing pulses.
//   2. Calm by default — only the primary actions are surfaced (open,
//      undo/redo, page nav, search, save, export). Share is hidden until
//      it actually does something; Save As stays as a secondary affordance.
//   3. One route per action — Save handles both in-place and save-as
//      internally (Save As is a separate, less prominent affordance for
//      explicit copy-to-new-path).
//   4. Predictable structure — file identity left, page nav + actions
//      right, with .toolbar-sep hairlines grouping by function.
//   5. Quiet motion — focus rings via the design tokens; no continuous
//      animations on this surface.
// =============================================================================

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useEffect, useRef, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Redo2Icon,
  SaveIcon,
  SearchIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { pickPdfPath } from '../../platform/native/fileDialogs';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopBarProps {
  fileName: string | null;
  pageIndex: number;
  pageCount: number;
  isDirty: boolean;
  currentFilePath: string | null;
  onOpenFile: (source: string | ArrayBuffer) => Promise<void>;
  onSaveComplete: () => void;
  onCloseDocument: () => void;
  pageInputRef?: RefObject<HTMLInputElement | null>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageInput: (page: number) => void;
  onOpenCommandPalette: () => void;
  onOpenExport: () => void;
  onSaveAs: () => Promise<void>;
  /** Whether there is a command in the undo stack. */
  canUndo?: boolean;
  /** Whether there is a command in the redo stack. */
  canRedo?: boolean;
  /** Called when the user clicks the Undo button. */
  onUndo?: () => void;
  /** Called when the user clicks the Redo button. */
  onRedo?: () => void;
}

const isTauri = isTauriRuntime();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBar({
  fileName,
  pageIndex,
  pageCount,
  isDirty,
  currentFilePath,
  onOpenFile,
  onSaveComplete,
  onCloseDocument,
  pageInputRef,
  onPrevPage,
  onNextPage,
  onPageInput,
  onOpenCommandPalette,
  onOpenExport,
  onSaveAs,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: TopBarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { push, update } = useTaskQueueContext();

  // ---------------------------------------------------------------------------
  // Save flow — branches on Tauri vs browser and on whether we know the path.
  // The Save button always invokes this; Save As bypasses it via onSaveAs.
  // ---------------------------------------------------------------------------

  async function handleSave(): Promise<void> {
    if (!isDirty || pageCount === 0) return;

    const taskId = `save-${Date.now()}`;

    if (!isTauri) {
      push({ id: taskId, label: t('tasks.savingLabel'), progress: null, status: 'running' });
      try {
        await onSaveAs();
        update(taskId, { status: 'done', label: t('tasks.savedLabel') });
        onSaveComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        update(taskId, { status: 'error', label: `${t('tasks.saveFailed')}: ${message}` });
      }
      return;
    }

    if (currentFilePath) {
      push({ id: taskId, label: t('tasks.savingLabel'), progress: null, status: 'running' });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path: currentFilePath });
        update(taskId, { status: 'done', label: t('tasks.savedLabel') });
        onSaveComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        update(taskId, { status: 'error', label: `${t('tasks.saveFailed')}: ${message}` });
      }
    } else {
      push({ id: taskId, label: t('tasks.savingAsLabel'), progress: null, status: 'running' });
      try {
        await onSaveAs();
        update(taskId, { status: 'done', label: t('tasks.savedLabel') });
        onSaveComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        update(taskId, { status: 'error', label: `${t('tasks.saveFailed')}: ${message}` });
      }
    }
  }

  // Keep a ref so the ⌘S listener always calls the latest handleSave without
  // re-registering on every render.
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  // ⌘S / Ctrl+S — registered once on mount, dispatches to the latest handler.
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleSaveRef.current();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Open flow — Tauri picks via dialog, browser via hidden file input.
  // ---------------------------------------------------------------------------

  async function handleOpen(): Promise<void> {
    if (isTauri) {
      const path = await pickPdfPath();
      if (typeof path === 'string') await onOpenFile(path);
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result;
      if (buffer instanceof ArrayBuffer) void onOpenFile(buffer);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function handlePageInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= pageCount) {
      onPageInput(value - 1);
    }
  }

  const canSave = isDirty && pageCount > 0;
  const hasDocument = pageCount > 0;

  // ---------------------------------------------------------------------------
  // State A — no document open. Minimal bar: brand + single CTA.
  // ---------------------------------------------------------------------------

  if (!hasDocument) {
    return (
      <header className="topbar topbar-empty" role="banner">
        {!isTauri && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            aria-label={t('topbar.openPdfFile')}
            onChange={handleFileInputChange}
          />
        )}

        <div className="topbar-brand">
          <span className="toolbar-logo-mark" aria-hidden="true" />
          <span className="toolbar-brand-name">PDFluent</span>
        </div>

        <button
          type="button"
          onClick={() => {
            void handleOpen();
          }}
          className="topbar-primary-cta"
        >
          {t('welcome.openFile')}
        </button>
      </header>
    );
  }

  // ---------------------------------------------------------------------------
  // State B — document open. Full bar.
  // ---------------------------------------------------------------------------

  return (
    <header className="topbar" role="banner">
      {!isTauri && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInputChange}
        />
      )}

      {/* ── Left: brand · history · document identity ─────────────────── */}
      <div className="topbar-left">
        <div className="topbar-brand">
          <span className="toolbar-logo-mark" aria-hidden="true" />
        </div>

        <span className="toolbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="pf-btn"
          disabled={!canUndo}
          onClick={onUndo}
          title={canUndo ? t('topbar.undoTooltip') : t('topbar.nothingToUndo')}
          aria-label={t('topbar.undoTooltip')}
          data-testid="undo-btn"
        >
          <Undo2Icon aria-hidden="true" />
        </button>

        <button
          type="button"
          className="pf-btn"
          disabled={!canRedo}
          onClick={onRedo}
          title={canRedo ? t('topbar.redoTooltip') : t('topbar.nothingToRedo')}
          aria-label={t('topbar.redoTooltip')}
          data-testid="redo-btn"
        >
          <Redo2Icon aria-hidden="true" />
        </button>

        {fileName && (
          <>
            <span className="toolbar-sep" aria-hidden="true" />
            <div className="topbar-doc-chip" data-dirty={isDirty}>
              <span className="topbar-doc-name" title={fileName}>
                {fileName}
              </span>
              <span
                className="topbar-doc-status"
                aria-label={isDirty ? t('topbar.unsavedChanges') : t('topbar.saved')}
                title={isDirty ? t('topbar.unsavedChanges') : t('topbar.saved')}
              />
              <button
                type="button"
                className="topbar-doc-close"
                onClick={onCloseDocument}
                title={t('common.close')}
                aria-label={t('topbar.closeDocument')}
                data-testid="close-document-btn"
              >
                <XIcon aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="topbar-spacer" />

      {/* ── Right: open · page nav · search · save · export ───────────── */}
      <div className="topbar-right">
        <button
          type="button"
          onClick={() => {
            void handleOpen();
          }}
          className="topbar-primary-cta topbar-primary-cta-compact"
          title={t('welcome.openFile')}
        >
          {t('welcome.openFile')}
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="pf-btn"
          onClick={onPrevPage}
          disabled={pageIndex === 0}
          title={t('topbar.previousPage')}
          aria-label={t('topbar.previousPage')}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>

        <div className="topbar-page-group">
          <input
            ref={pageInputRef}
            type="number"
            min={1}
            max={pageCount}
            value={pageIndex + 1}
            onChange={handlePageInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="topbar-page-input"
            aria-label={t('topbar.pageNumber')}
          />
          <span className="topbar-page-total" aria-hidden="true">
            / {pageCount}
          </span>
        </div>

        <button
          type="button"
          className="pf-btn"
          onClick={onNextPage}
          disabled={pageIndex === pageCount - 1}
          title={t('topbar.nextPage')}
          aria-label={t('topbar.nextPage')}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="topbar-search-trigger"
          onClick={onOpenCommandPalette}
          title={t('topbar.searchTooltip')}
          aria-label={t('topbar.searchTooltip')}
          data-testid="search-btn"
        >
          <SearchIcon aria-hidden="true" />
          <span className="topbar-search-label">{t('common.search')}</span>
          <kbd className="topbar-search-kbd" aria-hidden="true">
            ⌘K
          </kbd>
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="topbar-action"
          onClick={() => {
            void handleSave();
          }}
          disabled={!canSave}
          title={canSave ? t('topbar.saveTooltip') : t('topbar.saveNoChanges')}
          aria-label={t('common.save')}
          data-testid="save-btn"
        >
          <SaveIcon aria-hidden="true" />
          <span className="topbar-action-label">{t('common.save')}</span>
        </button>

        <button
          type="button"
          className="topbar-action topbar-action-quiet"
          onClick={() => {
            void onSaveAs();
          }}
          disabled={!hasDocument}
          title={t('topbar.saveAsTooltip')}
          aria-label={t('common.saveAs')}
          data-testid="save-as-btn"
        >
          <span className="topbar-action-label topbar-action-label-wide">
            {t('common.saveAs')}
          </span>
        </button>

        <button
          type="button"
          className="topbar-action"
          onClick={onOpenExport}
          disabled={!hasDocument}
          title={t('common.export')}
          aria-label={t('common.export')}
          data-testid="export-btn"
        >
          <DownloadIcon aria-hidden="true" />
          <span className="topbar-action-label">{t('common.export')}</span>
        </button>
      </div>
    </header>
  );
}
