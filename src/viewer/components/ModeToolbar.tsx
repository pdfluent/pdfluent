// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useTranslation } from 'react-i18next';
import type { ViewerMode } from '../types';
import type { Annotation, FormField } from '../../core/document';
import { TOOLS_BY_MODE, type ToolDefinition } from '../tools/toolDefinitions';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, PrinterIcon, HighlighterIcon, UnderlineIcon, StrikethroughIcon, SquareIcon, EraserIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Annotation tool types
// ---------------------------------------------------------------------------

export type AnnotationTool = 'highlight' | 'underline' | 'strikeout' | 'rectangle' | 'redaction' | null;

// ---------------------------------------------------------------------------
// Wired tools (i18n keys)
// ---------------------------------------------------------------------------

/**
 * Tool label i18n keys that are fully wired in this release.
 * All other tools render as disabled placeholders.
 */
export const WIRED_TOOLS: ReadonlySet<string> = new Set([
  // Read mode
  'toolbar.zoomIn',
  'toolbar.zoomOut',
  'toolbar.fullscreen',
  'toolbar.searchText',
  // Organize mode
  'toolbar.deletePage',
  'toolbar.rotateLeft',
  'toolbar.rotateRight',
]);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModeToolbarProps {
  mode: ViewerMode;
  pageIndex: number;
  pageCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenSearch: () => void;
  /** Called after a successful page mutation with the new page count and an optional target page index. */
  onPageMutation: (newPageCount: number, navigateTo?: number) => void;
  /** Comments for review-mode navigation (sorted by pageIndex ascending). */
  comments: Annotation[];
  /** Index of the currently active comment (−1 = none selected). */
  activeCommentIdx: number;
  /** Navigate to the given comment index and jump to its page. */
  onCommentNav: (idx: number) => void;
  /** Create a new empty comment on the current page and re-fetch the comments list. */
  onAddComment: () => void;
  /** The currently active annotation tool (highlight, underline, strikeout, rectangle, or null). */
  activeAnnotationTool?: AnnotationTool;
  /** Called when the user selects or deselects an annotation tool. */
  onAnnotationToolChange?: (tool: AnnotationTool) => void;
  /** Form fields for forms-mode navigation (sorted by pageIndex ascending). */
  formFields: FormField[];
  /** Index of the currently active form field (−1 = none selected). */
  activeFieldIdx: number;
  /** Navigate to the given field index and jump to its page. */
  onFieldNav: (idx: number) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

function Divider() {
  return <div className="w-px h-4 bg-border mx-1 shrink-0" />;
}

function ToolButton({
  tool,
  wired,
  onClick,
}: {
  tool: ToolDefinition;
  wired: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      key={tool.label}
      disabled={!wired}
      onClick={wired ? onClick : undefined}
      title={wired ? t(tool.label) : `${t(tool.label)} (not yet available)`}
      aria-label={t(tool.label)}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        wired
          ? 'text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer'
          : 'text-muted-foreground/50 cursor-default hover:bg-transparent'
      }`}
    >
      <tool.icon className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{t(tool.label)}</span>
    </button>
  );
}

function ToolGroup({
  tools,
  onAction,
}: {
  tools: ToolDefinition[];
  onAction: (label: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {tools.map(t => (
        <ToolButton
          key={t.label}
          tool={t}
          wired={WIRED_TOOLS.has(t.label)}
          onClick={() => { onAction(t.label); }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModeToolbar
// ---------------------------------------------------------------------------

export function ModeToolbar({
  mode,
  pageIndex,
  pageCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onOpenSearch,
  onPageMutation,
  comments,
  activeCommentIdx,
  onCommentNav,
  onAddComment,
  activeAnnotationTool = null,
  onAnnotationToolChange,
  formFields,
  activeFieldIdx,
  onFieldNav,
}: ModeToolbarProps) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();

  async function handleDeletePage(): Promise<void> {
    if (!isTauri || pageCount <= 1) return;
    const taskId = `delete-page-${Date.now()}`;
    push({ id: taskId, label: t('tasks.deletePageRunning', { page: pageIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('delete_pages', { pageIndices: [pageIndex] });
      update(taskId, { status: 'done', label: t('tasks.deletePageDone', { page: pageIndex + 1 }) });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: t('tasks.deleteFailed') });
    }
  }

  async function handleRotatePageRight(): Promise<void> {
    if (!isTauri) return;
    const taskId = `rotate-page-right-${Date.now()}`;
    push({ id: taskId, label: t('tasks.rotateRightRunning', { page: pageIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_page_right', { pageIndex });
      update(taskId, { status: 'done', label: t('tasks.rotateRightDone', { page: pageIndex + 1 }) });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: t('tasks.rotateFailed') });
    }
  }

  async function handleRotatePageLeft(): Promise<void> {
    if (!isTauri) return;
    const taskId = `rotate-page-left-${Date.now()}`;
    push({ id: taskId, label: t('tasks.rotateLeftRunning', { page: pageIndex + 1 }), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_page_left', { pageIndex });
      update(taskId, { status: 'done', label: t('tasks.rotateLeftDone', { page: pageIndex + 1 }) });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: t('tasks.rotateFailed') });
    }
  }

  function handleToolAction(label: string): void {
    switch (label) {
      case 'toolbar.zoomIn':           onZoomIn();                      break;
      case 'toolbar.zoomOut':          onZoomOut();                     break;
      case 'toolbar.fullscreen':
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
        break;
      case 'toolbar.searchText':       onOpenSearch();                  break;
      case 'toolbar.deletePage':       void handleDeletePage();         break;
      case 'toolbar.rotateRight':      void handleRotatePageRight();    break;
      case 'toolbar.rotateLeft':       void handleRotatePageLeft();     break;
    }
  }

  const groups = TOOLS_BY_MODE[mode];

  // Annotation tools for review mode — labels are i18n keys
  const annotationTools: Array<{ tool: AnnotationTool & string; label: string; Icon: typeof HighlighterIcon; testId: string }> = [
    { tool: 'highlight',  label: 'toolbar.highlight',     Icon: HighlighterIcon,    testId: 'annotation-tool-highlight' },
    { tool: 'underline',  label: 'toolbar.underline',     Icon: UnderlineIcon,      testId: 'annotation-tool-underline' },
    { tool: 'strikeout',  label: 'toolbar.strikethrough', Icon: StrikethroughIcon,  testId: 'annotation-tool-strikeout' },
    { tool: 'rectangle',  label: 'toolbar.rectangle',     Icon: SquareIcon,         testId: 'annotation-tool-rectangle' },
    { tool: 'redaction',  label: 'toolbar.redact',        Icon: EraserIcon,         testId: 'annotation-tool-redaction' },
  ];

  return (
    <div className="h-10 flex items-center px-3 border-b border-border bg-background shrink-0 overflow-x-auto gap-0">
      {groups.map((group, gi) => (
        <span key={gi} className="flex items-center">
          {gi > 0 && <Divider />}
          <ToolGroup tools={group} onAction={handleToolAction} />
        </span>
      ))}
      {mode === 'read' && (
        <>
          <Divider />
          <span
            className="text-xs font-medium tabular-nums text-muted-foreground px-2 select-none w-12 text-center"
            aria-label={`Zoom ${Math.round(zoom * 100)}%`}
            data-testid="toolbar-zoom-display"
          >
            {Math.round(zoom * 100)}%
          </span>
          {pageCount > 0 && (
            <>
              <Divider />
              {/* Print options — all delegate to the native print dialog */}
              <button
                data-testid="print-current-btn"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title={t('toolbar.printCurrentTitle')}
                aria-label={t('toolbar.printCurrentTitle')}
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t('toolbar.printPage')}</span>
              </button>
              <button
                data-testid="print-range-btn"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title={t('toolbar.printRangeTitle')}
                aria-label={t('toolbar.printRangeTitle')}
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t('toolbar.printRange')}</span>
              </button>
              <button
                data-testid="print-all-btn"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title={t('toolbar.printAllTitle')}
                aria-label={t('toolbar.printAllTitle')}
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t('toolbar.printAll')}</span>
              </button>
            </>
          )}
        </>
      )}

      {/* ── Forms mode: field navigation ─────────────────────────────────── */}
      {mode === 'forms' && formFields.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5" data-testid="field-nav">
            <button
              onClick={() => { onFieldNav(Math.max(0, activeFieldIdx - 1)); }}
              disabled={activeFieldIdx <= 0}
              data-testid="field-prev-btn"
              aria-label={t('toolbar.prevField')}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <span
              data-testid="field-nav-counter"
              className="text-xs tabular-nums text-muted-foreground select-none px-1.5 min-w-12 text-center"
            >
              {activeFieldIdx >= 0 ? `${activeFieldIdx + 1} / ${formFields.length}` : `— / ${formFields.length}`}
            </span>
            {activeFieldIdx >= 0 && (
              <span className="text-xs text-muted-foreground/70 truncate max-w-24 hidden lg:inline">
                {formFields[activeFieldIdx]?.label || formFields[activeFieldIdx]?.name || '—'} · p.{(formFields[activeFieldIdx]?.pageIndex ?? 0) + 1}
              </span>
            )}
            <button
              onClick={() => { onFieldNav(activeFieldIdx < 0 ? 0 : Math.min(formFields.length - 1, activeFieldIdx + 1)); }}
              disabled={formFields.length === 0 || activeFieldIdx >= formFields.length - 1}
              data-testid="field-next-btn"
              aria-label={t('toolbar.nextField')}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {/* ── Review mode: add comment button ─────────────────────────────── */}
      {mode === 'review' && pageCount > 0 && (
        <>
          <Divider />
          <button
            data-testid="add-comment-btn"
            onClick={onAddComment}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label={t('review.addComment')}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t('toolbar.comment')}</span>
          </button>
        </>
      )}

      {/* ── Review mode: annotation tool buttons ─────────────────────────── */}
      {mode === 'review' && pageCount > 0 && (
        <>
          <Divider />
          {annotationTools.map(({ tool, label, Icon, testId }) => {
            const isActive = activeAnnotationTool === tool;
            return (
              <button
                key={tool}
                data-testid={testId}
                onClick={() => { onAnnotationToolChange?.(isActive ? null : tool); }}
                title={t(label)}
                aria-label={t(label)}
                aria-pressed={isActive}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t(label)}</span>
              </button>
            );
          })}
        </>
      )}

      {/* ── Review mode: comment navigation ─────────────────────────────── */}
      {mode === 'review' && comments.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5" data-testid="comment-nav">
            <button
              onClick={() => { onCommentNav(Math.max(0, activeCommentIdx - 1)); }}
              disabled={activeCommentIdx <= 0}
              data-testid="comment-prev-btn"
              aria-label={t('review.prevCommentAriaLabel')}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <span
              data-testid="comment-nav-counter"
              className="text-xs tabular-nums text-muted-foreground select-none px-1.5 min-w-12 text-center"
            >
              {activeCommentIdx >= 0 ? `${activeCommentIdx + 1} / ${comments.length}` : `— / ${comments.length}`}
            </span>
            {activeCommentIdx >= 0 && (
              <span className="text-xs text-muted-foreground/70 truncate max-w-24 hidden lg:inline">
                {comments[activeCommentIdx]?.author || '—'} · p.{(comments[activeCommentIdx]?.pageIndex ?? 0) + 1}
              </span>
            )}
            <button
              onClick={() => { onCommentNav(activeCommentIdx < 0 ? 0 : Math.min(comments.length - 1, activeCommentIdx + 1)); }}
              disabled={comments.length === 0 || activeCommentIdx >= comments.length - 1}
              data-testid="comment-next-btn"
              aria-label={t('review.nextCommentAriaLabel')}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
