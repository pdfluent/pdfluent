// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCwIcon, RotateCcwIcon, Trash2Icon, CheckSquareIcon, SquareIcon, XIcon, FilePlusIcon, FilesIcon, ScissorsIcon, DownloadIcon, LogInIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { pageIndicesToRanges } from './pageRanges';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrganizeGridProps {
  thumbnails: Map<number, string>;
  pageCount: number;
  /** Called after any mutation that changes the current document (page count may change).
   *  Optional navigateTo: page index to navigate to after the mutation. */
  onPageMutation: (newPageCount: number, navigateTo?: number) => void;
  /** Called when assembly modifies the document (to mark it dirty). */
  onMarkDirty: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = isTauriRuntime();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrganizeGrid({ thumbnails, pageCount, onPageMutation, onMarkDirty }: OrganizeGridProps) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();

  // Multi-page selection state
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // Track last clicked index for Shift+click range selection
  const lastClickedRef = useRef<number>(-1);

  // Track whether current click is a shift-click (read by toggleSelection)
  const shiftClickRef = useRef<{ active: boolean; index: number }>({ active: false, index: -1 });

  // Pending display order: null = matches original, array = user has reordered (not yet applied)
  const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);

  // Reset pending order whenever page count changes (after delete/rotate/apply mutations)
  useEffect(() => { setPendingOrder(null); }, [pageCount]);

  // Current display order: pending (reordered) or original 0..N-1
  const displayOrder = pendingOrder ?? Array.from({ length: pageCount }, (_, i) => i);

  // Drag-to-reorder state (dragSrcRef and dragOverIdx track display positions)
  const dragSrcRef = useRef<number>(-1);
  const [dragOverIdx, setDragOverIdx] = useState<number>(-1);

  // Prevents concurrent assembly operations (append, insert, export, split)
  const [isAssemblyBusy, setIsAssemblyBusy] = useState(false);
  const unavailableTitle = (label: string): string =>
    isTauri ? label : `${label} (${t('common.notYetAvailable')})`;

  function toggleSelection(index: number): void {
    // Shift+click range selection: fill range from lastClickedRef to index
    if (shiftClickRef.current.active && lastClickedRef.current >= 0) {
      const lo = Math.min(lastClickedRef.current, index);
      const hi = Math.max(lastClickedRef.current, index);
      setSelectedPages(prev => {
        const next = new Set(prev);
        for (let idx = lo; idx <= hi; idx++) next.add(idx);
        return next;
      });
      shiftClickRef.current = { active: false, index: -1 };
      return;
    }

    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(index)) { next.delete(index); } else { next.add(index); }
      return next;
    });
    lastClickedRef.current = index;
  }

  // handleRangeSelect: sets up shift-click context before toggleSelection is called
  function handleRangeSelect(i: number, e: React.MouseEvent): void {
    if (e.shiftKey && lastClickedRef.current >= 0) {
      shiftClickRef.current = { active: true, index: i };
    }
  }

  function selectAll(): void {
    setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  }

  function clearSelection(): void {
    setSelectedPages(new Set());
  }

  async function handleDeletePage(pageIndex: number): Promise<void> {
    if (!isTauri || pageCount <= 1) return;
    const taskId = `delete-page-${Date.now()}`;
    push({ id: taskId, label: t('tasks.deletePageRunning', { page: pageIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('delete_pages', { pageIndices: [pageIndex] });
      update(taskId, { status: 'done', label: t('tasks.deletePageDone', { page: pageIndex + 1 }) });
      onPageMutation(result.page_count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('tasks.deleteFailed')}: ${message}` });
    }
  }

  async function handleRotatePage(pageIndex: number, direction: 'left' | 'right' = 'right'): Promise<void> {
    if (!isTauri) return;
    const rotation = direction === 'left' ? 270 : 90;
    const taskId = `rotate-page-${Date.now()}`;
    push({ id: taskId, label: t('tasks.rotatePageRunning', { page: pageIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_pages', { pageIndices: [pageIndex], rotation });
      update(taskId, { status: 'done', label: t('tasks.rotatePageDone', { page: pageIndex + 1 }) });
      onPageMutation(result.page_count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('tasks.rotateFailed')}: ${message}` });
    }
  }

  async function handleBatchDelete(): Promise<void> {
    if (!isTauri || selectedPages.size === 0) return;
    // Cannot delete all pages — guard: must leave at least one
    if (selectedPages.size >= pageCount) return;
    const indices = Array.from(selectedPages).sort((a, b) => a - b);
    const taskId = `batch-delete-${Date.now()}`;
    push({ id: taskId, label: t('tasks.deleteManyRunning', { count: indices.length }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('delete_pages', { pageIndices: indices });
      update(taskId, { status: 'done', label: t('tasks.deleteManyDone', { count: indices.length }) });
      clearSelection();
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: t('tasks.deleteFailed') });
    }
  }

  async function handleBatchRotate(direction: 'left' | 'right' = 'right'): Promise<void> {
    if (!isTauri || selectedPages.size === 0) return;
    const rotation = direction === 'left' ? 270 : 90;
    const indices = Array.from(selectedPages).sort((a, b) => a - b);
    const taskId = `batch-rotate-${Date.now()}`;
    push({ id: taskId, label: t('tasks.batchRotateRunning', { count: indices.length }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_pages', { pageIndices: indices, rotation });
      update(taskId, { status: 'done', label: t('tasks.batchRotateDone', { count: indices.length }) });
      clearSelection();
      onPageMutation(result.page_count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('tasks.rotateFailed')}: ${message}` });
    }
  }

  // Update pending order locally — does NOT invoke Tauri (src/dst are display positions)
  function handleLocalReorder(src: number, dst: number): void {
    if (src === dst) return;
    setPendingOrder(prev => {
      const current = prev ?? Array.from({ length: pageCount }, (_, k) => k);
      const next = [...current];
      const [removed] = next.splice(src, 1);
      next.splice(dst, 0, removed!);
      return next;
    });
  }

  // Apply the pending order by invoking Tauri reorder_pages
  async function handleApplyOrder(): Promise<void> {
    if (!pendingOrder || !isTauri) return;
    const taskId = `reorder-pages-${Date.now()}`;
    push({ id: taskId, label: t('organize.applyingOrder'), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('reorder_pages', { newOrder: pendingOrder });
      update(taskId, { status: 'done', label: t('organize.orderApplied') });
      setPendingOrder(null);
      onPageMutation(result.page_count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.orderFailed')}: ${message}` });
    }
  }

  // Discard pending order — reverts to original page sequence
  function handleCancelOrder(): void {
    setPendingOrder(null);
  }

  function moveSelectedPage(direction: -1 | 1): void {
    if (selectedPages.size !== 1 || isAssemblyBusy) return;
    const [pageIndex] = Array.from(selectedPages);
    if (pageIndex === undefined) return;
    const current = pendingOrder ?? Array.from({ length: pageCount }, (_, k) => k);
    const src = current.indexOf(pageIndex);
    const dst = src + direction;
    if (src < 0 || dst < 0 || dst >= current.length) return;
    handleLocalReorder(src, dst);
  }

  // ── Document assembly handlers ───────────────────────────────────────

  /** Open a file picker and append the chosen PDF to the end of the current document. */
  async function handleAppendPdf(): Promise<void> {
    if (!isTauri || pageCount === 0 || isAssemblyBusy) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sourcePath = await open({ filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: false });
    if (!sourcePath || typeof sourcePath !== 'string') return;
    setIsAssemblyBusy(true);
    // Capture current count before the operation so we can navigate to the first new page
    const firstNewPageIndex = pageCount;
    const taskId = `append-pdf-${Date.now()}`;
    push({ id: taskId, label: t('organize.addingPdf'), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('append_pdf', { sourcePath });
      update(taskId, { status: 'done', label: t('organize.pdfAdded') });
      onMarkDirty();
      onPageMutation(result.page_count, firstNewPageIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.addFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  /** Open a multi-file picker and append every chosen PDF to the current
   *  document — Acrobat-style "Combine files" into this document. Reuses the
   *  proven append_pdf command per file (no on-disk merge of the current,
   *  possibly-dirty, document). */
  async function handleCombinePdfs(): Promise<void> {
    if (!isTauri || pageCount === 0 || isAssemblyBusy) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: true });
    if (!picked) return;
    const sources = (Array.isArray(picked) ? picked : [picked]).filter(
      (p): p is string => typeof p === 'string',
    );
    if (sources.length === 0) return;
    setIsAssemblyBusy(true);
    const firstNewPageIndex = pageCount;
    const taskId = `combine-pdf-${Date.now()}`;
    push({ id: taskId, label: t('organize.combiningFiles', { count: sources.length }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      let latestCount = pageCount;
      for (const sourcePath of sources) {
        const result = await invoke<{ page_count: number }>('append_pdf', { sourcePath });
        latestCount = result.page_count;
      }
      update(taskId, { status: 'done', label: t('organize.filesCombined', { count: sources.length }) });
      onMarkDirty();
      onPageMutation(latestCount, firstNewPageIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.addFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  /** Open a file picker and insert the chosen PDF before the first selected page.
   *  Falls back to inserting before page 0 when nothing is selected.
   */
  async function handleInsertPdf(): Promise<void> {
    if (!isTauri || pageCount === 0 || isAssemblyBusy) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sourcePath = await open({ filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: false });
    if (!sourcePath || typeof sourcePath !== 'string') return;
    // Insert before the first selected page (0-based); default to 0
    const atIndex = selectedPages.size > 0 ? Math.min(...selectedPages) : 0;
    setIsAssemblyBusy(true);
    const taskId = `insert-pdf-${Date.now()}`;
    push({ id: taskId, label: t('organize.insertingPdf', { page: atIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('insert_pdf_at', { sourcePath, atIndex });
      update(taskId, { status: 'done', label: t('organize.pdfInserted') });
      clearSelection();
      onMarkDirty();
      onPageMutation(result.page_count, atIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.insertFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  /** Export the selected pages to a new PDF file. Does not modify the current document. */
  async function handleExportSelection(): Promise<void> {
    if (!isTauri || selectedPages.size === 0 || isAssemblyBusy) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const outputPath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!outputPath) return;
    const indices = Array.from(selectedPages).sort((a, b) => a - b);
    setIsAssemblyBusy(true);
    const taskId = `export-selection-${Date.now()}`;
    push({ id: taskId, label: t('organize.exportingPages', { count: indices.length }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('extract_pages_to_file', { pageIndices: indices, outputPath });
      update(taskId, { status: 'done', label: t('organize.selectionExported', { name: outputPath.split('/').pop() ?? outputPath }) });
      // Current document is unchanged — no dirty or page mutation
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.exportFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  /** Split the current document into individual single-page PDFs in a chosen directory. */
  async function handleSplitIntoPages(): Promise<void> {
    if (!isTauri || pageCount <= 1 || isAssemblyBusy) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const outputDir = await open({ directory: true, multiple: false });
    if (!outputDir || typeof outputDir !== 'string') return;
    setIsAssemblyBusy(true);
    const taskId = `split-pages-${Date.now()}`;
    push({ id: taskId, label: t('organize.splittingPages'), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const paths = await invoke<string[]>('split_into_pages', { outputDir });
      update(taskId, { status: 'done', label: t('organize.pagesSaved', { count: paths.length }) });
      // Current document is unchanged — no dirty or page mutation
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.splitFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  /** Split the document into separate files, one per contiguous run of the
   *  current page selection — Acrobat-style "split by range". Disabled until
   *  pages are selected; ranges are derived from the selection (1-based). */
  async function handleSplitByRange(): Promise<void> {
    if (!isTauri || isAssemblyBusy || selectedPages.size === 0) return;
    const ranges = pageIndicesToRanges(Array.from(selectedPages));
    if (ranges.length === 0) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const outputDir = await open({ directory: true, multiple: false });
    if (!outputDir || typeof outputDir !== 'string') return;
    setIsAssemblyBusy(true);
    const taskId = `split-range-${Date.now()}`;
    push({ id: taskId, label: t('organize.splittingRanges', { count: ranges.length }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const paths = await invoke<string[]>('split_pdf', { ranges, outputDir });
      update(taskId, { status: 'done', label: t('organize.filesSaved', { count: paths.length }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update(taskId, { status: 'error', label: `${t('organize.splitFailed')}: ${message}` });
    } finally {
      setIsAssemblyBusy(false);
    }
  }

  // Use refs to keep keyboard handler up-to-date with latest closures
  const handleBatchDeleteRef = useRef(handleBatchDelete);
  useEffect(() => { handleBatchDeleteRef.current = handleBatchDelete; });
  const handleBatchRotateRef = useRef(handleBatchRotate);
  useEffect(() => { handleBatchRotateRef.current = handleBatchRotate; });

  // Keyboard shortcuts for organize mode
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void handleBatchDeleteRef.current();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void handleBatchRotateRef.current();
      } else if (e.key === 'Escape') {
        clearSelection();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [selectedPages, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSelection = selectedPages.size > 0;
  const canBatchDelete = hasSelection && selectedPages.size < pageCount;
  const selectedPageForMove = selectedPages.size === 1 ? Array.from(selectedPages)[0] : undefined;
  const selectedDisplayIndex = selectedPageForMove === undefined ? -1 : displayOrder.indexOf(selectedPageForMove);
  const canMoveSelectedLeft = selectedDisplayIndex > 0 && !isAssemblyBusy;
  const canMoveSelectedRight = selectedDisplayIndex >= 0 && selectedDisplayIndex < displayOrder.length - 1 && !isAssemblyBusy;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Batch action bar — shown when at least one page is selected */}
      {hasSelection ? (
        <div
          data-testid="batch-action-bar"
          className="flex items-center gap-2 px-6 py-2 bg-primary/5 border-b border-primary/20 shrink-0 flex-wrap"
        >
          <span
            data-testid="selection-count"
            className="text-xs font-medium text-primary tabular-nums shrink-0"
          >
            {t('organize.selectedCount', { count: selectedPages.size })}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={() => { void handleInsertPdf(); }}
              disabled={!isTauri || isAssemblyBusy}
              data-testid="organize-insert-before-btn"
              title={unavailableTitle(selectedPages.size > 0 ? t('organize.insertBeforePage', { page: Math.min(...selectedPages) + 1 }) : t('organize.insertBefore'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogInIcon className="w-4 h-4" />
              {t('organize.insertBefore')}
            </button>
            <button
              onClick={() => { void handleExportSelection(); }}
              disabled={!isTauri || isAssemblyBusy}
              data-testid="organize-export-selection-btn"
              title={unavailableTitle(t('organize.exportSelection'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              {t('organize.exportSelection')}
            </button>
            <button
              onClick={() => moveSelectedPage(-1)}
              disabled={!canMoveSelectedLeft}
              data-testid="organize-move-left-btn"
              title={t('organize.moveLeft')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <span>{t('organize.moveLeftShort')}</span>
            </button>
            <button
              onClick={() => moveSelectedPage(1)}
              disabled={!canMoveSelectedRight}
              data-testid="organize-move-right-btn"
              title={t('organize.moveRight')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
              <span>{t('organize.moveRightShort')}</span>
            </button>
            <button
              onClick={() => { void handleBatchRotate('left'); }}
              disabled={!isTauri}
              data-testid="batch-rotate-left-btn"
              title={unavailableTitle(t('organize.rotateLeft'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcwIcon className="w-4 h-4" />
              <span>{t('organize.rotateLeftShort')}</span>
            </button>
            <button
              onClick={() => { void handleBatchRotate('right'); }}
              disabled={!isTauri}
              data-testid="batch-rotate-right-btn"
              title={unavailableTitle(t('organize.rotateRight'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCwIcon className="w-4 h-4" />
              <span>{t('organize.rotateRightShort')}</span>
            </button>
            <button
              onClick={() => { void handleBatchDelete(); }}
              disabled={!isTauri || !canBatchDelete}
              data-testid="batch-delete-btn"
              title={unavailableTitle(t('common.delete'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2Icon className="w-4 h-4" />
              {t('common.delete')}
            </button>
            <button
              onClick={clearSelection}
              data-testid="clear-selection-btn"
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              aria-label={t('organize.clearSelection')}
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Select-all + assembly header — shown when no selection is active */
        <div
          data-testid="organize-header"
          className="flex items-center gap-2 px-6 py-2 border-b border-border shrink-0 flex-wrap"
        >
          <button
            onClick={selectAll}
            data-testid="select-all-btn"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SquareIcon className="w-4 h-4" />
            {t('organize.selectAll')}
          </button>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={() => { void handleAppendPdf(); }}
              disabled={!isTauri || pageCount === 0 || isAssemblyBusy}
              data-testid="organize-merge-pdf-btn"
              title={unavailableTitle(t('organize.addPdf'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FilePlusIcon className="w-4 h-4" />
              {t('organize.addPdf')}
            </button>
            <button
              onClick={() => { void handleCombinePdfs(); }}
              disabled={!isTauri || pageCount === 0 || isAssemblyBusy}
              data-testid="organize-combine-btn"
              title={unavailableTitle(t('organize.combine'))}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FilesIcon className="w-4 h-4" />
              {t('organize.combine')}
            </button>
            {pageCount > 1 && (
              <button
                onClick={() => { void handleSplitIntoPages(); }}
                disabled={!isTauri || isAssemblyBusy}
                data-testid="organize-split-btn"
                title={unavailableTitle(t('organize.splitPages'))}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ScissorsIcon className="w-4 h-4" />
                {t('organize.splitPages')}
              </button>
            )}
            {pageCount > 1 && (
              <button
                onClick={() => { void handleSplitByRange(); }}
                disabled={!isTauri || isAssemblyBusy || selectedPages.size === 0}
                data-testid="organize-split-range-btn"
                title={selectedPages.size === 0 ? t('organize.splitRangeHint') : unavailableTitle(t('organize.splitRange'))}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ScissorsIcon className="w-4 h-4" />
                {t('organize.splitRange')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pending order bar — shown when user has reordered but not yet applied */}
      {pendingOrder !== null && (
        <div
          data-testid="organize-order-bar"
          className="flex items-center gap-3 px-6 py-2 bg-amber-500/10 border-b border-amber-500/30 shrink-0"
        >
          <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            {t('organize.orderChanged')}
          </span>
          <button
            data-testid="organize-cancel-order-btn"
            onClick={handleCancelOrder}
            className="px-3 py-1 text-xs font-medium rounded-md bg-background border border-border text-foreground hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            data-testid="organize-apply-order-btn"
            onClick={() => { void handleApplyOrder(); }}
            disabled={!isTauri}
            title={unavailableTitle(t('common.apply'))}
            className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('common.apply')}
          </button>
        </div>
      )}

      {/* Page grid — iterates displayOrder so pending drags are reflected immediately */}
      <div
        data-testid="organize-grid"
        className="flex-1 p-6 grid gap-5 overflow-auto"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
      >
        {displayOrder.map((i, displayPos) => {
          const thumbUrl = thumbnails.get(i);
          const canDelete = pageCount > 1;
          const isSelected = selectedPages.has(i);

          return (
            <div
              key={i}
              data-testid={`organize-page-tile-${i}`}
              onMouseDown={(e) => { handleRangeSelect(i, e); }}
              onClick={() => { toggleSelection(i); }}
              draggable={isTauri}
              onDragStart={(e) => {
                dragSrcRef.current = displayPos;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverIdx(displayPos);
              }}
              onDragLeave={() => { setDragOverIdx(-1); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverIdx(-1);
                handleLocalReorder(dragSrcRef.current, displayPos);
                dragSrcRef.current = -1;
              }}
              onDragEnd={() => {
                setDragOverIdx(-1);
                dragSrcRef.current = -1;
              }}
              className={[
                'flex flex-col items-center gap-2 p-3 bg-card border rounded-lg transition-all duration-150 cursor-pointer select-none group',
                isSelected
                  ? 'border-primary ring-2 ring-primary/30 shadow-sm'
                  : dragOverIdx === displayPos && dragSrcRef.current !== displayPos
                    ? 'border-primary/60 ring-2 ring-primary/40 bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:shadow-md',
              ].join(' ')}
            >
              {/* Selection indicator */}
              <div className="self-end -mb-1">
                {isSelected ? (
                  <CheckSquareIcon
                    data-testid={`organize-selected-${i}`}
                    className="w-4 h-4 text-primary"
                  />
                ) : (
                  <SquareIcon className="w-4 h-4 text-muted-foreground/30" />
                )}
              </div>

              {/* Thumbnail */}
              <div className="w-[130px] h-[184px] flex items-center justify-center bg-muted/50 rounded-md overflow-hidden shrink-0 border border-border/50">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={t('organize.pageAlt', { page: i + 1 })}
                    className="max-w-full max-h-full object-contain"
                    data-testid={`organize-thumb-${i}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="w-8 h-8 text-muted-foreground/40"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Page number */}
              <span
                className={`text-xs font-medium tabular-nums ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                data-testid={`organize-page-number-${i}`}
              >
                {i + 1}
              </span>

              {/* Per-tile actions — stop propagation to avoid toggling selection */}
              <div
                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                onClick={(e) => { e.stopPropagation(); }}
              >
                <button
                  onClick={() => { void handleRotatePage(i, 'left'); }}
                  disabled={!isTauri}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={unavailableTitle(t('organize.rotateLeft'))}
                  aria-label={t('organize.rotateLeft')}
                  data-testid={`organize-rotate-left-${i}`}
                >
                  <RotateCcwIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { void handleRotatePage(i, 'right'); }}
                  disabled={!isTauri}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={unavailableTitle(t('organize.rotateRight'))}
                  aria-label={t('organize.rotateRight')}
                  data-testid={`organize-rotate-right-${i}`}
                >
                  <RotateCwIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { void handleDeletePage(i); }}
                  disabled={!isTauri || !canDelete}
                  className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={canDelete ? unavailableTitle(t('organize.deletePage', { page: i + 1 })) : t('errors.cannotDeleteLastPage')}
                  aria-label={t('organize.deletePage', { page: i + 1 })}
                  data-testid={`organize-delete-${i}`}
                >
                  <Trash2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
