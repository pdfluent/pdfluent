// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef, useCallback, useMemo, type DragEvent } from 'react';
import { Loader2Icon, MaximizeIcon } from 'lucide-react';
import type { OutlineNode, FormField, FormFieldValue, Annotation, Reply, TextSpan } from '../core/document';
import { WelcomeScreen } from './components/WelcomeScreen';
import { makeDocumentEvent, appendEvent } from './state/documentEvents';
import type { DocumentEvent } from './state/documentEvents';
import { TimelinePanel } from './components/TimelinePanel';
import { extractDocumentIssues } from './documentIssues';
import { IssuePanel } from './components/IssuePanel';
import {
  buildReviewSummaryData,
  buildReviewSummaryJson,
  buildReviewSummaryMarkdown,
  buildReviewSummaryHtml,
} from './export/reviewSummary';
import { buildAuditReportData, buildAuditReportMarkdown } from './export/auditReport';
import { captureRevisionSnapshot } from './revisionSnapshot';
import type { RevisionSnapshot } from './revisionSnapshot';
import { compareSnapshots, formatSnapshotDiffMarkdown } from './revisionCompare';

import type { ViewerMode } from './types';
import { useEngine } from './hooks/useEngine';
import { useDocument } from './hooks/useDocument';
import { useThumbnails } from './hooks/useThumbnails';
import { useRecentFiles } from './hooks/useRecentFiles';
import { TopBar } from './components/TopBar';
import { ModeSwitcher } from './components/ModeSwitcher';
import { ModeToolbar, type AnnotationTool } from './components/ModeToolbar';
import { LeftNavRail } from './components/LeftNavRail';
import { PageCanvas } from './components/PageCanvas';
import { RightContextPanel } from './components/RightContextPanel';
import { BottomTaskBar } from './components/BottomTaskBar';
import { CommandPalette, type Command } from './components/CommandPalette';
import { AllToolsPanel } from './components/AllToolsPanel';
import { ExportDialog } from './components/ExportDialog';
import { OrganizeGrid } from './components/OrganizeGrid';
import { ShortcutSheet } from './components/ShortcutSheet';
import { GoToPageDialog } from './components/GoToPageDialog';
import { ZoomPresetsPopover } from './components/ZoomPresetsPopover';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog';
import { SearchPanel } from './components/SearchPanel';
import { TaskQueueProvider } from './context/TaskQueueContext';
import { useHoverController } from './interaction/hoverController';
import { getInteractionState, stateDataAttr } from './interaction/interactionState';
import { getCursorForTool, toCssCursor } from './interaction/cursorController';
import { groupDigitalTextSpans } from './text/textGrouping';
import type { PageTextStructure, TextParagraphTarget } from './text/textInteractionModel';
import { isTextInteractionActive } from './text/textInteractionRules';
import { getEditability, extractText } from './text/textEditability';
import { getMutationSupport, validateReplacement } from './text/textMutationSupport';
import { TextContextBar, shouldShowContextBar } from './components/TextContextBar';
import type { TextContextActionId } from './components/TextContextBar';
import { TextInlineEditor } from './components/TextInlineEditor';
import { FormFieldOverlay } from './components/FormFieldOverlay';
import { makeTextMutationError, appendError } from './state/errorCenter';
import type { AppError } from './state/errorCenter';
import { getTauriTextMutationEngine } from '../platform/engine/tauri/TauriTextMutationEngine';

