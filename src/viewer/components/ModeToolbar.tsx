// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

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
// Wired tools
// ---------------------------------------------------------------------------

/**
 * Tool labels that are fully wired in this release.
 * All other tools render as disabled placeholders.
 */
export const WIRED_TOOLS: ReadonlySet<string> = new Set([
  // Read mode
  'Inzoomen',
  'Uitzoomen',
  'Volledig scherm',
  'Zoek tekst',
  // Organize mode
  'Pagina verwijderen',
  'Links roteren',
  'Rechts roteren',
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
  return (
    <button
      key={tool.label}
      disabled={!wired}
      onClick={wired ? onClick : undefined}
      title={wired ? tool.label : `${tool.label} (not yet available)`}
      aria-label={tool.label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        wired
          ? 'text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer'
          : 'text-muted-foreground/50 cursor-default hover:bg-transparent'
      }`}
    >
      <tool.icon className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{tool.label}</span>
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
  const { push, update } = useTaskQueueContext();

  async function handleDeletePage(): Promise<void> {
    if (!isTauri || pageCount <= 1) return;
    const taskId = `delete-page-${Date.now()}`;
    push({ id: taskId, label: `Pagina ${pageIndex + 1} verwijderen…`, progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('delete_pages', { pageIndices: [pageIndex] });
      update(taskId, { status: 'done', label: `Pagina ${pageIndex + 1} verwijderd` });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: 'Verwijderen mislukt' });
    }
  }

  async function handleRotatePageRight(): Promise<void> {
    if (!isTauri) return;
    const taskId = `rotate-page-right-${Date.now()}`;
    push({ id: taskId, label: `Pagina ${pageIndex + 1} rechtsom roteren…`, progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_page_right', { pageIndex });
      update(taskId, { status: 'done', label: `Pagina ${pageIndex + 1} rechtsom geroteerd` });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: 'Roteren mislukt' });
    }
  }

  async function handleRotatePageLeft(): Promise<void> {
    if (!isTauri) return;
    const taskId = `rotate-page-left-${Date.now()}`;
    push({ id: taskId, label: `Pagina ${pageIndex + 1} linksom roteren…`, progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ page_count: number }>('rotate_page_left', { pageIndex });
      update(taskId, { status: 'done', label: `Pagina ${pageIndex + 1} linksom geroteerd` });
      onPageMutation(result.page_count);
    } catch {
      update(taskId, { status: 'error', label: 'Roteren mislukt' });
    }
  }

  function handleToolAction(label: string): void {
    switch (label) {
      case 'Inzoomen':           onZoomIn();                      break;
      case 'Uitzoomen':          onZoomOut();                     break;
      case 'Volledig scherm':
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
        break;
      case 'Zoek tekst':         onOpenSearch();                  break;
      case 'Pagina verwijderen': void handleDeletePage();         break;
      case 'Rechts roteren':     void handleRotatePageRight();    break;
      case 'Links roteren':      void handleRotatePageLeft();     break;
    }
  }

  const groups = TOOLS_BY_MODE[mode];

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
                title="Huidige pagina afdrukken"
                aria-label="Huidige pagina afdrukken"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Pagina</span>
              </button>
              <button
                data-testid="print-range-btn"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title="Bereik afdrukken"
                aria-label="Bereik afdrukken"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Bereik</span>
              </button>
              <button
                data-testid="print-all-btn"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title="Alles afdrukken"
                aria-label="Alles afdrukken"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Alles</span>
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
              aria-label="Vorig veld"
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
              aria-label="Volgend veld"
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
            aria-label="Opmerking toevoegen"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Opmerking</span>
          </button>
        </>
      )}

      {/* ── Review mode: annotation tool buttons ─────────────────────────── */}
      {mode === 'review' && pageCount > 0 && (
        <>
          <Divider />
          {(
            [
              { tool: 'highlight' as const, label: 'Markeren', Icon: HighlighterIcon, testId: 'annotation-tool-highlight' },
              { tool: 'underline' as const, label: 'Onderstrepen', Icon: UnderlineIcon, testId: 'annotation-tool-underline' },
              { tool: 'strikeout' as const, label: 'Doorstrepen', Icon: StrikethroughIcon, testId: 'annotation-tool-strikeout' },
              { tool: 'rectangle' as const, label: 'Rechthoek', Icon: SquareIcon, testId: 'annotation-tool-rectangle' },
              { tool: 'redaction' as const, label: 'Redigeren', Icon: EraserIcon, testId: 'annotation-tool-redaction' },
            ] as const
          ).map(({ tool, label, Icon, testId }) => {
            const isActive = activeAnnotationTool === tool;
            return (
              <button
                key={tool}
                data-testid={testId}
                onClick={() => { onAnnotationToolChange?.(isActive ? null : tool); }}
                title={label}
                aria-label={label}
                aria-pressed={isActive}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{label}</span>
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
              aria-label="Vorige opmerking"
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
              aria-label="Volgende opmerking"
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
