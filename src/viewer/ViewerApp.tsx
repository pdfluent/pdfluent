// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2Icon, MaximizeIcon } from 'lucide-react';
import type { OutlineNode, TextSpan } from '../core/document';
import { makeDocumentEvent, appendEvent } from './state/documentEvents';
import type { DocumentEvent } from './state/documentEvents';
import type { AppError } from './state/errorCenter';
import { ViewerSidePanels } from './ViewerSidePanels';
import { WelcomeSection } from './WelcomeSection';

import type { ViewerMode } from './types';
import { useEngine } from './hooks/useEngine';
import { useDocument } from './hooks/useDocument';
import { useThumbnails } from './hooks/useThumbnails';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useModeManager } from './hooks/useModeManager';
import { useZoomControls } from './hooks/useZoomControls';
import { usePageNavigation } from './hooks/usePageNavigation';
import { useSidebarState } from './hooks/useSidebarState';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useSearch } from './hooks/useSearch';
import { useFormFields } from './hooks/useFormFields';
import { useTextInteraction } from './hooks/useTextInteraction';
import { useAnnotations } from './hooks/useAnnotations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDocumentLifecycle } from './hooks/useDocumentLifecycle';
import { useCommands } from './hooks/useCommands';
import { useDragDrop } from './hooks/useDragDrop';
import { TopBar } from './components/TopBar';
import { ModeSwitcher } from './components/ModeSwitcher';
import { ModeToolbar } from './components/ModeToolbar';
import { LeftNavRail } from './components/LeftNavRail';
import { PageCanvas } from './components/PageCanvas';
import { RightContextPanel } from './components/RightContextPanel';
import { BottomTaskBar } from './components/BottomTaskBar';
import { CommandPalette } from './components/CommandPalette';
import { AllToolsPanel } from './components/AllToolsPanel';
import { ExportDialog } from './components/ExportDialog';
import { OrganizeGrid } from './components/OrganizeGrid';
import { ShortcutSheet } from './components/ShortcutSheet';
import { GoToPageDialog } from './components/GoToPageDialog';
import { ZoomPresetsPopover } from './components/ZoomPresetsPopover';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog';
import { TaskQueueProvider } from './context/TaskQueueContext';
import { useHoverController } from './interaction/hoverController';
import { getInteractionState, stateDataAttr } from './interaction/interactionState';
import { getCursorForTool, toCssCursor } from './interaction/cursorController';
import { TextContextBar, shouldShowContextBar } from './components/TextContextBar';
import { TextInlineEditor } from './components/TextInlineEditor';
import { FormFieldOverlay } from './components/FormFieldOverlay';
import { getEditability } from './text/textEditability';

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

