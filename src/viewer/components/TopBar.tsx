// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useRef, useEffect, type RefObject, type ChangeEvent } from 'react';
import {
  LayersIcon,
  Undo2Icon,
  Redo2Icon,
  SearchIcon,
  Share2Icon,
  DownloadIcon,
  SaveIcon,
  MenuIcon,
  XIcon,
} from 'lucide-react';
import { useTaskQueueContext } from '../context/TaskQueueContext';

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

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { push, update } = useTaskQueueContext();

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave(): Promise<void> {
    if (!isTauri || !isDirty || pageCount === 0) return;

    const taskId = `save-${Date.now()}`;

    if (currentFilePath) {
      // Save in place — known file path
      push({ id: taskId, label: 'Opslaan…', progress: null, status: 'running' });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path: currentFilePath });
        update(taskId, { status: 'done', label: 'Opgeslagen' });
        onSaveComplete();
      } catch {
        update(taskId, { status: 'error', label: 'Opslaan mislukt' });
      }
    } else {
      // Save as — no known path (browser source or first save)
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!path) return;

      push({ id: taskId, label: 'Opslaan als…', progress: null, status: 'running' });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path });
        update(taskId, { status: 'done', label: 'Opgeslagen' });
        onSaveComplete();
      } catch {
        update(taskId, { status: 'error', label: 'Opslaan mislukt' });
      }
    }
  }

  // Keep a ref so the ⌘S listener always calls the latest handleSave without
  // re-registering on every render.
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ⌘S / Ctrl+S — registered once on mount
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSaveRef.current();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, []);

  // ---------------------------------------------------------------------------
  // Open
  // ---------------------------------------------------------------------------

  async function handleOpen(): Promise<void> {
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
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

  return (
    <div className="h-12 flex items-center justify-between px-3 border-b border-border bg-background shrink-0">
      {/* Hidden file input — browser mode only */}
      {!isTauri && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInputChange}
        />
      )}

      {/* ── Left: branding + history controls ─────────────────────────────── */}
      <div className="flex items-center gap-0.5 w-1/3">
        {/* TODO(pdfluent-viewer): wire menu button to application menu / settings
            Status: design integrated, functionality not implemented yet */}
        <button
          disabled
          className="p-1.5 text-muted-foreground/40 rounded-md cursor-default"
          title="Menu"
          aria-label="Menu"
        >
          <MenuIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 text-primary px-1.5">
          <LayersIcon className="w-5 h-5" />
          <span className="font-semibold text-sm hidden sm:inline-block">PDFluent</span>
        </div>

        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <button
          data-testid="undo-btn"
          disabled={!canUndo}
          onClick={onUndo}
          className={`p-1.5 rounded-md ${canUndo ? 'text-foreground hover:bg-accent cursor-pointer' : 'text-muted-foreground/40 cursor-default'}`}
          title={canUndo ? 'Ongedaan maken (⌘Z)' : 'Niets om ongedaan te maken'}
          aria-label="Undo"
        >
          <Undo2Icon className="w-3.5 h-3.5" />
        </button>

        <button
          data-testid="redo-btn"
          disabled={!canRedo}
          onClick={onRedo}
          className={`p-1.5 rounded-md ${canRedo ? 'text-foreground hover:bg-accent cursor-pointer' : 'text-muted-foreground/40 cursor-default'}`}
          title={canRedo ? 'Opnieuw uitvoeren (⌘⇧Z)' : 'Niets om opnieuw uit te voeren'}
          aria-label="Redo"
        >
          <Redo2Icon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Center: active document tab ────────────────────────────────────── */}
      <div className="flex-1 flex items-end justify-center h-full max-w-lg overflow-hidden pt-2">
        {fileName ? (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b-2 border-primary bg-primary/5 rounded-t-lg min-w-[150px] max-w-[300px]">
            <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDirty ? 'bg-orange-400' : 'bg-green-500'}`}
              title={isDirty ? 'Unsaved changes' : 'Saved'}
              aria-label={isDirty ? 'Unsaved changes' : 'Saved'}
            />
            <button
              onClick={onCloseDocument}
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors shrink-0"
              title="Sluiten"
              aria-label="Document sluiten"
              data-testid="close-document-btn"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b-2 border-transparent">
            <span className="text-sm text-muted-foreground">No document open</span>
          </div>
        )}
      </div>

      {/* ── Right: open + page navigation + actions ────────────────────────── */}
      <div className="flex items-center justify-end gap-1 w-1/3">
        <button
          onClick={() => { void handleOpen(); }}
          className="flex items-center px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity shrink-0"
        >
          Open PDF
        </button>

        {pageCount > 0 && (
          <>
            <div className="w-px h-4 bg-border mx-0.5 shrink-0" />

            <button
              onClick={onPrevPage}
              disabled={pageIndex === 0}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none shrink-0"
              title="Previous page"
            >
              ‹
            </button>

            <input
              ref={pageInputRef}
              type="number"
              min={1}
              max={pageCount}
              value={pageIndex + 1}
              onChange={handlePageInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              className="w-10 text-center text-xs bg-card border border-border rounded-md py-1 text-foreground focus:ring-1 focus:ring-primary outline-none shrink-0"
              aria-label="Page number"
            />

            <span className="text-xs text-muted-foreground shrink-0">/ {pageCount}</span>

            <button
              onClick={onNextPage}
              disabled={pageIndex === pageCount - 1}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none shrink-0"
              title="Next page"
            >
              ›
            </button>
          </>
        )}

        <div className="w-px h-4 bg-border mx-0.5 shrink-0" />

        <button
          onClick={onOpenCommandPalette}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
          title="Search / Command Palette (⌘K)"
          aria-label="Search"
        >
          <SearchIcon className="w-4 h-4" />
        </button>

        <button
          onClick={() => { void handleSave(); }}
          disabled={!canSave}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          title={canSave ? 'Opslaan (⌘S)' : 'Opslaan (geen wijzigingen)'}
          aria-label="Opslaan"
        >
          <SaveIcon className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Opslaan</span>
        </button>

        <button
          onClick={() => { void onSaveAs(); }}
          disabled={!isTauri || pageCount === 0}
          data-testid="save-as-btn"
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Opslaan als… (⌘⇧S)"
          aria-label="Opslaan als"
        >
          <SaveIcon className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Opslaan als…</span>
        </button>

        {/* TODO(pdfluent-viewer): implement share / collaboration
            Status: design integrated, functionality not implemented yet */}
        <button
          disabled
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground/40 rounded-md cursor-default shrink-0"
          title="Share (not yet available)"
        >
          <Share2Icon className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Delen</span>
        </button>

        <button
          onClick={onOpenExport}
          disabled={pageCount === 0}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Exporteren"
        >
          <DownloadIcon className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Exporteren</span>
        </button>
      </div>
    </div>
  );
}