// Dev-only test hook — never present in production builds
declare global {
  interface Window {
    __pdfluent_test__?: {
      loadDocument: (source: string | ArrayBuffer) => Promise<void>;
      interactionDebug?: {
        hoveredTarget: string | null;
        annotationInteractionState: string;
        canvasCursorCss: string | undefined;
        selectedTextTargetId: string | null;
        editingTextTargetId: string | null;
      };
      editTelemetry?: {
        events: readonly import('./state/editTelemetry').EditTelemetryEvent[];
        summary: import('./state/editTelemetry').EditTelemetrySummary;
        clear: () => void;
      };
    };
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Modes that show the RightContextPanel
const MODES_WITH_RIGHT_PANEL: ReadonlySet<ViewerMode> = new Set([
  'read', 'review', 'edit', 'forms', 'protect',
]);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** A single text-search hit within the document. */
export interface SearchResult {
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  spanIndex: number;
}

export function ViewerApp() {
  const { engine, loading: engineLoading, error: engineError } = useEngine();
  const {
    document: pdfDoc,
    metadata,
    pageCount,
    loading: docLoading,
    error: docError,
    isDirty,
    markDirty,
    clearDirty,
    updatePageCount,
    loadDocument,
    closeDocument,
  } = useDocument(engine);
  const { thumbnails } = useThumbnails(engine, pdfDoc, pageCount);
  const { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles } = useRecentFiles();

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(() => {
    try {
      const stored = parseFloat(localStorage.getItem('pdfluent.viewer.zoom') ?? '');
      if (!isNaN(stored) && stored >= 0.25 && stored <= 4) return stored;
    } catch { /* localStorage unavailable */ }
    return 1.0;
  });
  const [mode, setMode] = useState<ViewerMode>('read');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [goToPageOpen, setGoToPageOpen] = useState(false);
  const [zoomPresetsOpen, setZoomPresetsOpen] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(() => {
    try {
      return localStorage.getItem('pdfluent.viewer.rail') !== 'false';
    } catch { /* localStorage unavailable */ }
    return true;
  });
  const [recentCmdIds, setRecentCmdIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('pdfluent.viewer.commands.recent');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed as string[];
      }
    } catch { /* localStorage unavailable or corrupt */ }
    return [];
  });
  const [documentVersion, setDocumentVersion] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [pageLabels, setPageLabels] = useState<string[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  // All annotations loaded from the PDF (all types). Drives canvas markers.
  const [allAnnotations, setAllAnnotations] = useState<Annotation[]>([]);
  // Review workflow: map of annotation id → resolved status (stored in frontend state).
  const [reviewStatuses, setReviewStatuses] = useState<Map<string, 'open' | 'resolved'>>(new Map());
  // Review workflow: map of annotation id → reply thread (stored in frontend state).
  const [commentReplies, setCommentReplies] = useState<Map<string, Reply[]>>(new Map());
  // Text-only annotations (useMemo over allAnnotations) — used by the comment sidebar.
  // Merges the frontend review status and replies into each annotation.
  const comments = useMemo(
    () => allAnnotations
      .filter(a => a.type === 'text')
      .sort((a, b) => a.pageIndex - b.pageIndex)
      .map(a => ({ ...a, status: reviewStatuses.get(a.id) ?? 'open' as const, replies: commentReplies.get(a.id) ?? [] })),
    [allAnnotations, reviewStatuses, commentReplies]
  );
  const [activeCommentIdx, setActiveCommentIdx] = useState(-1);
  // Scanned page detection: set of 0-based page indices that have little/no extractable text
  const [scannedPageIndices, setScannedPageIndices] = useState<Set<number>>(new Set());
  // OCR progress and results
  const [ocrRunning, setOcrRunning] = useState(false);
  // Per-page OCR word boxes — used by OcrOverlay to render bounding boxes
  const [ocrPageWords, setOcrPageWords] = useState<Map<number, Array<{ text: string; confidence: number; x0: number; y0: number; x1: number; y1: number; renderedWidth: number; renderedHeight: number }>>>(new Map());
  const [_ocrProgress, setOcrProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  // Document event log — in-memory audit trail for this editing session
  const [documentEventLog, setDocumentEventLog] = useState<DocumentEvent[]>([]);
  // App-level error registry — surfaced by Phase 4+ notification UI
  const [_appErrors, setAppErrors] = useState<AppError[]>([]);
  // Active annotation tool — drives canvas cursor and annotation creation
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationTool>(null);
  // Selected non-text annotation (markup type) — rendered with distinct outline in overlay
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // Reviewer name — persisted to localStorage so it survives page reloads
  const [authorName, setAuthorName] = useState(() => {
    try { return localStorage.getItem('pdfluent.user.author') ?? ''; } catch { return ''; }
  });
  const handleAuthorChange = useCallback((name: string) => {
    setAuthorName(name);
    try { localStorage.setItem('pdfluent.user.author', name); } catch { /* ignore */ }
  }, []);
  const [activeFieldIdx, setActiveFieldIdx] = useState(-1);
  const [formValidationErrors, setFormValidationErrors] = useState<Array<{ fieldId: string; errors: string[] }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  // ---------------------------------------------------------------------------
  // Interaction infrastructure (Batch 7 — additive, no user-visible changes)
  // ---------------------------------------------------------------------------

  // Centralised hover tracking across all interactive surfaces.
  // onHoverEnter / onHoverLeave / clearHover will be passed to interactive components in future batches.
  const {
    hoveredTarget,
    onEnter: _onHoverEnter,
    onLeave: _onHoverLeave,
    clearHover: _clearHover,
  } = useHoverController();

  // Derive interaction state for the currently selected annotation.
  // Used to propagate consistent state to chrome / cursor systems.
  const annotationInteractionState = useMemo(
    () => getInteractionState({
      isSelected: selectedAnnotationId !== null,
      isHovered: hoveredTarget !== null && hoveredTarget === selectedAnnotationId,
    }),
    [selectedAnnotationId, hoveredTarget],
  );

  // Derive canvas cursor from the active annotation tool via the cursor controller.
  // This mirrors the existing ad-hoc switch in PageCanvas — both are correct;
  // the controller will become the single source of truth in a future batch.
  const canvasCursorCss = useMemo(
    () => toCssCursor(getCursorForTool(activeAnnotationTool)),
    [activeAnnotationTool],
  );

  // Grouped text structure for the current page — drives TextInteractionOverlay.
  // Recomputed only when textSpans changes (i.e. page navigation or document load).
  const pageTextStructure = useMemo((): PageTextStructure | null => {
    if (textSpans.length === 0) return null;
    return groupDigitalTextSpans(textSpans, pageIndex);
  }, [textSpans, pageIndex]);

  // Text interaction level driven by mode + active tool (Batch 5 rules).
  const textInteractionActive = isTextInteractionActive(mode, activeAnnotationTool);

  // ---------------------------------------------------------------------------
  // Selected text target state — Phase 3 canonical selection
  // ---------------------------------------------------------------------------

  /** The paragraph currently selected by the user (click-to-select). */
  const [selectedTextTargetId, setSelectedTextTargetId] = useState<string | null>(null);
  const [selectedTextTarget, setSelectedTextTarget] = useState<TextParagraphTarget | null>(null);

  /** The paragraph currently open for inline editing. */
  const [editingTextTargetId, setEditingTextTargetId] = useState<string | null>(null);

  /** Live draft text while inline editing is active. */
  const [textDraft, setTextDraft] = useState<string>('');

  const handleTextTargetSelect = useCallback((target: TextParagraphTarget | null) => {
    setSelectedTextTarget(target);
    setSelectedTextTargetId(target?.id ?? null);
    // Clear editing when selection changes away from the editing target
    setEditingTextTargetId(prev => (target?.id === prev ? prev : null));
    setTextDraft(prev => (target?.id === editingTextTargetId ? prev : ''));
  // editingTextTargetId intentionally excluded — we only need target.id and prev state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Enter inline edit mode for a text paragraph.
   * Guards against non-editable targets — sets editingTextTargetId only when eligible.
   */
  const handleEditEntry = useCallback((target: TextParagraphTarget) => {
    const editability = getEditability(target, mode, activeAnnotationTool);
    if (editability.status !== 'editable') return;
    // Ensure selection is up-to-date (double-click may have deselected via toggle)
    setSelectedTextTarget(target);
    setSelectedTextTargetId(target.id);
    setEditingTextTargetId(target.id);
    setTextDraft(extractText(target));
  }, [mode, activeAnnotationTool]);

  /** Handle context bar action — route 'edit-text' to edit entry. */
  const handleTextContextAction = useCallback((actionId: TextContextActionId, target: TextParagraphTarget) => {
    if (actionId === 'edit-text') {
      handleEditEntry(target);
    }
    // Other actions (annotate, redact, copy, summarize, explain) are handled
    // by the action registry fire inside TextContextBar.
  }, [handleEditEntry]);

  /** Cancel inline editing — discard draft and exit edit mode. */
  const handleDraftCancel = useCallback(() => {
    setEditingTextTargetId(null);
    setTextDraft('');
  }, []);

  /**
   * Commit inline draft — Phase 4 real mutation path.
   *
   * For writable targets (single-span digital text):
   *   1. Validate the replacement (must be equal-or-shorter)
   *   2. Call the Tauri mutation backend
   *   3. On success: markDirty + emit event log entry
   *   4. On failure: surface error through error center
   *
   * For non-writable targets:
   *   Exit edit mode — the mutation support layer will surface the reason
   *   via textMutationMessaging (Batch 5).
   */
  const handleDraftCommit = useCallback(async (committedText: string) => {
    if (!selectedTextTarget) return;

    const originalText = extractText(selectedTextTarget);

    // No-change: just close edit mode
    if (committedText === originalText) {
      setEditingTextTargetId(null);
      setTextDraft('');
      return;
    }

    const mutationSupport = getMutationSupport(selectedTextTarget);

    if (!mutationSupport.writable) {
      // Non-writable structure: exit edit mode without mutation.
      // Phase 5 (textMutationMessaging) will surface the reason.
      setEditingTextTargetId(null);
      setTextDraft('');
      return;
    }

    // Validate replacement before calling the backend
    const validation = validateReplacement(originalText, committedText, mutationSupport.constraints!);
    if (!validation.valid) {
      setAppErrors(prev => appendError(prev, makeTextMutationError(validation.message)));
      return; // Stay in edit mode — user can correct the replacement
    }

    // Attempt real PDF text mutation via Tauri backend
    try {
      const mutationEngine = getTauriTextMutationEngine();
      const result = await mutationEngine.replaceTextSpan({
        pageIndex,
        originalText,
        replacementText: committedText,
      });

      if (result.success && result.value.replaced) {
        markDirty();
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'page_mutated', authorName, pageIndex, selectedTextTarget?.id ?? '', `Tekst bewerkt: "${originalText}" → "${committedText}"`,
        )));
        setEditingTextTargetId(null);
        setTextDraft('');
      } else if (result.success && !result.value.replaced) {
        // Text not found in content stream — honest failure, not retryable
        setAppErrors(prev => appendError(prev, makeTextMutationError(
          result.value.reason ?? 'Tekst niet gevonden in de PDF-inhoud.',
        )));
        setEditingTextTargetId(null);
        setTextDraft('');
      } else if (!result.success) {
        setAppErrors(prev => appendError(prev, makeTextMutationError(result.error.message)));
        setEditingTextTargetId(null);
        setTextDraft('');
      }
    } catch (e) {
      setAppErrors(prev => appendError(prev, makeTextMutationError(String(e))));
      setEditingTextTargetId(null);
      setTextDraft('');
    }
  }, [selectedTextTarget, pageIndex, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Timeline panel visibility
  const [showTimeline, setShowTimeline] = useState(false);
  // Issue panel visibility
  const [showIssuePanel, setShowIssuePanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeSearchResultIdx, setActiveSearchResultIdx] = useState(-1);
  /** Reset search to initial state (query, results, active index). */
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setActiveSearchResultIdx(-1);
  }, []);

  /**
   * Run a case-insensitive full-document search.
   * Iterates every page, extracts TextSpans, and collects all spans whose
   * text contains the (trimmed, lowercased) query.
   */
  const runSearch = useCallback(async (query: string): Promise<void> => {
    if (!pdfDoc || !engine) return;
    const normalized = query.trim().toLowerCase();
    if (normalized === '') {
      setSearchResults([]);
      setActiveSearchResultIdx(-1);
      return;
    }
    const results: SearchResult[] = [];
    const queryEngine = engine.query;
    for (let p = 0; p < pageCount; p++) {
      const result = await queryEngine.extractPageTextSpans(pdfDoc, p);
      if (!result.success) continue;
      result.value.forEach((span, spanIndex) => {
        if (span.text.toLowerCase().includes(normalized)) {
          results.push({ pageIndex: p, rect: span.rect, text: span.text, spanIndex });
        }
      });
    }
    setSearchResults(results);
    setActiveSearchResultIdx(results.length > 0 ? 0 : -1);
  }, [pdfDoc, engine, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Advance to the next search result (wraps around). */
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = activeSearchResultIdx < searchResults.length - 1 ? activeSearchResultIdx + 1 : 0;
    setActiveSearchResultIdx(next);
    const nextItem = searchResults[next];
    if (nextItem) setPageIndex(nextItem.pageIndex);
  }, [searchResults, activeSearchResultIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Go to the previous search result (wraps around). */
  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = activeSearchResultIdx > 0 ? activeSearchResultIdx - 1 : searchResults.length - 1;
    setActiveSearchResultIdx(prev);
    const prevItem = searchResults[prev];
    if (prevItem) setPageIndex(prevItem.pageIndex);
  }, [searchResults, activeSearchResultIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stores the action to run after the user resolves the unsaved-changes dialog
  const pendingActionRef = useRef<(() => void) | null>(null);
  // State resilience — tracks whether a save is in progress to block navigation.
  // Using refs so keyboard handlers/callbacks can read the latest value without stale closures.
  const isSavingRef = useRef(false);
  const docLoadingRef = useRef(docLoading);
  useEffect(() => { docLoadingRef.current = docLoading; }, [docLoading]);

  // Wrap loadDocument to capture the file path when opened from disk.
  // ArrayBuffer sources (browser drag-and-drop, test harness) clear the path.
  // Guard: ask for confirmation when unsaved changes would be discarded.
  const handleLoadDocument = useCallback(async (source: string | ArrayBuffer): Promise<void> => {
    if (isDirty) {
      pendingActionRef.current = () => {
        setCurrentFilePath(typeof source === 'string' ? source : null);
        void loadDocument(source);
      };
      setUnsavedDialogOpen(true);
      return;
    }
    setCurrentFilePath(typeof source === 'string' ? source : null);
    await loadDocument(source);
  }, [isDirty, loadDocument]);

  // Record a file path in the recent-files list only when a load succeeds.
  // pdfDoc.id changes only on a successful new document load — not on mutations
  // or failed loads — so this effect fires exactly when we want it to.
  const lastDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfDoc) { lastDocIdRef.current = null; return; }
    if (!currentFilePath) return;
    if (pdfDoc.id === lastDocIdRef.current) return;
    lastDocIdRef.current = pdfDoc.id;
    addRecentFile(currentFilePath);
  }, [pdfDoc?.id, currentFilePath, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search persistence: clear search when a new document is opened.
  // Search results are document-specific — persisting across loads would show stale matches.
  useEffect(() => {
    clearSearch();
    setIsSearchOpen(false);
  }, [pdfDoc?.id, clearSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn the browser / OS when there are unsaved changes and the window is closed.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      if (!isDirty) return;
      e.preventDefault();
      // Legacy support: some browsers require returnValue to be set.
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [isDirty]);

  // Stability: clamp pageIndex whenever pageCount changes so it never exceeds the last valid page.
  // handlePageMutation already clamps after mutations; this covers all other cases.
  useEffect(() => {
    if (pageCount <= 0) return;
    setPageIndex(prev => Math.min(prev, pageCount - 1));
  }, [pageCount]);

  // Persist zoom to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.zoom', String(zoom));
    } catch { /* ignore write errors */ }
  }, [zoom]);

  // Persist left rail visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.rail', String(leftRailOpen));
    } catch { /* ignore write errors */ }
  }, [leftRailOpen]);

  // Persist recent command history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.commands.recent', JSON.stringify(recentCmdIds));
    } catch { /* ignore write errors */ }
  }, [recentCmdIds]);

  // Persist current page position per file path — written on every page change
  // ArrayBuffer / anonymous sources have no currentFilePath and are skipped
  useEffect(() => {
    if (!currentFilePath) return;
    try {
      const raw = localStorage.getItem('pdfluent.viewer.pages');
      const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      map[currentFilePath] = pageIndex;
      // Cap the map at 50 entries (FIFO) to bound localStorage size
      const keys = Object.keys(map);
      if (keys.length > 50) { const oldest = keys[0]; if (oldest) delete map[oldest]; }
      localStorage.setItem('pdfluent.viewer.pages', JSON.stringify(map));
    } catch { /* ignore write errors */ }
  }, [pageIndex, currentFilePath]);

  // Unsaved-changes dialog handlers
  const handleUnsavedSave = useCallback(async () => {
    if (currentFilePath) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path: currentFilePath });
        clearDirty();
      } catch { /* save failed — proceed anyway; task bar will surface the error */ }
    }
    setUnsavedDialogOpen(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, [currentFilePath, clearDirty]);

  const handleUnsavedDiscard = useCallback(() => {
    setUnsavedDialogOpen(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialogOpen(false);
    pendingActionRef.current = null;
  }, []);

  // Called when a command palette entry is run — prepends id, dedupes, caps at 5
  const handleCommandRun = useCallback((id: string) => {
    setRecentCmdIds(prev => {
      const deduped = [id, ...prev.filter(x => x !== id)];
      return deduped.slice(0, 5);
    });
  }, []);

  // Save a copy of the document to a user-chosen path (⌘⇧S / "Opslaan als").
  // Opens the Tauri save dialog, writes the PDF, then updates currentFilePath,
  // clears the dirty flag, and records the new path in recent files.
  const handleSaveAs = useCallback(async () => {
    if (!isTauri || pageCount === 0) return;
    // Guard: do not start a save while the document is still loading
    if (docLoadingRef.current) return;
    isSavingRef.current = true;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!path) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_pdf', { path });
      setCurrentFilePath(path);
      clearDirty();
      addRecentFile(path);
    } catch { /* silent — task queue lives in TopBar, not here */ }
    finally { isSavingRef.current = false; }
  }, [pageCount, clearDirty, addRecentFile]);

  // Set a form field's value via the Tauri bridge, then optimistically update
  // the formFields state with the returned field.
  // Marks the document dirty so the save button activates.
  const handleSetFieldValue = useCallback((fieldId: string, value: FormFieldValue) => {
    if (!pdfDoc || !engine) return;
    const fieldPage = formFields.find(f => f.id === fieldId)?.pageIndex ?? -1;
    void engine.form.setFormFieldValue(pdfDoc, fieldId, value).then(result => {
      if (result.success) {
        setFormFields(prev => prev.map(f => f.id === result.value.id ? result.value : f));
        markDirty();
        // Clear any outstanding validation error for this field as the user corrects it
        setFormValidationErrors(prev => prev.filter(e => e.fieldId !== fieldId));
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'form_field_updated', authorName, fieldPage, fieldId, 'Formulierveld bijgewerkt'
        )));
      }
    });
  }, [pdfDoc, engine, formFields, authorName, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate all form fields, surface per-field errors, then save on success.
  // Uses validateAllFormFields (sync) — no Rust bridge needed for validation itself.
  const handleFormSubmit = useCallback(async () => {
    if (!pdfDoc || !engine) return;
    const result = engine.form.validateAllFormFields(pdfDoc);
    if (!result.success) return;
    const { invalid } = result.value;
    if (invalid.length > 0) {
      setFormValidationErrors(invalid);
      return;
    }
    setFormValidationErrors([]);
    // Save to current path if known; otherwise open Save As dialog
    if (currentFilePath && isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path: currentFilePath });
        clearDirty();
      } catch { /* silent — TopBar task queue surfaces errors */ }
    } else {
      await handleSaveAs();
    }
  }, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a form field by index: jump to its page and record it as active.
  const handleFieldNav = useCallback((idx: number) => {
    setActiveFieldIdx(idx);
    if (idx >= 0 && idx < formFields.length) {
      const field = formFields[idx];
      if (field) setPageIndex(field.pageIndex);
    }
  }, [formFields]);

  // Navigate to a comment by index: jump to its page and record it as active.
  const handleCommentNav = useCallback((idx: number) => {
    setActiveCommentIdx(idx);
    if (idx >= 0 && idx < comments.length) {
      const comment = comments[idx];
      if (comment) setPageIndex(comment.pageIndex);
    }
  }, [comments]);

  // Jump to the next comment in the list (wraps around).
  const handleNextComment = useCallback(() => {
    if (comments.length === 0) return;
    const next = activeCommentIdx < comments.length - 1 ? activeCommentIdx + 1 : 0;
    handleCommentNav(next);
  }, [activeCommentIdx, comments, handleCommentNav]);

  // Jump to the previous comment in the list (wraps around).
  const handlePrevComment = useCallback(() => {
    if (comments.length === 0) return;
    const prev = activeCommentIdx > 0 ? activeCommentIdx - 1 : comments.length - 1;
    handleCommentNav(prev);
  }, [activeCommentIdx, comments, handleCommentNav]);

  // Write title/author into the PDF Info dictionary via the Tauri backend, then mark dirty.
  // subject and keywords are accepted for API symmetry but not yet persisted to the backend.
  const handleMetadataChange = useCallback((key: 'title' | 'author' | 'subject' | 'keywords', value: string) => {
    if (!pdfDoc || !isTauri) return;
    if (key === 'title' || key === 'author') {
      void import('@tauri-apps/api/core').then(({ invoke }) => {
        void invoke('set_metadata', {
          title: key === 'title' ? value : null,
          author: key === 'author' ? value : null,
        });
      });
    }
    markDirty();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'metadata_changed', authorName, -1, key, `Metadata gewijzigd: ${key}`
    )));
  }, [pdfDoc, authorName, markDirty]);

  // Create a new empty text annotation at the center of the current page,
  // then re-fetch all annotations so the panel shows the real ID from the backend.
  const handleAddComment = useCallback(() => {
    if (!pdfDoc || !engine) return;
    const page = pdfDoc.pages[pageIndex];
    if (!page) return;
    const x = page.size.width / 2;
    const y = page.size.height / 2;
    void engine.annotation.createAnnotation(
      pdfDoc, pageIndex, 'text',
      { x, y, width: 24, height: 24 },
      { contents: '', author: authorName || 'User' }
    ).then(async result => {
      if (result.success) {
        const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
        if (annotResult.success) {
          setAllAnnotations(annotResult.value);
        }
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_created', authorName || 'User', pageIndex, result.value?.id ?? '', 'Annotatie aangemaakt'
        )));
      }
    });
  }, [pdfDoc, engine, pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: refetch ALL annotations from backend and update allAnnotations state.
  // The comments useMemo re-derives text-only annotations automatically.
  const refetchComments = useCallback(async () => {
    if (!pdfDoc || !engine) return;
    const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
    if (annotResult.success) {
      setAllAnnotations(annotResult.value);
    }
  }, [pdfDoc, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete a comment annotation. Resets activeCommentIdx when the deleted
  // comment was at or before the active index to keep the selection valid.
  const handleDeleteComment = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    const deletedIdx = comments.findIndex(c => c.id === annotationId);
    const deletedPage = comments[deletedIdx]?.pageIndex ?? -1;
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        await refetchComments();
        // Adjust active index: if deleted comment was the active one → reset;
        // if it was before the active one → shift down by 1.
        setActiveCommentIdx(prev => {
          if (prev < 0) return prev;
          if (deletedIdx === prev) return -1;
          if (deletedIdx < prev) return prev - 1;
          return prev;
        });
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_deleted', authorName, deletedPage, annotationId, 'Annotatie verwijderd'
        )));
      }
    });
  }, [pdfDoc, engine, comments, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update a comment's text contents, then refetch.
  // activeCommentIdx is preserved — the annotation stays at the same logical
  // position after a contents-only update.
  const handleUpdateComment = useCallback((annotationId: string, newContents: string) => {
    if (!pdfDoc || !engine) return;
    const annotPage = comments.find(c => c.id === annotationId)?.pageIndex ?? -1;
    void engine.annotation.updateAnnotation(pdfDoc, annotationId, { contents: newContents })
      .then(async result => {
        if (result.success) {
          await refetchComments();
          setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
            'annotation_updated', authorName, annotPage, annotationId, 'Annotatie bijgewerkt'
          )));
        }
      });
  }, [pdfDoc, engine, comments, authorName, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle resolved/open status for a comment (stored in frontend review state).
  const handleToggleResolvedStatus = useCallback((annotationId: string) => {
    setReviewStatuses(prev => {
      const next = new Map(prev);
      const current = next.get(annotationId) ?? 'open';
      next.set(annotationId, current === 'open' ? 'resolved' : 'open');
      return next;
    });
  }, []);

  // Add a reply to a comment thread (stored in frontend state).
  const handleAddReply = useCallback((annotationId: string, contents: string, author: string) => {
    const reply: Reply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author,
      contents,
      createdAt: new Date(),
    };
    setCommentReplies(prev => {
      const next = new Map(prev);
      const existing = next.get(annotationId) ?? [];
      next.set(annotationId, [...existing, reply]);
      return next;
    });
  }, []);

  // Delete a reply from a comment thread.
  const handleDeleteReply = useCallback((annotationId: string, replyId: string) => {
    setCommentReplies(prev => {
      const next = new Map(prev);
      const existing = next.get(annotationId) ?? [];
      next.set(annotationId, existing.filter(r => r.id !== replyId));
      return next;
    });
  }, []);

  const handleResolveAll = useCallback(() => {
    setReviewStatuses(prev => {
      const next = new Map(prev);
      for (const c of allAnnotations) {
        next.set(c.id, 'resolved');
      }
      return next;
    });
  }, [allAnnotations]);

  const handleDeleteAllResolved = useCallback(() => {
    // Remove review status entries and annotation entries for resolved comments
    setReviewStatuses(prev => {
      const next = new Map(prev);
      for (const [id, status] of prev) {
        if (status === 'resolved') next.delete(id);
      }
      return next;
    });
    setAllAnnotations(prev => prev.filter(a => (reviewStatuses.get(a.id) ?? 'open') !== 'resolved'));
  }, [reviewStatuses]);

  // Derived document issues — extracted from annotations and review state
  const documentIssues = useMemo(
    () => extractDocumentIssues(allAnnotations, reviewStatuses),
    [allAnnotations, reviewStatuses]
  );

  // Export the full review summary to a downloadable file.
  const handleExportReviewSummary = useCallback((format: 'json' | 'markdown' | 'html') => {
    if (allAnnotations.length === 0 && documentIssues.length === 0 && documentEventLog.length === 0) return;
    const data = buildReviewSummaryData(
      metadata?.title?.trim() || pdfDoc?.fileName || 'Document',
      allAnnotations,
      reviewStatuses,
      commentReplies,
      documentIssues,
      documentEventLog,
    );
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = buildReviewSummaryJson(data);
      mime = 'application/json';
      ext = 'json';
    } else if (format === 'html') {
      content = buildReviewSummaryHtml(data);
      mime = 'text/html';
      ext = 'html';
    } else {
      content = buildReviewSummaryMarkdown(data);
      mime = 'text/markdown';
      ext = 'md';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-summary.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allAnnotations, reviewStatuses, commentReplies, documentIssues, documentEventLog, metadata, pdfDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleExportReviewSummary; // will be wired to RightContextPanel export button

  // Revision snapshots — list of captured review-state snapshots for comparison
  const [revisionSnapshots, setRevisionSnapshots] = useState<RevisionSnapshot[]>([]);

  // Capture a new revision snapshot of the current review state.
  const handleCaptureSnapshot = useCallback((label: string) => {
    const snapshot = captureRevisionSnapshot(
      label,
      allAnnotations,
      reviewStatuses,
      commentReplies,
      documentIssues,
    );
    setRevisionSnapshots(prev => [...prev, snapshot]);
  }, [allAnnotations, reviewStatuses, commentReplies, documentIssues]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleCaptureSnapshot; // will be wired to revision snapshot UI

  // Compare two snapshots and download the diff as Markdown.
  const handleCompareSnapshots = useCallback((beforeIdx: number, afterIdx: number) => {
    const before = revisionSnapshots[beforeIdx];
    const after = revisionSnapshots[afterIdx];
    if (!before || !after) return;
    const diff = compareSnapshots(before, after);
    const md = formatSnapshotDiffMarkdown(before, after, diff);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revision-diff.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [revisionSnapshots]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleCompareSnapshots; // will be wired to revision compare UI

  // Export a formal audit report to a downloadable Markdown file.
  const handleExportAuditReport = useCallback((format: 'markdown') => {
    if (documentEventLog.length === 0 && allAnnotations.length === 0) return;
    const data = buildAuditReportData(
      metadata?.title?.trim() || pdfDoc?.fileName || 'Document',
      allAnnotations,
      documentEventLog,
      documentIssues,
    );
    const content = buildAuditReportMarkdown(data);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report.${format === 'markdown' ? 'md' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allAnnotations, documentEventLog, documentIssues, metadata, pdfDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleExportAuditReport; // will be wired to audit report export button

  // Run OCR on selected pages (scanned | all) and store word results for the overlay.
  const handleRunOcr = useCallback(async (options: {
    language: string;
    scope: 'scanned' | 'all';
    preprocessMode: 'off' | 'auto' | 'manual';
  }) => {
    if (!pdfDoc || !isTauri || ocrRunning) return;
    const pagesToProcess: number[] = options.scope === 'scanned'
      ? Array.from(scannedPageIndices)
      : Array.from({ length: pdfDoc.pages.length }, (_, i) => i);
    if (pagesToProcess.length === 0) return;
    setOcrRunning(true);
    setOcrProgress({ processed: 0, total: pagesToProcess.length });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const results = new Map(ocrPageWords);
      for (const pageIndex of pagesToProcess) {
        const rendered = await invoke<{ data_base64: string; width: number; height: number }>(
          'render_page', { pageIndex, zoom: 2 }
        );
        const ocrResult = await invoke<{
          words: Array<{ text: string; confidence: number; x0: number; y0: number; x1: number; y1: number }>;
        }>('run_paddle_ocr', {
          payload: {
            image_base64: rendered.data_base64,
            language: options.language,
            include_structure: false,
            preprocess_mode: options.preprocessMode,
          },
        });
        results.set(pageIndex, ocrResult.words.map(w => ({
          ...w,
          renderedWidth: rendered.width,
          renderedHeight: rendered.height,
        })));
        setOcrProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
      }
      setOcrPageWords(results);
    } finally {
      setOcrRunning(false);
    }
  }, [pdfDoc, ocrRunning, scannedPageIndices, ocrPageWords]);

  // Create a text-markup annotation (highlight / underline / strikeout) from text selection rects.
  // Called by PageCanvas → TextLayer when the user releases the mouse with text selected.
  const handleTextSelection = useCallback(async (
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => {
    if (!pdfDoc || !isTauri || !activeAnnotationTool) return;
    if (docLoadingRef.current) return;
    if (activeAnnotationTool !== 'highlight' && activeAnnotationTool !== 'underline' && activeAnnotationTool !== 'strikeout' && activeAnnotationTool !== 'redaction') return;
    if (rects.length === 0) return;
    // Discard degenerate rects (zero-size, negative dimensions)
    const validRects = rects.filter(r => r.width > 0 && r.height > 0);
    if (validRects.length === 0) return;
    // Default yellow color [R, G, B] as fractions 0-1
    const color: [number, number, number] = [1.0, 1.0, 0.0];
    // Backend rects format: [x, y, x+width, y+height] (lower-left to upper-right in PDF space)
    const backendRects = validRects.map(r => [r.x, r.y, r.x + r.width, r.y + r.height] as [number, number, number, number]);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (activeAnnotationTool === 'highlight') {
        await invoke('add_highlight_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'underline') {
        await invoke('add_underline_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'strikeout') {
        await invoke('add_strikeout_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'redaction') {
        // Compute bounding box of all selection rects and create one redaction annotation.
        const minX = Math.min(...validRects.map(r => r.x));
        const minY = Math.min(...validRects.map(r => r.y));
        const maxX = Math.max(...validRects.map(r => r.x + r.width));
        const maxY = Math.max(...validRects.map(r => r.y + r.height));
        const redactionBackendRect: [number, number, number, number] = [minX, minY, maxX, maxY];
        await invoke('add_redaction_annotation', { pageIndex, rect: redactionBackendRect });
      }
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
    } catch { /* silent — task queue surfaces errors */ }
  }, [pdfDoc, pageIndex, activeAnnotationTool, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a rectangle annotation from a drag on the canvas.
  // Called by PageCanvas when the user finishes drawing with the rectangle tool.
  const handleRectDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const color: [number, number, number] = [0.2, 0.4, 0.9];
    // Backend rect format: [x, y, x+width, y+height]
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('add_shape_annotation', { pageIndex, rect: backendRect, shapeType: 'rectangle', color });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a redaction annotation from a rect (used by both text-selection and drag-draw paths).
  // rect is in PDF page coordinates: { x, y, width, height }.
  const handleRedactionDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('add_redaction_annotation', { pageIndex, rect: backendRect });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'redaction_created', authorName, pageIndex, '', 'Redactie aangemaakt'
      )));
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, authorName, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset activeAnnotationTool when switching away from review mode
  // so the tool doesn't persist into unrelated modes.
  useEffect(() => {
    if (mode !== 'review') {
      setActiveAnnotationTool(null);
      setSelectedAnnotationId(null);
    }
  }, [mode]);

  // Delete a selected markup annotation (highlight/underline/strikeout/rectangle).
  const handleDeleteSelectedAnnotation = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        setSelectedAnnotationId(null);
        await refetchComments();
      }
    });
  }, [pdfDoc, engine, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update the color of a selected markup annotation.
  const handleUpdateAnnotationColor = useCallback(async (annotationId: string, color: [number, number, number]) => {
    if (!pdfDoc) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_annotation_color', { annotationId, color });
      await refetchComments();
      markDirty();
    } catch { /* silent */ }
  }, [pdfDoc, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Delete / Backspace → delete the selected markup annotation.
  useEffect(() => {
    function handleDeleteKey(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!selectedAnnotationId) return;
      handleDeleteSelectedAnnotation(selectedAnnotationId);
    }
    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  }, [selectedAnnotationId, handleDeleteSelectedAnnotation]);

  // Permanently apply all pending redaction annotations.
  const handleApplyRedactions = useCallback(async () => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('apply_redactions');
      await refetchComments();
      markDirty();
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'redaction_applied', authorName, -1, '', 'Redacties toegepast'
      )));
    } catch { /* silent */ }
  }, [pdfDoc, authorName, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reorder pages by invoking the Rust reorder_pages command.
  const handleReorderPages = useCallback(async (newOrder: number[]) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reorder_pages', { newOrder });
      markDirty();
    } catch { /* silent */ }
  }, [pdfDoc, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: all redaction annotations across all pages.
  const redactions = useMemo(
    () => allAnnotations.filter(a => a.type === 'redaction').sort((a, b) => a.pageIndex - b.pageIndex),
    [allAnnotations]
  );

  // The selected markup annotation object (for RightContextPanel).
  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) return null;
    return allAnnotations.find(a => a.id === selectedAnnotationId) ?? null;
  }, [selectedAnnotationId, allAnnotations]);

  // Reset to page 0 and populate derived document data when a new document is loaded.
  // For files opened from a known path, the last-viewed page is restored from localStorage.
  useEffect(() => {
    // Restore the saved page for this file path; fall back to 0 for anonymous sources
    let restoredPage = 0;
    if (currentFilePath) {
      try {
        const raw = localStorage.getItem('pdfluent.viewer.pages');
        if (raw) {
          const map = JSON.parse(raw) as Record<string, number>;
          const saved = map[currentFilePath];
          if (typeof saved === 'number' && saved >= 0) {
            restoredPage = pageCount > 0 ? Math.min(saved, pageCount - 1) : saved;
          }
        }
      } catch { /* ignore read errors */ }
    }
    setPageIndex(restoredPage);
    setOutline([]);
    setFormFields([]);
    setAllAnnotations([]);
    setActiveCommentIdx(-1);
    setActiveFieldIdx(-1);
    setSelectedAnnotationId(null);
    setActiveAnnotationTool(null);

    if (!pdfDoc || !engine) return;

    void engine.document.getOutline(pdfDoc).then(result => {
      if (result.success) setOutline(result.value);
    });

    if (isTauri) {
      void import('@tauri-apps/api/core').then(({ invoke }) => {
        void invoke<string[]>('get_page_labels').then(labels => {
          setPageLabels(labels);
        }).catch(() => { /* ignore — labels are optional */ });
      });
    }

    const fieldsResult = engine.form.getAllFormFields(pdfDoc);
    if (fieldsResult.success) setFormFields(fieldsResult.value);

    // Load all annotation types from the PDF file (async).
    // comments useMemo re-derives text-only subset automatically.
    void engine.annotation.loadAnnotations(pdfDoc).then(annotResult => {
      if (annotResult.success) {
        setAllAnnotations(annotResult.value);
      }
    });

    // Detect scanned pages: probe each page's extractable text length.
    // Pages with fewer than SCANNED_PAGE_TEXT_THRESHOLD characters are
    // considered scanned (no native text layer) and added to scannedPageIndices.
    const SCANNED_PAGE_TEXT_THRESHOLD = 12;
    void (async () => {
      const scanned = new Set<number>();
      for (let p = 0; p < pdfDoc.pages.length; p++) {
        const result = await engine.query.extractPageTextSpans(pdfDoc, p);
        const totalChars = result.success
          ? result.value.reduce((acc, span) => acc + span.text.length, 0)
          : 0;
        if (totalChars < SCANNED_PAGE_TEXT_THRESHOLD) {
          scanned.add(p);
        }
      }
      setScannedPageIndices(scanned);
    })();
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch positioned text spans for the current page (enables text selection/copy).
  // Clears immediately on page change, then re-populates once extraction completes.
  // Cancellation guard prevents stale setState if the user flips pages quickly.
  useEffect(() => {
    setTextSpans([]);
    window.getSelection()?.removeAllRanges();
    if (!pdfDoc || !engine) return;
    let cancelled = false;
    void engine.query.extractPageTextSpans(pdfDoc, pageIndex).then(result => {
      if (!cancelled && result.success) setTextSpans(result.value);
    });
    return () => { cancelled = true; };
  }, [pageIndex, pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘C / Ctrl+C copy handler — copies selected text to clipboard
  useEffect(() => {
    function handleCopy(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'c') return;
      const sel = window.getSelection()?.toString();
      if (!sel) return;
      void navigator.clipboard.writeText(sel);
    }
    window.addEventListener('keydown', handleCopy);
    return () => { window.removeEventListener('keydown', handleCopy); };
  }, []);

  // Fullscreen keyboard shortcut — F11 or ⌘Shift+F / Ctrl+Shift+F
  useEffect(() => {
    function handleFullscreenKey(e: KeyboardEvent): void {
      if (pageCount === 0) return;
      const isF11 = e.key === 'F11';
      const isShiftF = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F';
      if (!isF11 && !isShiftF) return;
      e.preventDefault();
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    }
    window.addEventListener('keydown', handleFullscreenKey);
    return () => { window.removeEventListener('keydown', handleFullscreenKey); };
  }, [pageCount]);

  // Export dialog keyboard shortcut — ⌘E / Ctrl+E
  useEffect(() => {
    function handleExportKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'e') return;
      if (pageCount === 0) return;
      e.preventDefault();
      setExportOpen(true);
    }
    window.addEventListener('keydown', handleExportKey);
    return () => { window.removeEventListener('keydown', handleExportKey); };
  }, [pageCount]);

  // Global keyboard shortcut: ⌘K / Ctrl+K → command palette
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(o => !o);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, []);

  // Search shortcut — ⌘F / Ctrl+F → open SearchPanel and focus input
  useEffect(() => {
    function handleSearchKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'f') return;
      e.preventDefault();
      setIsSearchOpen(true);
    }
    window.addEventListener('keydown', handleSearchKey);
    return () => { window.removeEventListener('keydown', handleSearchKey); };
  }, []);

  // Search result navigation — Enter → next result, Shift+Enter → previous result
  useEffect(() => {
    function handleSearchNav(e: KeyboardEvent): void {
      if (!isSearchOpen || searchResults.length === 0) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) {
        prevSearchResult();
      } else {
        nextSearchResult();
      }
    }
    window.addEventListener('keydown', handleSearchNav);
    return () => { window.removeEventListener('keydown', handleSearchNav); };
  }, [isSearchOpen, searchResults, nextSearchResult, prevSearchResult]);

  // Enter key on selected text target — triggers inline edit entry
  useEffect(() => {
    function handleTextEditKey(e: KeyboardEvent): void {
      // Only when a text target is selected and not already editing
      if (!selectedTextTarget || editingTextTargetId !== null) return;
      // Guard: ignore if focus is inside an input / editable area
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      handleEditEntry(selectedTextTarget);
    }
    window.addEventListener('keydown', handleTextEditKey);
    return () => { window.removeEventListener('keydown', handleTextEditKey); };
  }, [selectedTextTarget, editingTextTargetId, handleEditEntry]);

  // Shortcut sheet — ⌘? / Ctrl+?
  useEffect(() => {
    function handleShortcutSheetKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== '?') return;
      e.preventDefault();
      setShortcutSheetOpen(o => !o);
    }
    window.addEventListener('keydown', handleShortcutSheetKey);
    return () => { window.removeEventListener('keydown', handleShortcutSheetKey); };
  }, []);

  // Page navigation keyboard shortcuts — Arrow / PageUp / PageDown / Home / End
  useEffect(() => {
    function handlePageNav(e: KeyboardEvent) {
      if (pageCount === 0) return;
      // Guard: block navigation while a save is in progress
      if (isSavingRef.current) return;

      // Do not steal keys when focus is inside a text input, textarea, or select
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          setPageIndex(i => Math.min(pageCount - 1, i + 1));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          setPageIndex(i => Math.max(0, i - 1));
          break;
        case 'Home':
          e.preventDefault();
          setPageIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setPageIndex(pageCount - 1);
          break;
      }
    }
    window.addEventListener('keydown', handlePageNav);
    return () => { window.removeEventListener('keydown', handlePageNav); };
  }, [pageCount]);

  // Alt+ArrowDown / Alt+ArrowUp — jump between comments
  useEffect(() => {
    function handleCommentJumpKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextComment();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevComment();
      }
    }
    window.addEventListener('keydown', handleCommentJumpKey);
    return () => { window.removeEventListener('keydown', handleCommentJumpKey); };
  }, [handleNextComment, handlePrevComment]);

  // Mode switching keyboard shortcuts — 1–7 map to viewer modes
  useEffect(() => {
    const MODE_KEYS: Record<string, ViewerMode> = {
      '1': 'read',
      '2': 'review',
      '3': 'edit',
      '4': 'organize',
      '5': 'forms',
      '6': 'protect',
      '7': 'convert',
    };

    function handleModeKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mode = MODE_KEYS[e.key];
      if (mode) setMode(mode);
    }

    window.addEventListener('keydown', handleModeKey);
    return () => { window.removeEventListener('keydown', handleModeKey); };
  }, []);

  // Zoom keyboard shortcuts — ⌘=/⌘+ zoom in, ⌘- zoom out, ⌘0 reset to 100%
  useEffect(() => {
    function handleZoomKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (pageCount === 0) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
      }
    }
    window.addEventListener('keydown', handleZoomKey);
    return () => { window.removeEventListener('keydown', handleZoomKey); };
  }, [pageCount]);

  // Save As keyboard shortcut — ⌘⇧S / Ctrl+Shift+S
  useEffect(() => {
    function handleSaveAsKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key !== 'S') return;
      if (pageCount === 0) return;
      e.preventDefault();
      void handleSaveAs();
    }
    window.addEventListener('keydown', handleSaveAsKey);
    return () => { window.removeEventListener('keydown', handleSaveAsKey); };
  }, [pageCount, handleSaveAs]);

  // Print keyboard shortcut — ⌘P / Ctrl+P
  useEffect(() => {
    function handlePrintKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'p') return;
      if (pageCount === 0) return;
      e.preventDefault();
      window.print();
    }
    window.addEventListener('keydown', handlePrintKey);
    return () => { window.removeEventListener('keydown', handlePrintKey); };
  }, [pageCount]);

  // Left rail toggle — ⌘B / Ctrl+B shows/hides the left navigation rail
  useEffect(() => {
    function handleRailKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'b') return;
      e.preventDefault();
      setLeftRailOpen(o => !o);
    }
    window.addEventListener('keydown', handleRailKey);
    return () => { window.removeEventListener('keydown', handleRailKey); };
  }, []);

  // Go-to-page keyboard shortcut — ⌘G / Ctrl+G opens the go-to-page dialog
  const pageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleGoToPage(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'g') return;
      if (pageCount === 0) return;
      e.preventDefault();
      setGoToPageOpen(true);
    }
    window.addEventListener('keydown', handleGoToPage);
    return () => { window.removeEventListener('keydown', handleGoToPage); };
  }, [pageCount]);

  // Tab / Shift+Tab field navigation — advances through form fields in forms mode.
  // Overrides default Tab focus management only when mode === 'forms' and fields exist.
  useEffect(() => {
    function handleFieldTabKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;
      if (mode !== 'forms' || formFields.length === 0) return;
      e.preventDefault();
      if (e.shiftKey) {
        handleFieldNav(Math.max(0, activeFieldIdx - 1));
      } else {
        handleFieldNav(activeFieldIdx < 0 ? 0 : Math.min(formFields.length - 1, activeFieldIdx + 1));
      }
    }
    window.addEventListener('keydown', handleFieldTabKey);
    return () => { window.removeEventListener('keydown', handleFieldTabKey); };
  }, [mode, formFields, activeFieldIdx, handleFieldNav]);

  // Scroll-to-zoom — ⌘/Ctrl + wheel adjusts zoom on the document canvas
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    function handleWheel(e: WheelEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => parseFloat(Math.min(4, Math.max(0.25, z + step)).toFixed(2)));
    }
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => { container.removeEventListener('wheel', handleWheel); };
  }, []);

  // ---------------------------------------------------------------------------
  // Drag-and-drop to open PDF
  // ---------------------------------------------------------------------------

  // Browser mode: detect drag entry and load the dropped file
  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (isTauri) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    if (isTauri) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file?.name.toLowerCase().endsWith('.pdf')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result;
      if (buf instanceof ArrayBuffer) void handleLoadDocument(buf);
    };
    reader.readAsArrayBuffer(file);
  }

  // Tauri mode: native OS drag-drop listener (no browser DragEvent fires for native drops)
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === 'over') {
          setIsDragging(true);
        } else if (payload.type === 'leave') {
          setIsDragging(false);
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const pathList = Array.isArray(payload.paths) ? payload.paths : [];
          const pdf = pathList.find(p => p.toLowerCase().endsWith('.pdf'));
          if (pdf) void handleLoadDocument(pdf);
        }
      });
    })();
    return () => { unlisten?.(); };
  }, [handleLoadDocument]);

  const fileName = metadata?.title?.trim() || pdfDoc?.fileName || null;

  // ---------------------------------------------------------------------------
  // Document title — browser tab and Tauri window title
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const title = fileName
      ? `${isDirty ? '* ' : ''}${fileName} — PDFluent`
      : 'PDFluent';

    document.title = title;

    if (!isTauri) return;
    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      void getCurrentWebviewWindow().setTitle(title);
    })();
  }, [fileName, isDirty]);

  // Keep a ref so the window helper always calls the latest handleLoadDocument
  const loadDocumentRef = useRef(handleLoadDocument);
  useEffect(() => { loadDocumentRef.current = handleLoadDocument; }, [handleLoadDocument]);

  // Dev-only: expose test helper so Playwright can drive the engine directly
  useEffect(() => {
    if (!import.meta.env.DEV || !engine) return;
    window.__pdfluent_test__ = {
      loadDocument: (source) => loadDocumentRef.current(source),
    };
    return () => { delete window.__pdfluent_test__; };
  }, [engine]);

  // Dev-only: keep interactionDebug snapshot on __pdfluent_test__ current.
  // Written as a separate effect so it tracks live interaction state independently of engine init.
  useEffect(() => {
    if (!import.meta.env.DEV || !window.__pdfluent_test__) return;
    window.__pdfluent_test__.interactionDebug = {
      hoveredTarget,
      annotationInteractionState,
      canvasCursorCss: canvasCursorCss as string | undefined,
      selectedTextTargetId,
      editingTextTargetId,
    };
  }, [hoveredTarget, annotationInteractionState, canvasCursorCss, selectedTextTargetId, editingTextTargetId]);

  // File input ref used by WelcomeScreen in browser mode to trigger file open dialog
  const welcomeFileInputRef = useRef<HTMLInputElement | null>(null);

  // Opens a PDF via OS dialog (Tauri) or hidden file input (browser)
  const handleOpenFile = useCallback(async () => {
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (typeof path === 'string') await handleLoadDocument(path);
    } else {
      welcomeFileInputRef.current?.click();
    }
  }, [handleLoadDocument]);

  const handleOpenAllTools = useCallback(() => {
    setAllToolsOpen(o => !o);
  }, []);

  // Called by ModeToolbar / OrganizeGrid after a successful page mutation (delete/rotate/assembly).
  // Updates the page count from the backend response, clamps the current page,
  // increments documentVersion to force PageCanvas to remount and re-render,
  // and marks the document dirty (all page mutations modify the document).
  // Optional navigateTo: if provided, navigates to that page index after the mutation
  // (used to land on the first inserted page after append/insert operations).
  const handlePageMutation = useCallback((newPageCount: number, navigateTo?: number) => {
    updatePageCount(newPageCount);
    if (navigateTo !== undefined) {
      setPageIndex(Math.min(Math.max(0, navigateTo), Math.max(0, newPageCount - 1)));
    } else {
      setPageIndex(prev => Math.min(prev, Math.max(0, newPageCount - 1)));
    }
    setDocumentVersion(v => v + 1);
    markDirty();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'page_mutated', authorName, navigateTo ?? -1, '', 'Pagina gewijzigd'
    )));
  }, [updatePageCount, authorName, markDirty]);

  const showRightPanel = MODES_WITH_RIGHT_PANEL.has(mode);

  // All annotation rects on the current page — rendered as clickable markers on the canvas.
  // Includes all annotation types (highlight, underline, strikeout, rectangle, text, etc.).
  const pageAnnotationMarks = useMemo(() =>
    allAnnotations
      .filter(a => a.pageIndex === pageIndex && a.rect)
      .map(a => ({ id: a.id, rect: a.rect!, color: a.color, type: a.type })),
    [allAnnotations, pageIndex]
  );

  // Search result rects for the current page — passed to AnnotationOverlay as yellow highlights.
  // Also compute the local index of the active result within the current-page results.
  const { pageSearchHighlights, activeSearchHighlightIdx } = useMemo(() => {
    const pageResults = searchResults.filter(r => r.pageIndex === pageIndex);
    const activeResult = searchResults[activeSearchResultIdx];
    const localIdx = activeResult?.pageIndex === pageIndex
      ? pageResults.findIndex(r => r.spanIndex === activeResult.spanIndex)
      : -1;
    return { pageSearchHighlights: pageResults.map(r => r.rect), activeSearchHighlightIdx: localIdx };
  }, [searchResults, pageIndex, activeSearchResultIdx]);

  // Click an annotation marker on the canvas → select it.
  // For text annotations: switches to review mode and activates in the comment sidebar.
  // For markup annotations: sets selectedAnnotationId and switches to review mode.
  const handleAnnotationClick = useCallback((annotationId: string) => {
    const ann = allAnnotations.find(a => a.id === annotationId);
    if (!ann) return;
    if (ann.type === 'text') {
      const idx = comments.findIndex(c => c.id === annotationId);
      if (idx >= 0) setActiveCommentIdx(idx);
    } else {
      setSelectedAnnotationId(prev => prev === annotationId ? null : annotationId);
    }
    if (mode !== 'review') setMode('review');
  }, [allAnnotations, comments, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute highlight rects for the active comment (if on current page and has rect)
  const activeHighlights = useMemo(() => {
    if (activeCommentIdx < 0 || activeCommentIdx >= comments.length) return [];
    const c = comments[activeCommentIdx];
    if (!c || c.pageIndex !== pageIndex) return [];
    if (!c.rect) return [];
    return [c.rect];
  }, [activeCommentIdx, comments, pageIndex]);

  // Command palette actions — viewer-only, no engine calls
  const commands: Command[] = [
    // ── Page navigation ───────────────────────────────────────────────────
    { id: 'prev-page', label: 'Vorige pagina', keywords: ['pagina', 'vorige', 'terug'],
      action: () => { setPageIndex(i => Math.max(0, i - 1)); } },
    { id: 'next-page', label: 'Volgende pagina', keywords: ['pagina', 'volgende'],
      action: () => { setPageIndex(i => Math.min(pageCount - 1, i + 1)); } },
    { id: 'first-page', label: 'Eerste pagina', keywords: ['eerste', 'begin', 'pagina', 'home'],
      action: () => { setPageIndex(0); } },
    { id: 'last-page', label: 'Laatste pagina', keywords: ['laatste', 'einde', 'pagina', 'end'],
      action: () => { setPageIndex(pageCount - 1); } },
    // ── Zoom ──────────────────────────────────────────────────────────────
    { id: 'zoom-in', label: 'Inzoomen', keywords: ['zoom', 'groter', 'in'],
      action: () => { setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2)))); } },
    { id: 'zoom-out', label: 'Uitzoomen', keywords: ['zoom', 'kleiner', 'uit'],
      action: () => { setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))); } },
    { id: 'zoom-100', label: 'Zoom 100%', keywords: ['zoom', 'origineel', 'normaal', '100'],
      action: () => { setZoom(1.0); } },
    { id: 'zoom-200', label: 'Zoom 200%', keywords: ['zoom', '200'],
      action: () => { setZoom(2.0); } },
    // ── Document actions ──────────────────────────────────────────────────
    { id: 'save-as', label: 'Opslaan als…', keywords: ['opslaan', 'als', 'save', 'nieuw', 'bestand', 'kopie'],
      action: () => { void handleSaveAs(); } },
    { id: 'export', label: 'Exporteren', keywords: ['export', 'opslaan als', 'download', 'pdf', 'png', 'docx'],
      action: () => { setExportOpen(true); } },
    { id: 'toggle-rail', label: 'Paneel in-/uitklappen', keywords: ['paneel', 'zijbalk', 'verbergen', 'tonen', 'rail'],
      action: () => { setLeftRailOpen(o => !o); } },
    { id: 'fullscreen', label: 'Volledig scherm aan/uit', keywords: ['volledig', 'scherm', 'fullscreen', 'f11'],
      action: () => {
        if (pageCount === 0) return;
        if (document.fullscreenElement) { void document.exitFullscreen(); }
        else { void document.documentElement.requestFullscreen(); }
      } },
    { id: 'shortcut-sheet', label: 'Sneltoetsen', keywords: ['sneltoetsen', 'shortcuts', 'help', '?'],
      action: () => { setShortcutSheetOpen(true); } },
    { id: 'print', label: 'Afdrukken', keywords: ['afdrukken', 'print', 'p'],
      action: () => { if (pageCount > 0) window.print(); } },
    { id: 'close-document', label: 'Document sluiten', keywords: ['sluiten', 'sluit', 'close', 'document'],
      action: () => {
        if (isDirty) {
          pendingActionRef.current = () => { closeDocument(); setCurrentFilePath(null); };
          setUnsavedDialogOpen(true);
          return;
        }
        closeDocument();
        setCurrentFilePath(null);
      } },
    // ── Viewer modes ──────────────────────────────────────────────────────
    { id: 'mode-read', label: 'Modus: Lezen', keywords: ['lezen', 'modus', 'read'],
      action: () => { setMode('read'); } },
    { id: 'mode-review', label: 'Modus: Beoordelen', keywords: ['beoordelen', 'annotaties', 'review'],
      action: () => { setMode('review'); } },
    { id: 'mode-edit', label: 'Modus: Bewerken', keywords: ['bewerken', 'edit'],
      action: () => { setMode('edit'); } },
    { id: 'mode-organize', label: 'Modus: Indelen', keywords: ['indelen', 'organiseren', 'organize'],
      action: () => { setMode('organize'); } },
    { id: 'mode-forms', label: 'Modus: Formulieren', keywords: ['formulieren', 'forms', 'invullen'],
      action: () => { setMode('forms'); } },
    { id: 'mode-protect', label: 'Modus: Beveiligen', keywords: ['beveiligen', 'protect', 'versleutelen'],
      action: () => { setMode('protect'); } },
    { id: 'mode-convert', label: 'Modus: Converteren', keywords: ['converteren', 'omzetten', 'convert'],
      action: () => { setMode('convert'); } },
    // ── Recent files ──────────────────────────────────────────────────────
    ...recentFiles.map((path, i) => {
      const name = path.split(/[/\\]/).pop() ?? path;
      return {
        id: `recent-${i}`,
        label: `Open: ${name}`,
        keywords: ['recent', 'open', name.toLowerCase()],
        action: () => { void handleLoadDocument(path); },
      };
    }),
  ];

  // ── Loading / error states ────────────────────────────────────────────────

  if (engineLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm gap-2">
        <Loader2Icon className="w-4 h-4 animate-spin" />
        Initializing engine…
      </div>
    );
  }

  if (engineError || !engine) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-destructive text-sm px-8 text-center">
        Engine error: {engineError ?? 'No runtime adapter available'}
      </div>
    );
  }

  // ── Full design shell ─────────────────────────────────────────────────────

  return (
    <TaskQueueProvider>
    <div
      className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Drag-and-drop overlay ──────────────────────────────────────────── */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 border-4 border-dashed border-primary"
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={() => { setIsDragging(false); }}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-3 pointer-events-none select-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-sm font-semibold text-primary">Drop PDF hier</p>
          </div>
        </div>
      )}

      {/* ── TopBar (h-12) ──────────────────────────────────────────────────── */}
      <TopBar
        fileName={fileName}
        pageIndex={pageIndex}
        pageCount={pageCount}
        isDirty={isDirty}
        onOpenFile={handleLoadDocument}
        currentFilePath={currentFilePath}
        onSaveComplete={clearDirty}
        onCloseDocument={() => {
          if (isDirty) {
            pendingActionRef.current = () => { closeDocument(); setCurrentFilePath(null); };
            setUnsavedDialogOpen(true);
            return;
          }
          closeDocument();
          setCurrentFilePath(null);
        }}
        pageInputRef={pageInputRef}
        onPrevPage={() => { setPageIndex(i => Math.max(0, i - 1)); }}
        onNextPage={() => { setPageIndex(i => Math.min(pageCount - 1, i + 1)); }}
        onPageInput={setPageIndex}
        onOpenCommandPalette={() => { setCommandPaletteOpen(true); }}
        onOpenExport={() => { setExportOpen(true); }}
        onSaveAs={handleSaveAs}
      />

      {/* ── ModeSwitcher ───────────────────────────────────────────────────── */}
      <ModeSwitcher
        mode={mode}
        onChange={(m) => { setMode(m); setAllToolsOpen(false); }}
        onOpenAllTools={handleOpenAllTools}
      />

      {/* ── ModeToolbar ────────────────────────────────────────────────────── */}
      <ModeToolbar
        mode={mode}
        pageIndex={pageIndex}
        pageCount={pageCount}
        zoom={zoom}
        onZoomIn={() => { setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2)))); }}
        onZoomOut={() => { setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))); }}
        onOpenSearch={() => { setIsSearchOpen(true); }}
        onPageMutation={handlePageMutation}
        comments={comments}
        activeCommentIdx={activeCommentIdx}
        onCommentNav={handleCommentNav}
        onAddComment={handleAddComment}
        activeAnnotationTool={activeAnnotationTool}
        onAnnotationToolChange={setActiveAnnotationTool}
        formFields={formFields}
        activeFieldIdx={activeFieldIdx}
        onFieldNav={handleFieldNav}
      />

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left navigation rail + panels ──────────────────────────────── */}
        {leftRailOpen && (
          <LeftNavRail
            thumbnails={thumbnails}
            pageCount={pageCount}
            currentPage={pageIndex}
            onPageSelect={setPageIndex}
            onNextPage={() => { setPageIndex(i => Math.min(pageCount - 1, i + 1)); }}
            onPrevPage={() => { setPageIndex(i => Math.max(0, i - 1)); }}
            outline={outline}
            formFields={formFields}
            comments={comments}
            onReorderPages={handleReorderPages}
            pageLabels={pageLabels}
          />
        )}

        {/* ── Search panel ────────────────────────────────────────────────── */}
        {isSearchOpen && (
          <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="search-panel-container">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-foreground">Zoeken</span>
              <button
                data-testid="search-panel-close-btn"
                onClick={() => { setIsSearchOpen(false); clearSearch(); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Zoekpaneel sluiten"
              >
                ✕
              </button>
            </div>
            <SearchPanel
              query={searchQuery}
              onQueryChange={(q) => {
                setSearchQuery(q);
                void runSearch(q);
              }}
              results={searchResults}
              activeIdx={activeSearchResultIdx}
              onResultClick={(idx) => {
                setActiveSearchResultIdx(idx);
                if (searchResults[idx] !== undefined) {
                  setPageIndex(searchResults[idx].pageIndex);
                }
              }}
              autoFocus
            />
          </div>
        )}

        {/* ── Timeline panel ──────────────────────────────────────────────── */}
        {showTimeline && (
          <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="timeline-panel-container">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-foreground">Activiteiten</span>
              <button
                data-testid="timeline-panel-close-btn"
                onClick={() => { setShowTimeline(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Tijdlijn sluiten"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TimelinePanel
                events={documentEventLog}
                onNavigate={(pageIndex) => { setPageIndex(pageIndex); }}
              />
            </div>
          </div>
        )}

        {/* ── Issue panel ─────────────────────────────────────────────────── */}
        {showIssuePanel && (
          <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="issue-panel-container">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-foreground">Problemen</span>
              <button
                data-testid="issue-panel-close-btn"
                onClick={() => { setShowIssuePanel(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Probleemlijst sluiten"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <IssuePanel
                issues={documentIssues}
                onNavigate={(pageIndex) => { setPageIndex(pageIndex); }}
              />
            </div>
          </div>
        )}

        {/* ── Document canvas ────────────────────────────────────────────── */}
        <div ref={canvasContainerRef} data-print-region className="flex-1 relative overflow-auto bg-muted/30">

          {/* Document loading */}
          {docLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Loading document…
            </div>
          )}

          {/* Document error */}
          {docError && !docLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm px-8 text-center">
              {docError}
            </div>
          )}

          {/* Welcome screen — shown when no document is loaded */}
          {!pdfDoc && !docLoading && !docError && (
            <div
              data-testid="viewer-empty-state"
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              {/* Hidden file input for browser-mode open from WelcomeScreen */}
              <input
                ref={welcomeFileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const buf = ev.target?.result;
                    if (buf instanceof ArrayBuffer) void handleLoadDocument(buf);
                  };
                  reader.readAsArrayBuffer(file);
                }}
              />
              <WelcomeScreen
                onOpen={() => { void handleOpenFile(); }}
                onOpenRecent={(path) => { void handleLoadDocument(path); }}
                onRemoveRecent={removeRecentFile}
                onClearRecent={clearRecentFiles}
                recentFiles={recentFiles}
              />
              {/* Recent files list — also accessible from the command palette */}
              {recentFiles.length > 0 && (
                <div
                  className="hidden"
                  data-testid="recent-files-list"
                >
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center mb-1">
                    Recent geopend
                  </p>
                  {recentFiles.map(path => {
                    const name = path.split(/[/\\]/).pop() ?? path;
                    return (
                      <button
                        key={path}
                        onClick={() => { void handleLoadDocument(path); }}
                        title={path}
                        className="text-left text-sm text-foreground hover:text-primary hover:bg-muted/50 px-3 py-1.5 rounded-md transition-colors truncate"
                        data-testid="recent-file-entry"
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Organize mode: page thumbnail grid with delete/rotate/assembly actions */}
          {pdfDoc && !docLoading && mode === 'organize' && (
            <OrganizeGrid
              thumbnails={thumbnails}
              pageCount={pageCount}
              onPageMutation={handlePageMutation}
              onMarkDirty={markDirty}
            />
          )}

          {/* Read/other modes: single-page canvas */}
          {pdfDoc && !docLoading && mode !== 'organize' && (
            <div className="flex justify-center items-start p-8 min-h-full">
              {/* data-interaction exposes annotation selection state for Playwright and CSS targeting */}
              <div className="w-full max-w-3xl" {...stateDataAttr(annotationInteractionState)}>
                <PageCanvas
                  key={documentVersion}
                  engine={engine}
                  document={pdfDoc}
                  pageIndex={pageIndex}
                  zoom={zoom}
                  textSpans={textSpans}
                  pageWidthPt={pdfDoc.pages[pageIndex]?.size.width ?? 595}
                  pageHeightPt={pdfDoc.pages[pageIndex]?.size.height ?? 842}
                  highlights={activeHighlights}
                  clickableAnnotations={pageAnnotationMarks}
                  onAnnotationClick={handleAnnotationClick}
                  searchHighlights={pageSearchHighlights}
                  activeSearchHighlightIdx={activeSearchHighlightIdx}
                  selectedAnnotationId={selectedAnnotationId}
                  activeAnnotationTool={activeAnnotationTool}
                  onTextSelection={handleTextSelection}
                  onRectDraw={handleRectDraw}
                  onRedactionDraw={handleRedactionDraw}
                  textStructure={pageTextStructure}
                  textInteractionActive={textInteractionActive}
                  selectedTextTarget={selectedTextTarget}
                  onTextTargetSelect={handleTextTargetSelect}
                  onTextTargetDoubleClick={handleEditEntry}
                />
                {/* Text context bar — floats above selected paragraph */}
                {shouldShowContextBar(mode, selectedTextTarget) && selectedTextTarget && !editingTextTargetId && (
                  <TextContextBar
                    target={selectedTextTarget}
                    mode={mode}
                    pageHeightPt={pdfDoc.pages[pageIndex]?.size.height ?? 842}
                    zoom={zoom}
                    onAction={handleTextContextAction}
                    editability={getEditability(selectedTextTarget, mode, activeAnnotationTool)}
                  />
                )}
                {/* Inline draft editor — shown when editing is active */}
                {editingTextTargetId && selectedTextTarget?.id === editingTextTargetId && (
                  <TextInlineEditor
                    target={selectedTextTarget}
                    draft={textDraft}
                    onDraftChange={setTextDraft}
                    onCommit={handleDraftCommit}
                    onCancel={handleDraftCancel}
                    pageHeightPt={pdfDoc.pages[pageIndex]?.size.height ?? 842}
                    zoom={zoom}
                  />
                )}
                {/* Form field overlay — interactive inputs over PDF page in forms mode */}
                {mode === 'forms' && formFields.length > 0 && (
                  <FormFieldOverlay
                    fields={formFields.filter(f => f.pageIndex === pageIndex)}
                    pageHeightPt={pdfDoc.pages[pageIndex]?.size.height ?? 842}
                    zoom={zoom}
                    onSetFieldValue={handleSetFieldValue}
                    activeFieldIdx={activeFieldIdx}
                    onFieldSelect={handleFieldNav}
                  />
                )}
              </div>
            </div>
          )}

          {/* Floating zoom controls — bottom-right (not shown in organize mode) */}
          {pdfDoc && !docLoading && mode !== 'organize' && (
            <div className="fixed bottom-10 right-6 flex items-center bg-background border border-border rounded-lg shadow-sm p-1 z-30">
              <button
                onClick={() => { setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))); }}
                disabled={zoom <= 0.25}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none"
                title="Zoom out"
              >
                −
              </button>
              <button
                onClick={() => { setZoomPresetsOpen(o => !o); }}
                className="text-xs font-medium px-3 text-foreground w-14 text-center tabular-nums hover:text-primary transition-colors"
                title="Zoomniveau kiezen"
                aria-label="Zoomniveau kiezen"
                data-testid="zoom-reset-btn"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => { setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2)))); }}
                disabled={zoom >= 4}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none"
                title="Zoom in"
              >
                +
              </button>
              <button
                data-testid="zoom-fit-width-btn"
                onClick={() => { setZoom(1.0); }}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                title="Paginabreedte aanpassen"
                aria-label="Paginabreedte aanpassen"
              >
                <MaximizeIcon className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-4 bg-border mx-1" aria-hidden="true" />
              <button
                onClick={() => { setGoToPageOpen(true); }}
                className="text-xs font-medium px-2 text-foreground tabular-nums hover:text-primary transition-colors"
                title="Ga naar pagina"
                aria-label="Ga naar pagina"
                data-testid="floating-page-indicator"
              >
                {pageIndex + 1} / {pageCount}
              </button>
            </div>
          )}
        </div>

        {/* ── Right context panel ─────────────────────────────────────────── */}
        {showRightPanel && (
          <RightContextPanel mode={mode} pdfDoc={pdfDoc ?? null} pageCount={pageCount} formFields={formFields} comments={comments} activeCommentIdx={activeCommentIdx} onCommentSelect={handleCommentNav} onDeleteComment={handleDeleteComment} onUpdateComment={handleUpdateComment} onToggleResolved={handleToggleResolvedStatus} onAddReply={handleAddReply} onDeleteReply={handleDeleteReply} onNextComment={handleNextComment} onPrevComment={handlePrevComment} onResolveAll={handleResolveAll} onDeleteAllResolved={handleDeleteAllResolved} scannedPageIndices={scannedPageIndices} onRunOcr={(opts) => { void handleRunOcr(opts); }} ocrRunning={ocrRunning} activeFieldIdx={activeFieldIdx} onFieldSelect={handleFieldNav} onSetFieldValue={handleSetFieldValue} formValidationErrors={formValidationErrors} onFormSubmit={handleFormSubmit} authorName={authorName} onAuthorChange={handleAuthorChange} onMetadataChange={handleMetadataChange} selectedAnnotation={selectedAnnotation} onDeleteSelectedAnnotation={handleDeleteSelectedAnnotation} onUpdateAnnotationColor={handleUpdateAnnotationColor} redactions={redactions} onApplyRedactions={handleApplyRedactions} onDeleteRedaction={handleDeleteSelectedAnnotation} onJumpToRedaction={setPageIndex} />
        )}
      </div>

      {/* ── Export dialog ──────────────────────────────────────────────────── */}
      <ExportDialog
        isOpen={exportOpen}
        onClose={() => { setExportOpen(false); }}
        pageIndex={pageIndex}
        pageCount={pageCount}
      />

      {/* ── Bottom task bar ────────────────────────────────────────────────── */}
      <BottomTaskBar />

      {/* ── All tools overlay ──────────────────────────────────────────────── */}
      <AllToolsPanel
        isOpen={allToolsOpen}
        onClose={() => { setAllToolsOpen(false); }}
        onModeSelect={setMode}
      />

      {/* ── Command palette overlay ────────────────────────────────────────── */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => { setCommandPaletteOpen(false); }}
        commands={commands}
        recentIds={recentCmdIds}
        onRun={handleCommandRun}
      />

      {/* ── Keyboard shortcut sheet ────────────────────────────────────────── */}
      <ShortcutSheet
        isOpen={shortcutSheetOpen}
        onClose={() => { setShortcutSheetOpen(false); }}
      />

      {/* ── Go-to-page dialog ──────────────────────────────────────────────── */}
      <GoToPageDialog
        isOpen={goToPageOpen}
        pageCount={pageCount}
        onNavigate={(idx) => { setPageIndex(idx); }}
        onClose={() => { setGoToPageOpen(false); }}
      />

      {/* ── Zoom presets popover ────────────────────────────────────────────── */}
      <ZoomPresetsPopover
        isOpen={zoomPresetsOpen}
        onClose={() => { setZoomPresetsOpen(false); }}
        onZoomChange={(z) => { setZoom(z); }}
      />

      {/* ── Unsaved changes dialog ──────────────────────────────────────────── */}
      <UnsavedChangesDialog
        isOpen={unsavedDialogOpen}
        canSave={currentFilePath !== null}
        onSave={() => { void handleUnsavedSave(); }}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />
    </div>
    </TaskQueueProvider>
  );
}