export type { SearchResult } from './hooks/useSearch';

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
  const { mode, setMode } = useModeManager();
  const { zoom, setZoom, zoomPresetsOpen, setZoomPresetsOpen } = useZoomControls();
  const { canUndo, canRedo, pushUndo, undoStackRef, syncUndoState } = useUndoRedo();
  const {
    commandPaletteOpen, setCommandPaletteOpen,
    allToolsOpen, setAllToolsOpen,
    exportOpen, setExportOpen,
    shortcutSheetOpen, setShortcutSheetOpen,
    goToPageOpen, setGoToPageOpen,
    unsavedDialogOpen, setUnsavedDialogOpen,
    showTimeline, setShowTimeline,
    showIssuePanel, setShowIssuePanel,
    leftRailOpen, setLeftRailOpen,
    recentCmdIds,
    handleCommandRun,
  } = useSidebarState();

  const [documentVersion, setDocumentVersion] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const { pageIndex, setPageIndex } = usePageNavigation(pageCount, currentFilePath);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [pageLabels, setPageLabels] = useState<string[]>([]);
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  // Reviewer name — persisted to localStorage so it survives page reloads
  const [authorName, setAuthorName] = useState(() => {
    try { return localStorage.getItem('pdfluent.user.author') ?? ''; } catch { return ''; }
  });
  const handleAuthorChange = useCallback((name: string) => {
    setAuthorName(name);
    try { localStorage.setItem('pdfluent.user.author', name); } catch { /* ignore */ }
  }, []);
  // Document event log — in-memory audit trail for this editing session
  const [documentEventLog, setDocumentEventLog] = useState<DocumentEvent[]>([]);
  // App-level error registry — surfaced by Phase 4+ notification UI
  const [_appErrors, setAppErrors] = useState<AppError[]>([]);

  // Centralised hover tracking across all interactive surfaces.
  const {
    hoveredTarget,
    onEnter: _onHoverEnter,
    onLeave: _onHoverLeave,
    clearHover: _clearHover,
  } = useHoverController();

  // Derived filename — passed to useDocumentLifecycle for tab/window title.
  const fileName = metadata?.title?.trim() || pdfDoc?.fileName || null;

  // ---------------------------------------------------------------------------
  // Document lifecycle: save-as, open/close guards, unsaved-changes dialog
  // ---------------------------------------------------------------------------

  const {
    pendingActionRef,
    isSavingRef,
    docLoadingRef,
    handleSaveAs,
    handleLoadDocument,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  } = useDocumentLifecycle(
    isDirty, loadDocument, clearDirty, addRecentFile,
    pdfDoc, pageCount, currentFilePath, setCurrentFilePath, setUnsavedDialogOpen,
    docLoading,
  );

  // ---------------------------------------------------------------------------
  // Domain hooks
  // ---------------------------------------------------------------------------

  const {
    formFields, setFormFields,
    activeFieldIdx, setActiveFieldIdx,
    formValidationErrors,
    handleSetFieldValue,
    handleFormSubmit,
    handleFieldNav,
  } = useFormFields(pdfDoc, engine, authorName, currentFilePath, markDirty, clearDirty, handleSaveAs, pushUndo, setDocumentEventLog, setPageIndex);

  const {
    isSearchOpen, setIsSearchOpen,
    searchQuery, setSearchQuery,
    searchResults,
    activeSearchResultIdx, setActiveSearchResultIdx,
    clearSearch,
    runSearch,
    nextSearchResult,
    prevSearchResult,
    pageSearchHighlights,
    activeSearchHighlightIdx,
  } = useSearch(pdfDoc, engine, pageCount, pageIndex, setPageIndex);

  const {
    comments,
    activeCommentIdx,
    scannedPageIndices,
    ocrRunning,
    activeAnnotationTool,
    setActiveAnnotationTool,
    selectedAnnotationId,
    documentIssues,
    redactions,
    selectedAnnotation,
    pageAnnotationMarks,
    activeHighlights,
    handleCommentNav,
    handleNextComment,
    handlePrevComment,
    handleMetadataChange,
    handleAddComment,
    handleDeleteComment,
    handleUpdateComment,
    handleToggleResolvedStatus,
    handleAddReply,
    handleDeleteReply,
    handleResolveAll,
    handleDeleteAllResolved,
    handleRunOcr,
    handleTextSelection,
    handleRectDraw,
    handleRedactionDraw,
    handleDeleteSelectedAnnotation,
    handleUpdateAnnotationColor,
    handleApplyRedactions,
    handleAnnotationClick,
    handleReorderPages,
  } = useAnnotations(
    pdfDoc, engine, pageIndex, pageCount, mode, setMode, authorName, markDirty,
    docLoadingRef, metadata, currentFilePath, setPageIndex, setDocumentEventLog,
    setOutline, setFormFields, setActiveFieldIdx, documentEventLog,
  );

  // Derive interaction state for the currently selected annotation.
  const annotationInteractionState = useMemo(
    () => getInteractionState({
      isSelected: selectedAnnotationId !== null,
      isHovered: hoveredTarget !== null && hoveredTarget === selectedAnnotationId,
    }),
    [selectedAnnotationId, hoveredTarget],
  );

  // Derive canvas cursor from the active annotation tool via the cursor controller.
  const canvasCursorCss = useMemo(
    () => toCssCursor(getCursorForTool(activeAnnotationTool)),
    [activeAnnotationTool],
  );

  const {
    selectedTextTargetId,
    selectedTextTarget,
    editingTextTargetId,
    textDraft,
    setTextDraft,
    handleTextTargetSelect,
    handleEditEntry,
    handleTextContextAction,
    handleDraftCancel,
    handleDraftCommit,
    pageTextStructure,
    textInteractionActive,
  } = useTextInteraction(mode, activeAnnotationTool, textSpans, pageIndex, markDirty, authorName, setDocumentEventLog, setAppErrors);

  // ---------------------------------------------------------------------------
  // Fetch positioned text spans for the current page (enables text selection/copy).
  // ---------------------------------------------------------------------------
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

  // Load page labels when a new document is opened.
  useEffect(() => {
    setPageLabels([]);
    if (!pdfDoc || !isTauri) return;
    void import('@tauri-apps/api/core').then(({ invoke }) => {
      void invoke<string[]>('get_page_labels').then(labels => setPageLabels(labels)).catch(() => {});
    });
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  const canvasContainerRef = useKeyboardShortcuts({
    pageCount,
    setPageIndex,
    isSearchOpen,
    searchResults,
    nextSearchResult,
    prevSearchResult,
    selectedTextTarget,
    editingTextTargetId,
    handleEditEntry,
    mode,
    formFields,
    activeFieldIdx,
    handleFieldNav,
    setZoom,
    undoStackRef,
    syncUndoState,
    handleSaveAs,
    setExportOpen,
    setCommandPaletteOpen,
    setIsSearchOpen,
    setShortcutSheetOpen,
    setMode,
    setLeftRailOpen,
    setGoToPageOpen,
    isSavingRef,
    handleNextComment,
    handlePrevComment,
  });

  // ---------------------------------------------------------------------------
  // File open helpers
  // ---------------------------------------------------------------------------

  const pageInputRef = useRef<HTMLInputElement | null>(null);
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

  // ---------------------------------------------------------------------------
  // Drag-and-drop to open PDF
  // ---------------------------------------------------------------------------

  const { isDragging, setIsDragging, handleDragOver, handleDrop } = useDragDrop(handleLoadDocument);

  // ---------------------------------------------------------------------------
  // Command palette actions
  // ---------------------------------------------------------------------------

  const commands = useCommands({
    pageCount,
    isDirty,
    setPageIndex,
    setZoom,
    handleSaveAs,
    setExportOpen,
    setLeftRailOpen,
    setShortcutSheetOpen,
    setMode,
    closeDocument,
    setCurrentFilePath,
    setUnsavedDialogOpen,
    pendingActionRef,
    recentFiles,
    handleLoadDocument,
  });

  const handleOpenAllTools = useCallback(() => {
    setAllToolsOpen(o => !o);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called by ModeToolbar / OrganizeGrid after a successful page mutation.
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
  }, [updatePageCount, authorName, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Dev-only test hooks
  // ---------------------------------------------------------------------------

  const loadDocumentRef = useRef(handleLoadDocument);
  useEffect(() => { loadDocumentRef.current = handleLoadDocument; }, [handleLoadDocument]);

  useEffect(() => {
    if (!import.meta.env.DEV || !engine) return;
    window.__pdfluent_test__ = {
      loadDocument: (source) => loadDocumentRef.current(source),
    };
    return () => { delete window.__pdfluent_test__; };
  }, [engine]);

  useEffect(() => {
    if (!import.meta.env.DEV || !window.__pdfluent_test__) return;
    window.__pdfluent_test__.interactionDebug = {
      hoveredTarget,
      annotationInteractionState,
      canvasCursorCss: canvasCursorCss as string | undefined,
      selectedTextTargetId,
      editingTextTargetId,
    };
  }, [engine, hoveredTarget, annotationInteractionState, canvasCursorCss, selectedTextTargetId, editingTextTargetId]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showRightPanel = MODES_WITH_RIGHT_PANEL.has(mode);

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
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => { void undoStackRef.current.undo().then(syncUndoState); }}
        onRedo={() => { void undoStackRef.current.redo().then(syncUndoState); }}
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

        {/* ── Side panels: search / timeline / issue ─────────────────────── */}
        <ViewerSidePanels
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          clearSearch={clearSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          runSearch={runSearch}
          searchResults={searchResults}
          activeSearchResultIdx={activeSearchResultIdx}
          setActiveSearchResultIdx={setActiveSearchResultIdx}
          setPageIndex={setPageIndex}
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
          documentEventLog={documentEventLog}
          showIssuePanel={showIssuePanel}
          setShowIssuePanel={setShowIssuePanel}
          documentIssues={documentIssues}
        />

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
            <WelcomeSection
              welcomeFileInputRef={welcomeFileInputRef}
              handleLoadDocument={handleLoadDocument}
              handleOpenFile={handleOpenFile}
              removeRecentFile={removeRecentFile}
              clearRecentFiles={clearRecentFiles}
              recentFiles={recentFiles}
            />
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
