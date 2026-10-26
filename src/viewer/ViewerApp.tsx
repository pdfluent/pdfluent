// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../lib/tauri-detection';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, lazy, Suspense, type ChangeEvent } from 'react';
import { FileTextIcon, Loader2Icon, XIcon } from 'lucide-react';
import type { OutlineNode, TextSpan } from '../core/document';
import { makeDocumentEvent, appendEvent } from './state/documentEvents';
import type { DocumentEvent } from './state/documentEvents';
import type { AppError } from './state/errorCenter';
import { appendError, clearError } from './state/errorCenter';
import { subscribeCommandFailures, logToApp, describeError, reportFallback } from '../lib/commandBridge';
import { routeCommandFailure, saveAsWithDialog } from './state/saveFlow';
import { setPasswordPrompter, type PasswordRequest } from './state/passwordPrompt';
import { restoreRecoveryCopy, startRecoveryCopies, type PendingRecovery } from './state/recoveryCopy';
import i18n from '../i18n';
import { scheduleStartupUpdateCheckIfEnabled, checkAndInstallUpdate, checkForUpdate, relaunchApp } from '../lib/updater';
import { loadAppSettings, saveAppSettings } from './state/appSettings';
import type { AppSettings } from './state/appSettings';
import { applyThemeToRoot, resolveDark, systemPrefersDark } from './state/theme';

import { useEngine } from './hooks/useEngine';
import { useDocument } from './hooks/useDocument';
import { useThumbnails } from './hooks/useThumbnails';
import type { DocumentRevision } from './state/documentRevision';
import { EMPTY_REVISION, bumpAll, bumpPages, pageRevision } from './state/documentRevision';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useOcr } from './hooks/useOcr';
import { useModeManager } from './hooks/useModeManager';
import { useZoomControls } from './hooks/useZoomControls';
import { useAutoFitZoom } from './hooks/useAutoFitZoom';
import { usePageNavigation } from './hooks/usePageNavigation';
import { useSidebarState } from './hooks/useSidebarState';
import { useUndoRedo } from './hooks/useUndoRedo';
import type { HistoryStepResult } from './state/documentHistory';
import { isTypingTarget } from './hooks/keyTargets';
import { useSearch } from './hooks/useSearch';
import { useFormFields } from './hooks/useFormFields';
import { useTextInteraction } from './hooks/useTextInteraction';
import type { TextParagraphTarget } from './text/textInteractionModel';
import { useAnnotations } from './hooks/useAnnotations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDocumentLifecycle } from './hooks/useDocumentLifecycle';
import { useDocumentTabs, type DocumentTabsApi } from './tabs/useDocumentTabs';
import { tabSwitchDirection } from './tabs/tabState';
import { DocumentTabBar } from './components/DocumentTabBar';
import { useCommands } from './hooks/useCommands';
import { useDragDrop } from './hooks/useDragDrop';
import { PageCanvas } from './components/PageCanvas';
import { BottomTaskBar } from './components/BottomTaskBar';
import { OrganizeGrid } from './components/OrganizeGrid';
import { OpenErrorPanel } from './components/OpenErrorPanel';
import { EditorV3Shell } from './v3/EditorV3Shell';
import { XFA_INTERACTIVE_FILL } from './xfaFillGate';
import type { AttachmentInfo, LayerInfo } from './types';
import type { ExportFormat } from './components/ExportDialog';
import { sortBlocksForReading } from './text/textReadingOrder';
import { pickPdfPath } from '../platform/native/fileDialogs';
import { repairPdfTextArtifacts } from '../lib/textIntelligence';

// Lazy-load dialogs and panels that are not shown on initial render
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const AllToolsPanel = lazy(() => import('./components/AllToolsPanel').then(m => ({ default: m.AllToolsPanel })));
const ExportDialog = lazy(() => import('./components/ExportDialog').then(m => ({ default: m.ExportDialog })));
const UpdateBanner = lazy(() => import('./components/UpdateBanner').then(m => ({ default: m.UpdateBanner })));
const ShortcutSheet = lazy(() => import('./components/ShortcutSheet').then(m => ({ default: m.ShortcutSheet })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const GoToPageDialog = lazy(() => import('./components/GoToPageDialog').then(m => ({ default: m.GoToPageDialog })));
const UnsavedChangesDialog = lazy(() => import('./components/UnsavedChangesDialog').then(m => ({ default: m.UnsavedChangesDialog })));
const PasswordPromptDialog = lazy(() => import('./components/PasswordPromptDialog').then(m => ({ default: m.PasswordPromptDialog })));
const RecoveryDialog = lazy(() => import('./components/RecoveryDialog').then(m => ({ default: m.RecoveryDialog })));
const SignedSaveDialog = lazy(() => import('./components/SignedSaveDialog').then(m => ({ default: m.SignedSaveDialog })));
import { TaskQueueProvider } from './context/TaskQueueContext';
import { useRenderTelemetry } from './hooks/useRenderTelemetry';
import { useHoverController } from './interaction/hoverController';
import { getInteractionState, stateDataAttr } from './interaction/interactionState';
import { getCursorForTool, toCssCursor } from './interaction/cursorController';
import { TextContextBar, shouldShowContextBar } from './components/TextContextBar';
import { TextInlineEditor, readInlineEditorText } from './components/TextInlineEditor';
import { TextEditFloatingPill } from './components/TextEditFloatingPill';
import { FormOverlay } from './components/FormOverlay';
import { FormBar } from './components/FormBar';
import { ScriptConsentBar } from './components/ScriptConsentBar';
import { XfaBanner, TextEditRejectionNotice, AppErrorToast } from './components/Notices';
import { useFormScriptConsent } from './hooks/useFormScriptConsent';
import { loadOsFormScriptsPolicy } from './state/scriptConsent';
import { XfaFormOverlay } from './components/XfaFormOverlay';
import { LinkOverlay } from './components/LinkOverlay';
import { useFormModel } from './hooks/useFormModel';
import { runFlattenForm } from './state/flattenForm';
import { useXfaFormModel } from './hooks/useXfaFormModel';
import { getLinkAnnotations, type LinkAnnotationDto } from './../lib/tauri-api';
import { downloadPdfBytesInBrowser } from './export/browserPdfDownload';
import { getEditability } from './text/textEditability';
import { printDocument } from './state/printFlow';
import { releaseListener } from '../lib/releaseListener';

// Dev-only test hook — never present in production builds
declare global {
  interface Window {
    __pdfluent_test__?: {
      loadDocument: (source: string | ArrayBuffer) => Promise<void>;
      getTextSpans?: () => TextSpan[];
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

const isTauri = isTauriRuntime();
const AUTO_OPEN_LINKS_KEY = 'pdfluent.links.autoOpen';

/** "report.pdf", or "report.pdf and 2 more" when several documents were left unsaved. */
function recoveryDocumentLabel(offers: readonly PendingRecovery[]): string {
  const first = offers[0];
  const name = first?.originalPath?.split(/[\\/]/).filter(Boolean).pop() ?? i18n.t('recover.untitled');
  return offers.length > 1 ? i18n.t('recover.andMore', { name, count: offers.length - 1 }) : name;
}

export type { SearchResult } from './hooks/useSearch';

export function ViewerApp() {
  const { engine, loading: engineLoading, error: engineError, timedOut: engineTimedOut } = useEngine();
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
    replaceDocument,
    loadDocument,
    closeDocument,
    dismissError: dismissDocError,
  } = useDocument(engine);
  const { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles } = useRecentFiles();
  const { mode, setMode } = useModeManager();
  const { zoom, setZoom, setAutoZoom, zoomManual, zoomPresetsOpen, setZoomPresetsOpen } = useZoomControls(pdfDoc?.id ?? null);
  // Undo/redo of every edit lives in the backend (J-85). After a step the
  // views catch up through historyStepRef, filled in once the hooks it needs
  // exist further down.
  const historyStepRef = useRef<((step: HistoryStepResult) => void) | null>(null);
  const handleDocumentMutatedRef = useRef<((pages?: number[]) => void) | null>(null);
  const onBackendStep = useCallback((step: HistoryStepResult) => { historyStepRef.current?.(step); }, []);
  // The command bridge has already shown the failure; this keeps it in the log.
  const onBackendError = useCallback((message: string) => { void logToApp(`undo/redo failed: ${message}`); }, []);
  const { canUndo, canRedo, pushUndo, undo: undoEdit, redo: redoEdit } = useUndoRedo({
    backend: isTauri,
    onBackendStep,
    onBackendError,
    onBackendModified: markDirty,
  });
  const {
    commandPaletteOpen, setCommandPaletteOpen,
    allToolsOpen, setAllToolsOpen,
    exportOpen, setExportOpen,
    shortcutSheetOpen, setShortcutSheetOpen,
    goToPageOpen, setGoToPageOpen,
    unsavedDialogOpen, setUnsavedDialogOpen,
    setLeftRailOpen,
    recentCmdIds,
    handleCommandRun,
  } = useSidebarState();
  const [initialExportFormat, setInitialExportFormat] = useState<ExportFormat>('pdf');

  // Application settings. The dialog is the surface LICENSE.md §4 points at for
  // switching the automatic update check off, so it has to be reachable —
  // it opens from the command palette ("Settings").
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const handleSettingsChange = useCallback((next: AppSettings) => {
    setAppSettings(next);
    saveAppSettings(next);
  }, []);
  // Theme: the stored preference decides, "system" follows the OS live (#721).
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => { setSystemDark(e.matches); };
    mq.addEventListener('change', onChange);
    return () => { mq.removeEventListener('change', onChange); };
  }, []);
  const themeDark = resolveDark(appSettings.themePreference, systemDark);
  useEffect(() => { applyThemeToRoot(themeDark); }, [themeDark]);
  const handleToggleTheme = useCallback(() => {
    handleSettingsChange({ ...appSettings, themePreference: themeDark ? 'light' : 'dark' });
  }, [appSettings, themeDark, handleSettingsChange]);

  const renderFallback = useRenderTelemetry();

  // What changed, not "something changed". A text commit names its page, so
  // one edit no longer re-renders and re-thumbnails the whole document.
  const [revision, setRevision] = useState<DocumentRevision>(EMPTY_REVISION);
  const [contentRevision, setContentRevision] = useState(0);
  const documentVersion = revision.all;
  const bumpDocument = useCallback(() => { setRevision(r => bumpAll(r)); }, []);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // TTS word highlight: charIndex in readAloudText, -1 = not active
  const [ttsCharIndex, setTtsCharIndex] = useState(-1);
  const { pageIndex, setPageIndex } = usePageNavigation(pageCount, currentFilePath);
  const { thumbnails } = useThumbnails(engine, pdfDoc, pageCount, revision, pageIndex);

  // Smart initial loading: expand render window progressively so the first page
  // appears as fast as possible. Window starts at INITIAL_RADIUS, then expands
  // to FULL_RADIUS after a short delay.
  const INITIAL_RENDER_RADIUS = 1; // Page 0 and 1 on first load
  const FULL_RENDER_RADIUS = 2;    // ±2 pages after initial
  const [renderRadius, setRenderRadius] = useState(INITIAL_RENDER_RADIUS);

  // When a document opens, reset radius and then expand after 50 ms
  useEffect(() => {
    if (!pdfDoc) return;
    setRenderRadius(INITIAL_RENDER_RADIUS);
    const t = setTimeout(() => { setRenderRadius(FULL_RENDER_RADIUS); }, 50);
    return () => clearTimeout(t);
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Continuous scroll: refs for each page div + programmatic scroll guard
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScrollRef = useRef(false);

  const scrollToPage = useCallback((idx: number) => {
    const el = pageRefs.current[idx];
    if (!el) return;
    isProgrammaticScrollRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { isProgrammaticScrollRef.current = false; }, 900);
  }, []);

  const navigateToPage = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, pageCount - 1));
    setPageIndex(clamped);
    scrollToPage(clamped);
  }, [pageCount, scrollToPage]); // eslint-disable-line react-hooks/exhaustive-deps
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  // A panel an All-tools tile asked for; the v3 shell opens it and clears it.
  const [requestedPanel, setRequestedPanel] = useState<string | null>(null);
  const [pageLabels, setPageLabels] = useState<string[]>([]);
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  // Reviewer name — persisted to localStorage so it survives page reloads
  const [authorName, setAuthorName] = useState(() => {
    try { return localStorage.getItem('pdfluent.user.author') ?? ''; } catch { return ''; }
  });
  // Document event log — in-memory audit trail for this editing session
  const [documentEventLog, setDocumentEventLog] = useState<DocumentEvent[]>([]);
  // App-level error registry — surfaced by Phase 4+ notification UI
  const [appErrors, setAppErrors] = useState<AppError[]>([]);
  const [pendingExternalLink, setPendingExternalLink] = useState<{ href: string; label: string } | null>(null);

  // Every command failure and every visible fallback, from anywhere in the
  // tree, lands in the same stack the user reads. Without this the bridge
  // reports into an empty room: hooks five levels down have no setter for it.
  // A signed document whose change cannot be appended (a redaction) is refused
  // by save_pdf with a typed reason; the answer is a dialog offering a copy
  // without the signature, and only that: no error toast beside it.
  const [signedSaveDialogOpen, setSignedSaveDialogOpen] = useState(false);

  // The password prompt for protected PDFs (J-18). The open waits on the
  // promise; the dialog resolves it with the password or null for Cancel.
  const [passwordRequest, setPasswordRequest] = useState<{
    request: PasswordRequest;
    resolve: (password: string | null) => void;
  } | null>(null);
  useEffect(() => setPasswordPrompter((request) => new Promise<string | null>((resolve) => {
    setPasswordRequest({ request, resolve });
  })), []);
  const answerPasswordRequest = useCallback((password: string | null) => {
    setPasswordRequest((current) => {
      current?.resolve(password);
      return null;
    });
  }, []);
  useEffect(() => subscribeCommandFailures(error => {
    if (routeCommandFailure(error.message) === 'signed-save-dialog') {
      setSignedSaveDialogOpen(true);
      return;
    }
    setAppErrors(prev => appendError(prev, error));
  }), []);

  const [xfaFlattenBusy, setXfaFlattenBusy] = useState(false);
  const [xfaFlattenError, setXfaFlattenError] = useState<string | null>(null);
  const [xfaBannerDismissed, setXfaBannerDismissed] = useState(false);

  // Auto-update state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  // Transient feedback for the *manual* update check ('uptodate' | 'failed')
  const [updateCheckNotice, setUpdateCheckNotice] = useState<'uptodate' | 'failed' | null>(null);
  // Post-install: show the "restart to finish" state, and why a restart is
  // blocked ('unsaved' = save first; 'failed' = relaunch failed, restart manually).
  const [updateInstalled, setUpdateInstalled] = useState(false);
  const [updateRestartHint, setUpdateRestartHint] = useState<'unsaved' | 'failed' | null>(null);

  useEffect(() => {
    if (!updateCheckNotice) return;
    const timer = setTimeout(() => setUpdateCheckNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [updateCheckNotice]);

  // Schedule a silent startup update check (5 s delay, non-blocking), unless
  // the user switched the automatic check off in Settings — that setting is
  // what LICENSE.md 4 promises, and it is read here.
  // The Mac App Store build never self-checks — the App Store delivers updates.
  // Deps stay empty on purpose: this is the *startup* check, so the setting is
  // read once, at startup. The manual "Check for updates" command below is
  // never gated on it.
  useEffect(() => {
    if (!isTauri || __IS_MAS_BUILD__) return;
    return scheduleStartupUpdateCheckIfEnabled({
      onUpdateAvailable: async (version) => {
        setUpdateVersion(version);
        setUpdateAvailable(true);
        return false; // let the user choose to install via the banner
      },
      onUpdateInstalled: () => { /* no-op: handled by handleInstallUpdate */ },
      onError: () => { /* silent on startup */ },
    });
  }, []);

  const handleAuthorChange = useCallback((name: string) => {
    setAuthorName(name);
    try {
      localStorage.setItem('pdfluent.user.author', name);
    } catch {
      // LocalStorage is a convenience cache only; comments still work without it.
    }
  }, []);

  const handleInstallUpdate = useCallback(() => {
    setUpdateInstalling(true);
    void checkAndInstallUpdate({
      onUpdateAvailable: async () => true,
      onUpdateInstalled: () => { setUpdateInstalling(false); setUpdateInstalled(true); },
      onError: () => {
        // Surface the failure — a silently stopping spinner reads as "nothing happened".
        setUpdateInstalling(false);
        setUpdateCheckNotice('failed');
      },
    });
  }, []);

  const handleRestartApp = useCallback(() => {
    // Never discard unsaved work: the update is already installed and applies on
    // the next launch, so block the relaunch and ask the user to save first.
    if (isDirty) { setUpdateRestartHint('unsaved'); return; }
    setUpdateRestartHint(null);
    // relaunchApp() is a no-op outside Tauri; on failure fall back to a manual
    // "quit and reopen" message rather than leaving the user stuck.
    void relaunchApp().catch(() => { setUpdateRestartHint('failed'); });
  }, [isDirty]);

  const handleCheckForUpdates = useCallback(() => {
    void checkForUpdate()
      .then(result => {
        if (result.available && result.version) {
          setUpdateVersion(result.version);
          setUpdateAvailable(true);
        } else {
          setUpdateCheckNotice('uptodate');
        }
      })
      .catch(() => { setUpdateCheckNotice('failed'); });
  }, []);

  // OCR no longer draws an overlay of guessed words: the words are written
  // into the page as an invisible text layer (useOcr), so search, selection
  // and copy see them like any other text.

  // Attachments and optional content groups are native-backed document data.
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Map<string, boolean>>(new Map());

  const handleExtractAttachment = useCallback((name: string) => {
    if (isTauri) {
      void (async () => {
        const { invokeCommand: invoke } = await import('../lib/commandBridge');
        await invoke<string | null>('save_attachment_dialog', { name });
      })();
    } else {
      // Browser fallback: download a simulated mock file
      const blob = new Blob([`Simulatie data voor bijlage ${name}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const handleAddAttachment = useCallback(() => {
    if (isTauri) {
      void (async () => {
        const { invokeCommand: invoke } = await import('../lib/commandBridge');
        const list = await invoke<AttachmentInfo[] | null>('add_attachment_dialog');
        // null: the picker was cancelled and nothing changed.
        if (list) { setAttachments(list); markDirty(); }
      })();
    } else {
      // Browser fallback: simulate file input picker
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const newAttachment: AttachmentInfo = {
            name: file.name,
            size_bytes: file.size,
            description: 'Toegevoegd via browser',
            mime_type: file.type || 'application/octet-stream',
            creation_date: new Date().toISOString(),
          };
          setAttachments(prev => [...prev, newAttachment]);
          markDirty();
        }
      };
      input.click();
    }
  }, [markDirty]);

  const handleRemoveAttachment = useCallback((name: string) => {
    if (isTauri) {
      void (async () => {
        const { invokeCommand: invoke } = await import('../lib/commandBridge');
        await invoke('remove_attachment', { name });
        markDirty();
        const list = await invoke<AttachmentInfo[]>('list_attachments');
        setAttachments(list);
      })();
    } else {
      // Browser fallback
      setAttachments(prev => prev.filter(att => att.name !== name));
      markDirty();
    }
  }, [markDirty]);

  const handleToggleLayer = useCallback((id: string) => {
    setLayerVisibility(prev => {
      const next = new Map(prev);
      next.set(id, !(next.get(id) ?? true));
      return next;
    });
  }, []);

  // Centralised hover tracking across all interactive surfaces.
  const { hoveredTarget } = useHoverController();

  // Derived filename — passed to useDocumentLifecycle for tab/window title.
  // The file on disk wins over the name the document was loaded under: after
  // Save As the app works on the new file (the next Save goes there), and the
  // title bar kept naming the old one (J-83, tests/journeys/J-83-save-as.e2e.ts).
  // The engine reports the load-time file name as the title of a document
  // without /Title, so that value is a file name, not a title.
  const savedFileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() || null : null;
  const documentTitle = metadata?.title?.trim() || null;
  const ownTitle = documentTitle && documentTitle !== pdfDoc?.fileName ? documentTitle : null;
  const fileName = ownTitle || savedFileName || pdfDoc?.fileName || null;

  // ---------------------------------------------------------------------------
  // Document lifecycle: save-as, open/close guards, unsaved-changes dialog
  // ---------------------------------------------------------------------------

  // The tabs need what the lifecycle hands back, and the lifecycle opens files
  // through the tabs: this ref closes the loop (J-90).
  const tabsRef = useRef<DocumentTabsApi | null>(null);
  const {
    pendingActionRef,
    isSavingRef,
    docLoadingRef,
    handleSaveAs,
    handleSaveAsOrThrow,
    handleLoadDocument,
    beginAccess,
    releaseAccess,
    askAboutUnsavedChanges,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  } = useDocumentLifecycle(
    isDirty, loadDocument, clearDirty, addRecentFile,
    pdfDoc, pageCount, currentFilePath, setCurrentFilePath, setUnsavedDialogOpen,
    docLoading, tabsRef,
  );

  // ── Several documents (J-90) ──────────────────────────────────────────────
  // One tab per open document. The desktop app only: the browser build shows
  // one document and a new file replaces it.
  const longTaskBusyRef = useRef(false);
  const documentTabs = useDocumentTabs({
    enabled: isTauri,
    loadDocument,
    isDirty,
    fileName,
    currentFilePath,
    setCurrentFilePath,
    pageIndex,
    setPageIndex,
    zoom,
    setZoom,
    zoomManual,
    clearViewer: () => { closeDocument(); setCurrentFilePath(null); },
    // A save, a load or a long job (OCR) works on the document on screen; a
    // switch in the middle of one would split it.
    isBusy: () => isSavingRef.current || docLoadingRef.current || longTaskBusyRef.current,
    beginAccess,
    releaseAccess,
    askAboutUnsavedChanges,
    notify: (message) => {
      reportFallback({
        source: 'document-tabs',
        title: i18n.t('tabs.tooManyTitle'),
        message,
        code: 'TOO_MANY_DOCUMENTS',
        taxonomy: 'environment_failure.memory_exhausted',
      });
    },
    text: { tooMany: (max) => i18n.t('tabs.tooManyMessage', { max }) },
    invoke: async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
      const { invokeCommand } = await import('../lib/commandBridge');
      return invokeCommand<T>(command, args);
    },
  });
  tabsRef.current = isTauri ? documentTabs : null;

  const handleBrowserSaveAs = useCallback(async () => {
    if (!pdfDoc || !engine || pageCount === 0) return;

    const result = await engine.document.saveDocument(pdfDoc);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    if (!(result.value instanceof Uint8Array)) {
      throw new Error('Browser-test PDF save did not return downloadable bytes');
    }

    downloadPdfBytesInBrowser(result.value, { fileName });
    clearDirty();
  }, [pdfDoc, engine, pageCount, fileName, clearDirty]);

  const handleRuntimeSaveAs = isTauri ? handleSaveAsOrThrow : handleBrowserSaveAs;

  // The copy the signed-save dialog offers. The document becomes that copy.
  const handleSaveUnsignedCopy = useCallback(async () => {
    setSignedSaveDialogOpen(false);
    try {
      const { invokeCommand } = await import('../lib/commandBridge');
      await saveAsWithDialog(invokeCommand, (path) => {
        setCurrentFilePath(path);
        clearDirty();
        addRecentFile(path);
      }, 'save_unsigned_copy_as_dialog');
    } catch (error) {
      console.warn('save_unsigned_copy_as_dialog failed (already reported)', error);
    }
  }, [clearDirty, addRecentFile]);

  // ── Recovery copy (J-84) ──────────────────────────────────────────────────
  // While the Autosave setting is on and there are unsaved changes, a recovery
  // copy is written on a timer (src-tauri/src/recovery.rs). A copy a crash
  // left behind is offered once, at start.
  const recoveryEnabledRef = useRef(appSettings.autosaveEnabled);
  useEffect(() => { recoveryEnabledRef.current = appSettings.autosaveEnabled; }, [appSettings.autosaveEnabled]);
  // A document in another tab counts: its copy is written too.
  const recoveryDirtyRef = useRef(documentTabs.anyDirty);
  useEffect(() => { recoveryDirtyRef.current = documentTabs.anyDirty; }, [documentTabs.anyDirty]);
  useEffect(() => {
    if (!isTauri) return;
    return startRecoveryCopies({
      isEnabled: () => recoveryEnabledRef.current,
      isDirty: () => recoveryDirtyRef.current,
      write: async () => {
        const { invokeCommand } = await import('../lib/commandBridge');
        return invokeCommand<boolean>('write_recovery_copy');
      },
    });
  }, []);
  // One copy per document that was open and unsaved when the app stopped; the
  // dialog offers them together and Recover brings each back in its own tab.
  const [recoveryOffer, setRecoveryOffer] = useState<PendingRecovery[]>([]);
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const { invokeCommand } = await import('../lib/commandBridge');
        const records = await invokeCommand<PendingRecovery[]>('pending_recoveries');
        if (!cancelled && records.length > 0) setRecoveryOffer(records);
      } catch (error) {
        console.warn('pending_recoveries failed (already reported)', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const handleRecoverCopy = useCallback(async () => {
    const records = recoveryOffer;
    setRecoveryOffer([]);
    try {
      const { invokeCommand } = await import('../lib/commandBridge');
      for (const record of records) {
        await restoreRecoveryCopy(record, {
          invoke: invokeCommand,
          // A recovered copy is a document of its own, even when the file it
          // came from is open in another tab.
          open: async (path) => {
            if (!(await documentTabs.openPath(path, { allowDuplicate: true }))) {
              throw new Error('the recovered document could not be opened');
            }
          },
          onRestored: (originalPath) => {
            setCurrentFilePath(originalPath);
            markDirty();
          },
        });
      }
    } catch (error) {
      console.warn('restoring the recovery copy failed (already reported)', error);
    }
  }, [recoveryOffer, documentTabs, markDirty]);
  const handleDiscardRecovery = useCallback(async () => {
    const records = recoveryOffer;
    setRecoveryOffer([]);
    try {
      const { invokeCommand } = await import('../lib/commandBridge');
      for (const record of records) await invokeCommand('discard_recovery', { slot: record.slot });
    } catch (error) {
      console.warn('discard_recovery failed (already reported)', error);
    }
  }, [recoveryOffer]);

  // After signing, the open document is the signed file: point the app at it.
  const handleDocumentPathChanged = useCallback((path: string) => {
    setCurrentFilePath(path);
    addRecentFile(path);
  }, [addRecentFile]);

  const handleRuntimeSave = useCallback(async () => {
    if (!pdfDoc || pageCount === 0) return;
    if (isTauri && currentFilePath) {
      const { invokeCommand: invoke } = await import('../lib/commandBridge');
      await invoke('save_pdf', { path: currentFilePath });
      clearDirty();
      return;
    }
    await handleRuntimeSaveAs();
  }, [pdfDoc, pageCount, currentFilePath, clearDirty, handleRuntimeSaveAs]);

  const handleExternalLinkClick = useCallback(async (href: string, label: string) => {
    const message = i18n.t('externalLink.askMessage', { label, href });

    if (isTauri) {
      const { ask } = await import('@tauri-apps/plugin-dialog');
      const confirmed = await ask(message, {
        title: i18n.t('externalLink.title'),
        kind: 'warning',
        okLabel: i18n.t('externalLink.openLink'),
        cancelLabel: i18n.t('common.cancel'),
      });

      if (!confirmed) return;
      const { invokeCommand: invoke } = await import('../lib/commandBridge');
      await invoke('open_external_url', { url: href });
      return;
    }

    setPendingExternalLink({ href, label });
  }, []);

  const handleExternalLinkCancel = useCallback(() => {
    setPendingExternalLink(null);
  }, []);

  const handleExternalLinkConfirm = useCallback(() => {
    const link = pendingExternalLink;
    if (!link) return;
    setPendingExternalLink(null);
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }, [pendingExternalLink]);

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

  // First-class AcroForm model — fillable in normal read mode (no Form Mode).
  const formModel = useFormModel(pdfDoc, documentVersion, markDirty, setPageIndex, pushUndo);
  // J-58: flatten the AcroForm. The backend records it as one undo step; the
  // views refresh like after any document-wide edit.
  const onFormFlattened = useCallback((info: { page_count: number }) => {
    updatePageCount(info.page_count);
    setFormFields([]);
    markDirty();
    bumpDocument();
    setContentRevision(n => n + 1);
  }, [markDirty, bumpDocument]); // eslint-disable-line react-hooks/exhaustive-deps
  const [flattenFormBusy, setFlattenFormBusy] = useState(false);
  const handleFlattenForm = useCallback(async () => {
    setFlattenFormBusy(true);
    try {
      return await runFlattenForm(onFormFlattened);
    } finally {
      setFlattenFormBusy(false);
    }
  }, [onFormFlattened]);
  // XFA fill model (Phase 2 interactive commit loop) — only for dynamic XFA docs.
  const xfaForm = useXfaFormModel(
    pdfDoc, markDirty, setPageIndex, pushUndo,
    bumpDocument,
  );
  // Form scripts run only with the user's permission (script_consent.rs).
  // When permission arrives the initial scripts have just run: repaint the
  // pages and reload both form models so the calculated values show.
  const handleFormScriptsMode = useCallback((mode: AppSettings['formScriptsMode']) => {
    handleSettingsChange({ ...loadAppSettings(), formScriptsMode: mode });
  }, [handleSettingsChange]);
  const reloadXfaForm = xfaForm.reload;
  const handleFormScriptsRan = useCallback(() => {
    reloadXfaForm();
    bumpDocument();
    setContentRevision(n => n + 1);
  }, [reloadXfaForm, bumpDocument]);
  useEffect(() => { void loadOsFormScriptsPolicy(); }, []);
  const scriptConsent = useFormScriptConsent(
    pdfDoc?.id, appSettings, handleFormScriptsMode, handleFormScriptsRan,
  );
  const [highlightFields, setHighlightFields] = useState(true);
  // Capability-based link trust: null = ask on first use; true = auto-open
  // (with a visible, reversible toggle in the Form Bar); false = ask each time.
  const [autoOpenLinks, setAutoOpenLinks] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(AUTO_OPEN_LINKS_KEY);
      return v === 'true' ? true : v === 'false' ? false : null;
    } catch {
      return null;
    }
  });
  const persistAutoOpenLinks = useCallback((value: boolean | null) => {
    setAutoOpenLinks(value);
    try {
      if (value === null) localStorage.removeItem(AUTO_OPEN_LINKS_KEY);
      else localStorage.setItem(AUTO_OPEN_LINKS_KEY, String(value));
    } catch { /* localStorage unavailable */ }
  }, []);

  // Clickable /Link → /URI annotations, and the per-document ask-on-first-use
  // choice prompt (capability trust). Loaded alongside the document.
  const [linkAnnotations, setLinkAnnotations] = useState<LinkAnnotationDto[]>([]);
  const [pendingLinkChoice, setPendingLinkChoice] = useState<{ uri: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc || !isTauri) {
      setLinkAnnotations([]);
      return;
    }
    void getLinkAnnotations()
      .then(links => { if (!cancelled) setLinkAnnotations(links); })
      .catch(() => { if (!cancelled) setLinkAnnotations([]); });
    return () => { cancelled = true; };
  }, [pdfDoc?.id, documentVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const openExternalUri = useCallback(async (uri: string) => {
    if (!isTauri) {
      window.open(uri, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const { invokeCommand: invoke } = await import('../lib/commandBridge');
      await invoke('open_external_url', { url: uri });
    } catch (err) {
      console.error('[PDFluent] failed to open external URL', err);
    }
  }, []);

  // Activate a link: open immediately if auto-allow is on, else ask once.
  const handleLinkActivate = useCallback((uri: string) => {
    if (autoOpenLinks === true) {
      void openExternalUri(uri);
    } else {
      setPendingLinkChoice({ uri });
    }
  }, [autoOpenLinks, openExternalUri]);

  const {
    isSearchOpen, setIsSearchOpen,
    searchQuery, setSearchQuery,
    searchResults,
    activeSearchResultIdx,
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
    activeAnnotationTool,
    setActiveAnnotationTool,
    annotationAppearance,
    setAnnotationAppearance,
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
    handleAddNote,
    handleDeleteComment,
    handleUpdateComment,
    handleToggleResolvedStatus,
    handleAddReply,
    handleDeleteReply,
    handleResolveAll,
    handleDeleteAllResolved,
    handleTextSelection,
    createTextMarkupFromSelection,
    handleRectDraw,
    handleInkDraw,
    handleRedactionDraw,
    handleDeleteSelectedAnnotation,
    handleUpdateAnnotationColor,
    handleUpdateAnnotationRect,
    handleUpdateAnnotationText,
    handleReplaceAnnotationImage,
    handlePlaceAnnotation,
    handleApplyRedactions,
    handleRedactSearch,
    handleRedactMetadata,
    handleAnnotationClick,
    handleReorderPages: handleReorderPagesRaw,
    handleDeletePage: handleDeletePageRaw,
    refetchAnnotations,
  } = useAnnotations(
    pdfDoc, engine, pageIndex, pageCount, mode, setMode, authorName, markDirty,
    docLoadingRef, metadata, currentFilePath, setPageIndex, setDocumentEventLog,
    setOutline, setFormFields, setActiveFieldIdx, documentEventLog,
    (pages) => handleDocumentMutatedRef.current?.(pages),
  );

  // The page and zoom a tab was left at come back once the viewer has reset
  // itself for the document that just appeared (the effect above runs first).
  useEffect(() => {
    documentTabs.applyPendingView();
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend holds the close of the window while any open document has
  // unsaved changes, not only the one on screen.
  useEffect(() => {
    if (!isTauri) return;
    void import('../lib/commandBridge')
      .then(({ invokeCommand }) => invokeCommand('set_unsaved_changes', { dirty: documentTabs.anyDirty }))
      .catch((error: unknown) => { console.warn('set_unsaved_changes failed (already reported)', error); });
  }, [documentTabs.anyDirty]);

  // Tab shortcuts: Ctrl+Tab and Ctrl+Shift+Tab (every platform), Ctrl+Page
  // Down/Up, and on macOS Cmd+Shift+] and Cmd+Shift+[. File > New Tab and
  // Close Tab come from the application menu.
  const tabsForKeysRef = useRef(documentTabs);
  tabsForKeysRef.current = documentTabs;
  useEffect(() => {
    if (!isTauri) return;
    function onKeyDown(event: KeyboardEvent): void {
      const tabsNow = tabsForKeysRef.current;
      const direction = tabSwitchDirection(event);
      if (direction === null || tabsNow.tabs.length < 2) return;
      event.preventDefault();
      void tabsNow.switchRelative(direction);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, []);

  // After an undo or redo the backend holds an earlier (or later) document:
  // every view that reads it catches up — page count, renders and thumbnails,
  // annotations, form values — and the unsaved flag follows the backend, so
  // undoing back to what was saved is clean again.
  historyStepRef.current = (step: HistoryStepResult) => {
    updatePageCount(step.document.pageCount);
    setPageIndex(prev => Math.min(prev, Math.max(0, step.document.pageCount - 1)));
    if (step.history.modified) markDirty(); else clearDirty();
    bumpDocument();
    setContentRevision(n => n + 1);
    void refetchAnnotations();
    xfaForm.reload();
  };

  // Wrap raw reorder to also bump the revision so thumbnails regenerate.
  // Document-wide: after a reorder no page is where it was.
  const handleReorderPages = useCallback(async (newOrder: number[]) => {
    await handleReorderPagesRaw(newOrder);
    bumpDocument();
  }, [handleReorderPagesRaw, bumpDocument]);

  // Rust mutations publish a fresh immutable render snapshot in-place. Bump
  // the revision so canvases, thumbnails, and text models consume that
  // snapshot; reloading currentFilePath here would replace it with the older
  // on-disk document before the user has saved.
  const handleRequestedPanelHandled = useCallback(() => { setRequestedPanel(null); }, []);

  // `pages` names the pages a mutation touched. A text commit passes its one
  // page; anything that cannot name its pages falls back to document-wide,
  // which is the old behaviour and still correct, only slower.
  const handleDocumentMutated = useCallback((pages?: number[]) => {
    setRevision(r => (pages && pages.length > 0 ? bumpPages(r, pages) : bumpAll(r)));
    // A flat count of content changes, separate from the per-page render
    // revision above: the Sign panel does not care which page moved, only that
    // the bytes a signature covers no longer are what they were.
    setContentRevision(n => n + 1);
  }, []);
  // useAnnotations is called above this line and re-renders the pages an
  // annotation edit touched through this ref.
  handleDocumentMutatedRef.current = handleDocumentMutated;

  // OCR (J-60): the run writes a text layer into the open document, so the
  // pages re-render and the document is unsaved until the user saves it.
  const handleOcrChangedDocument = useCallback(() => {
    handleDocumentMutated();
    markDirty();
  }, [handleDocumentMutated, markDirty]);
  const ocr = useOcr({
    isTauri,
    hasDocument: pdfDoc !== null,
    scannedPageIndices,
    pageCount,
    languageSetting: appSettings.ocrDefaultLanguage,
    onDocumentChanged: handleOcrChangedDocument,
  });
  const ocrRunning = ocr.running;
  longTaskBusyRef.current = ocrRunning;

  // Per document, not per session. Keyed on the document object rather than its
  // path: a "Save as" gives the same document a new path and has not undone
  // anything that was done to it.
  useEffect(() => { setContentRevision(0); }, [pdfDoc]);

  // Stable ref so handleDeleteCurrentPage (used early in useKeyboardShortcuts) can
  // call handlePageMutation without a forward-reference TS error.
  const handlePageMutationRef = useRef<((newCount: number) => void) | null>(null);
  const handleDeleteCurrentPage = useCallback(async () => {
    if (pageCount <= 1) return;
    // Annotation delete takes priority: if a markup annotation is selected,
    // the Delete key is handled by useAnnotations and must not also delete the page.
    if (selectedAnnotationId !== null) return;
    const newCount = await handleDeletePageRaw(pageIndex);
    if (newCount !== null) handlePageMutationRef.current?.(newCount);
  }, [pageCount, pageIndex, selectedAnnotationId, handleDeletePageRaw]);

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
    draftFontSize,
    draftFontId,
    setDraftFontId,
    textDraft,
    setTextDraft,
    handleTextTargetSelect,
    handleEditEntry,
    handleTextContextAction,
    handleDraftCancel,
    handleDraftCommit,
    pageTextStructure,
    textInteractionActive,
    textEditMaxLength,
    formatState,
    handleFormatCommand,
    editorDivRef,
    textMutationRejection,
    dismissTextMutationRejection,
  } = useTextInteraction(
    mode,
    activeAnnotationTool,
    textSpans,
    pageIndex,
    markDirty,
    authorName,
    setDocumentEventLog,
    setAppErrors,
    handleDocumentMutated,
    handleExternalLinkClick,
    pdfDoc,
  );

  // Derived text for Text-to-Speech (Voorlezen), sorted in logical block/column reading order
  const readAloudText = useMemo(() => {
    if (!pageTextStructure || pageTextStructure.blocks.length === 0) {
      return textSpans.map(span => span.text).join(' ').replace(/\s+/g, ' ').trim();
    }
    const width = pdfDoc?.pages[pageIndex]?.size.width ?? 595;
    const sortedBlocks = sortBlocksForReading(pageTextStructure.blocks, width);
    const blockTexts = sortedBlocks.map(block => {
      return block.paragraphs.map(para => {
        return para.lines.map(line => {
          return line.spans.map(span => span.text).join(' ');
        }).join(' ');
      }).join('\n');
    });
    return blockTexts
      .join('\n\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }, [pageTextStructure, textSpans, pdfDoc, pageIndex]);

  // Map TTS charIndex (offset in readAloudText, built from textSpans joined by spaces)
  // to the index of the TextSpan being spoken so the TextLayer can highlight it.
  const ttsHighlightSpanIndex = useMemo(() => {
    if (ttsCharIndex < 0 || textSpans.length === 0) return -1;
    let offset = 0;
    for (let i = 0; i < textSpans.length; i++) {
      const end = offset + (textSpans[i]?.text.length ?? 0);
      if (ttsCharIndex >= offset && ttsCharIndex < end) return i;
      offset = end + 1; // +1 for the joining space
    }
    return -1;
  }, [ttsCharIndex, textSpans]);

  // Track the double-click coordinates so the inline editor can position the cursor there
  const [lastDoubleClickAt, setLastDoubleClickAt] = useState<{ clientX: number; clientY: number } | null>(null);

  // Clear the double-click coordinates when editing ends (commit or cancel)
  useEffect(() => {
    if (!editingTextTargetId) {
      setLastDoubleClickAt(null);
    }
  }, [editingTextTargetId]);

  // Belt-and-braces: the inline editor cancels on Escape itself (and stops
  // propagation), but if the event ever bypasses the editor — observed once
  // during live testing — this window-level fallback still closes the edit.
  useEffect(() => {
    if (!editingTextTargetId) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDraftCancel();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [editingTextTargetId, handleDraftCancel]);

  // Reset armed tools when the document changes — an active annotation or
  // insert tool must never stay armed across a document switch.
  useEffect(() => {
    setActiveAnnotationTool(null);
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the user double-clicks text in read mode, auto-switch to edit mode and queue the target.
  const [pendingEditTarget, setPendingEditTarget] = useState<TextParagraphTarget | null>(null);
  useEffect(() => {
    if (mode === 'edit' && pendingEditTarget) {
      handleEditEntry(pendingEditTarget);
      setPendingEditTarget(null);
    }
  }, [mode, pendingEditTarget, handleEditEntry]);

  const handleDoubleClickForEdit = useCallback((target: TextParagraphTarget) => {
    if (mode !== 'edit') {
      setMode('edit');
      setPendingEditTarget(target);
    } else {
      handleEditEntry(target);
    }
  }, [mode, setMode, handleEditEntry]);

  // ---------------------------------------------------------------------------
  // Fetch positioned text spans for the current page (enables text selection/copy).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setTextSpans([]);
    window.getSelection()?.removeAllRanges();
    if (!pdfDoc || !engine) return;
    let cancelled = false;
    void engine.query.extractPageTextSpans(pdfDoc, pageIndex).then(result => {
      if (!cancelled && result.success) {
        result.value.forEach(s => {
          const raw = s.text;
          s.text = repairPdfTextArtifacts(s.text);
          if (s.text !== raw) s.rawText = raw;
        });
        setTextSpans(result.value);
      }
    });
    return () => { cancelled = true; };
    // Keyed on this page's own revision: an edit on another page cannot change
    // the spans here, and re-extracting them cost a backend interpret of the
    // page for nothing.
  }, [pageIndex, pdfDoc?.id, pageRevision(revision, pageIndex)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load page labels when a new document is opened.
  useEffect(() => {
    setPageLabels([]);
    if (!pdfDoc || !isTauri) return;
    // Labels are optional: a document that is still locked (it asks for its
    // password after it opens) or has none shows plain page numbers, and a toast
    // for that would be noise the person cannot act on (J-18, J-76).
    void import('../lib/commandBridge').then(({ invokeQuietly: invoke }) => {
      void invoke<string[]>('get_page_labels').then(labels => setPageLabels(labels)).catch(() => {});
    });
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setXfaFlattenError(null);
    setXfaBannerDismissed(false);
  }, [pdfDoc?.id]);

  // Prime optional render fallback only for non-Tauri dev/test engines. The
  // desktop product renders through native Rust Tauri commands.
  useLayoutEffect(() => {
    if (isTauri || !renderFallback || !pdfDoc || !engine) return;

    const openPipeline: Promise<void> = engine.document.saveDocument(pdfDoc).then(result => {
      if (result.success && result.value instanceof Uint8Array) {
        return renderFallback.openDocument(pdfDoc, result.value);
      }
      // The desktop engine saves to disk and resolves with no bytes (void).
      // Without bytes the fallback renderer can't open the doc, so PageCanvas
      // falls back to normal rendering via the active engine. This is the
      // expected path on desktop — never reject (an unhandled rejection here
      // crashes the whole app via the global error boundary).
      return undefined;
    }).catch((err: unknown) => {
      console.warn('[PDFluent] Render fallback priming skipped, using direct render:', err);
      return undefined;
    });

    renderFallback.preregisterDocument(pdfDoc, openPipeline);

    return () => {
      renderFallback.closeDocument(pdfDoc);
    };
  }, [pdfDoc?.id, documentVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAttachments([]);
    if (!pdfDoc || !isTauri) return;
    void import('../lib/commandBridge').then(({ invokeCommand: invoke }) => {
      void invoke<AttachmentInfo[]>('list_attachments').then(list => setAttachments(list)).catch(() => {});
    });
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLayers([]);
    setLayerVisibility(new Map());
    if (!pdfDoc || !isTauri) return;
    void import('../lib/commandBridge').then(({ invokeCommand: invoke }) => {
      void invoke<LayerInfo[]>('list_layers').then(list => {
        setLayers(list);
        setLayerVisibility(new Map(list.map(layer => [layer.id, true])));
      }).catch(() => {});
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
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().setTitle(title);
      } catch {
        // The window title is cosmetic. Never let a failed set-title (e.g. a
        // missing capability on a given build) bubble up and crash the app.
      }
    })();
  }, [fileName, isDirty]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  const canvasContainerRef = useKeyboardShortcuts({
    pageCount,
    pageIndex,
    setPageIndex,
    scrollToPage,
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
    onUndo: undoEdit,
    onRedo: redoEdit,
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
    handleDeleteCurrentPage,
  });

  // A document opens fitted to the window and stays fitted through resizes
  // until the reader zooms it by hand (Settings > View > Default zoom).
  const firstPageSize = pdfDoc?.pages[0]?.size ?? null;
  const { fitNow: fitZoomToWindow } = useAutoFitZoom({
    containerRef: canvasContainerRef,
    documentId: pdfDoc?.id ?? null,
    firstPage: firstPageSize ? { width: firstPageSize.width, height: firstPageSize.height } : null,
    preference: appSettings.defaultZoom,
    manual: zoomManual,
    zoom,
    setAutoZoom,
    setZoom,
  });

  // ---------------------------------------------------------------------------
  // Continuous scroll: update pageIndex based on scroll position
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !pdfDoc) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const containerRect = container!.getBoundingClientRect();
        const viewportMid = containerRect.top + containerRect.height / 2;
        let closestIdx = 0;
        let closestDist = Infinity;
        pageRefs.current.forEach((el, idx) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const elMid = rect.top + rect.height / 2;
          const dist = Math.abs(elMid - viewportMid);
          if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
        });
        setPageIndex(closestIdx);
      }, 80);
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [pdfDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // File open helpers
  // ---------------------------------------------------------------------------

  const welcomeFileInputRef = useRef<HTMLInputElement | null>(null);

  // Opens a PDF via OS dialog (Tauri) or hidden file input (browser)
  const handleOpenFile = useCallback(async () => {
    if (isTauri) {
      const path = await pickPdfPath();
      if (typeof path === 'string') await handleLoadDocument(path);
    } else {
      welcomeFileInputRef.current?.click();
    }
  }, [handleLoadDocument]);

  const handleCloseDocumentWithGuard = useCallback(() => {
    // With documents in tabs this closes the tab on screen and asks first when
    // it has unsaved changes.
    if (documentTabs.tabs.length > 0) {
      void documentTabs.requestCloseActive();
      return;
    }
    if (isDirty) {
      pendingActionRef.current = () => { closeDocument(); setCurrentFilePath(null); };
      setUnsavedDialogOpen(true);
      return;
    }
    closeDocument();
    setCurrentFilePath(null);
  }, [isDirty, closeDocument, pendingActionRef, setUnsavedDialogOpen, documentTabs]);

  // The latest handlers, read by one long-lived listener. Re-subscribing on
  // every change of a handler left listeners behind that Tauri could not
  // remove ("listeners[eventId]" undefined), and File > Open then showed the
  // picker once per leaked listener (J-15).
  const menuEventRef = useRef<(payload: string) => void>(() => undefined);
  menuEventRef.current = (payload: string): void => {
    switch (payload) {
      case 'file_open':
      case 'file_new_tab':
        window.setTimeout(() => { void handleOpenFile(); }, 0);
        break;
      case 'window_next_tab':
        void documentTabs.switchRelative(1);
        break;
      case 'window_previous_tab':
        void documentTabs.switchRelative(-1);
        break;
      case 'file_save':
        // A failed save is already on screen (invokeCommand); keep the
        // rejection away from the crash reporter.
        handleRuntimeSave().catch((error: unknown) => {
          console.warn('file_save failed (already reported)', error);
          void logToApp(`file_save failed (already reported): ${describeError(error)}`);
        });
        break;
      case 'file_save_as':
        void handleSaveAs();
        break;
      case 'file_close':
        handleCloseDocumentWithGuard();
        break;
      case 'file_print':
        void printDocument();
        break;
      case 'edit_undo':
      case 'edit_redo': {
        // The menu accelerator reaches here even while a field or the inline
        // editor has focus; there the field's own history applies.
        if (isTypingTarget(document.activeElement)) {
          document.execCommand(payload === 'edit_undo' ? 'undo' : 'redo');
        } else if (payload === 'edit_undo') {
          void undoEdit();
        } else {
          void redoEdit();
        }
        break;
      }
      case 'view_zoom_in':
        setZoom(z => Math.min(4, Number((z + 0.25).toFixed(2))));
        break;
      case 'view_zoom_out':
        setZoom(z => Math.max(0.25, Number((z - 0.25).toFixed(2))));
        break;
      case 'view_actual_size':
        setZoom(1);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      const stop = await listen<string>('menu-event', (event) => { menuEventRef.current(event.payload); });
      if (cancelled) releaseListener(stop);
      else unlisten = stop;
    })();

    return () => { cancelled = true; releaseListener(unlisten); };
  }, []);

  const handleWelcomeFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result;
      if (buffer instanceof ArrayBuffer) void handleLoadDocument(buffer);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
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
    closeDocumentWithGuard: handleCloseDocumentWithGuard,
    setCurrentFilePath,
    setUnsavedDialogOpen,
    pendingActionRef,
    recentFiles,
    handleLoadDocument,
    onCheckForUpdates: handleCheckForUpdates,
    setSettingsOpen,
  });


  // Called by ModeToolbar / OrganizeGrid after a successful page mutation.
  const handlePageMutation = useCallback((newPageCount: number, navigateTo?: number) => {
    updatePageCount(newPageCount);
    if (navigateTo !== undefined) {
      setPageIndex(Math.min(Math.max(0, navigateTo), Math.max(0, newPageCount - 1)));
    } else {
      setPageIndex(prev => Math.min(prev, Math.max(0, newPageCount - 1)));
    }
    bumpDocument();
    markDirty();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'page_mutated', authorName, navigateTo ?? -1, '', i18n.t('events.pageMutated')
    )));
  }, [updatePageCount, authorName, markDirty, bumpDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire the ref so handleDeleteCurrentPage (declared earlier) can call handlePageMutation.
  handlePageMutationRef.current = handlePageMutation;

  const handleFlattenXfa = useCallback(async () => {
    if (!pdfDoc || !engine || xfaFlattenBusy) return;
    setXfaFlattenBusy(true);
    setXfaFlattenError(null);
    const result = await engine.transform.flattenXfa(pdfDoc);
    if (result.success) {
      replaceDocument(result.value, true);
      bumpDocument();
      setPageIndex(0);
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'page_mutated', authorName || 'User', -1, '', i18n.t('xfa.convertedToStandard')
      )));
    } else {
      setXfaFlattenError(i18n.t('xfa.convertFailed', { message: result.error.message }));
    }
    setXfaFlattenBusy(false);
  }, [pdfDoc, engine, xfaFlattenBusy, replaceDocument, authorName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Dev-only test hooks
  // ---------------------------------------------------------------------------

  const loadDocumentRef = useRef(handleLoadDocument);
  useEffect(() => { loadDocumentRef.current = handleLoadDocument; }, [handleLoadDocument]);
  const textSpansRef = useRef(textSpans);
  useEffect(() => { textSpansRef.current = textSpans; }, [textSpans]);

  // Open PDFs handed to us by the OS: Finder double-click, "Open With", file
  // association, or a command-line path. macOS sends these via the Rust
  // "open-file" event; cold-start / Windows / Linux paths come from the
  // take_pending_open command. We only CAPTURE the path here — the OS open can
  // arrive before the engine has finished initialising, so the actual load is
  // deferred to the effect below that waits for engine readiness.
  // Several files can arrive together (a multi-file Open With, a launch with
  // several arguments); each gets a tab, so they are queued, not replaced.
  const [pendingOpenPaths, setPendingOpenPaths] = useState<string[]>([]);
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const [{ listen }, { invokeCommand: invoke }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('../lib/commandBridge'),
      ]);
      if (cancelled) return;
      const stop = await listen<string>('open-file', (e) => {
        if (e.payload) {
          const path = e.payload;
          setPendingOpenPaths((queue) => [...queue, path]);
        }
      });
      if (cancelled) { releaseListener(stop); return; }
      unlisten = stop;
      const pending = await invoke<string[]>('take_pending_opens').catch(() => [] as string[]);
      if (!cancelled && pending.length > 0) setPendingOpenPaths((queue) => [...queue, ...pending]);
    })();
    return () => { cancelled = true; releaseListener(unlisten); };
  }, []);
  // Load a captured OS-open path once the engine is ready.
  // One at a time: a tab opens only after the one before it, and a path
  // already open comes to the front instead (tabState.findTabByPath).
  const openingQueuedRef = useRef(false);
  useEffect(() => {
    if (pendingOpenPaths.length === 0 || !engine || engineLoading || openingQueuedRef.current) return;
    openingQueuedRef.current = true;
    const [path, ...rest] = pendingOpenPaths;
    setPendingOpenPaths(rest);
    void (async () => {
      try {
        if (path) await loadDocumentRef.current(path);
      } finally {
        openingQueuedRef.current = false;
        // Another file may have arrived while this one opened.
        setPendingOpenPaths((queue) => [...queue]);
      }
    })();
  }, [pendingOpenPaths, engine, engineLoading]);

  useEffect(() => {
    if (!import.meta.env.DEV || !engine) return;
    window.__pdfluent_test__ = {
      loadDocument: (source) => loadDocumentRef.current(source),
      getTextSpans: () => textSpansRef.current,
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

  // ── Loading / error states ────────────────────────────────────────────────

  if (engineLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm gap-2">
        <Loader2Icon className="w-4 h-4 animate-spin" />
        {i18n.t('common.loading')}
      </div>
    );
  }

  if (engineTimedOut || engineError || !engine) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-sm px-8 text-center gap-4">
        <span className="text-destructive">
          {engineTimedOut ? i18n.t('engine.initTimeout') : `${i18n.t('engine.initFailed')} ${engineError ?? ''}`}
        </span>
        <button
          type="button"
          className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
          onClick={() => { window.location.reload(); }}
        >
          {i18n.t('engine.reload')}
        </button>
      </div>
    );
  }

  // -- Full V3 design shell ---------------------------------------------------

  return (
    <TaskQueueProvider>
      <div
        className="v3-root"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div
            className="v3-drop-overlay fixed inset-0 z-50"
            onDragOver={(event) => { event.preventDefault(); }}
            onDragLeave={() => { setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <div className="v3-drop-card">
              <FileTextIcon aria-hidden="true" />
              <span>{i18n.t('welcome.dropPdfHere')}</span>
            </div>
          </div>
        )}

        <EditorV3Shell
          documentTabs={isTauri ? (
            <DocumentTabBar
              tabs={documentTabs.tabs}
              activeId={documentTabs.activeId}
              busy={documentTabs.switching}
              onSelect={(id) => { void documentTabs.switchTo(id); }}
              onClose={(id) => { void documentTabs.requestClose(id); }}
              onMove={documentTabs.moveTab}
              onNew={() => { void handleOpenFile(); }}
            />
          ) : undefined}
          themeDark={themeDark}
          onToggleTheme={handleToggleTheme}
          canvasRef={canvasContainerRef}
          fileName={fileName}
          pageIndex={pageIndex}
          pageCount={pageCount}
          zoom={zoom}
          mode={mode}
          isDirty={isDirty}
          currentFilePath={currentFilePath}
          readAloudText={readAloudText}

          authorName={authorName}
          thumbnails={thumbnails}
          outline={outline}
          pageLabels={pageLabels}
          comments={comments}
          activeCommentIdx={activeCommentIdx}
          onCommentSelect={handleCommentNav}
          onDeleteComment={handleDeleteComment}
          onUpdateComment={handleUpdateComment}
          onToggleResolved={handleToggleResolvedStatus}
          onAddReply={handleAddReply}
          onDeleteReply={handleDeleteReply}
          onNextComment={handleNextComment}
          onPrevComment={handlePrevComment}
          onResolveAll={handleResolveAll}
          onDeleteAllResolved={handleDeleteAllResolved}
          formFields={formFields}
          activeFieldIdx={activeFieldIdx}
          onFieldSelect={handleFieldNav}
          onSetFieldValue={handleSetFieldValue}
          formValidationErrors={formValidationErrors}
          onFormSubmit={handleFormSubmit}
          formFieldCount={pdfDoc?.xfaDetected ? 0 : formModel.fieldCount}
          onFlattenForm={handleFlattenForm}
          flattenFormBusy={flattenFormBusy}
          pdfDoc={pdfDoc ?? null}
          onMetadataChange={handleMetadataChange}
          selectedAnnotation={selectedAnnotation}
          annotationAppearance={annotationAppearance}
          onAnnotationAppearanceChange={setAnnotationAppearance}
          onDeleteSelectedAnnotation={handleDeleteSelectedAnnotation}
          onUpdateAnnotationColor={handleUpdateAnnotationColor}
          onUpdateAnnotationText={handleUpdateAnnotationText}
          onReplaceAnnotationImage={handleReplaceAnnotationImage}
          onPlaceAnnotation={handlePlaceAnnotation}
          onAddNote={handleAddNote}
          redactions={redactions}
          documentIssues={documentIssues}
          onApplyRedactions={handleApplyRedactions}
          onDeleteRedaction={handleDeleteSelectedAnnotation}
          onJumpToRedaction={setPageIndex}
          onRedactSearch={handleRedactSearch}
          onRedactMetadata={handleRedactMetadata}
          scannedPageIndices={scannedPageIndices}
          ocrRunning={ocrRunning}
          ocrProgress={ocr.runProgress}
          ocrLastReport={ocr.lastReport}
          ocrComponentInstalled={ocr.status?.installed ?? null}
          attachments={attachments}
          onExtractAttachment={handleExtractAttachment}
          onAddAttachment={handleAddAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          layers={layers}
          layerVisibility={layerVisibility}
          onToggleLayer={handleToggleLayer}
          activeAnnotationTool={activeAnnotationTool}
          canUndo={canUndo}
          canRedo={canRedo}
          searchResultCount={searchResults.length}
          activeSearchResultIndex={activeSearchResultIdx}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          onOpenFile={handleLoadDocument}
          onSaveComplete={clearDirty}
          onSaveAs={handleRuntimeSaveAs}
          onCloseDocument={handleCloseDocumentWithGuard}
          onUndo={() => { void undoEdit(); }}
          onRedo={() => { void redoEdit(); }}
          onModeChange={(nextMode) => { setMode(nextMode); setAllToolsOpen(false); }}
          onOpenAllTools={() => { setAllToolsOpen(true); }}
          onOpenExport={(format) => {
            if (format) {
              setInitialExportFormat(format as ExportFormat);
            } else {
              setInitialExportFormat('pdf');
            }
            setExportOpen(true);
          }}
          onOpenCommandPalette={() => { setCommandPaletteOpen(true); }}
          onOpenSearch={() => { setIsSearchOpen(open => !open); }}
          onSearchQueryChange={setSearchQuery}
          onRunSearch={(query) => { void runSearch(query); }}
          onNextSearchResult={nextSearchResult}
          onPrevSearchResult={prevSearchResult}
          onAnnotationToolChange={setActiveAnnotationTool}
          onAddComment={handleAddComment}
          onFormatCommand={handleFormatCommand}
          editTypeface={editingTextTargetId ? { value: draftFontId, onChange: setDraftFontId } : null}
          editFontSize={editingTextTargetId ? (draftFontSize ?? selectedTextTarget?.lines[0]?.spans[0]?.fontSize ?? null) : null}
          onNavigatePage={navigateToPage}
          onZoomChange={setZoom}
          onFitToView={fitZoomToWindow}
          zoomPresetsOpen={zoomPresetsOpen}
          setZoomPresetsOpen={setZoomPresetsOpen}
          onOpenGoToPage={() => { setGoToPageOpen(true); }}
          onRunOcr={() => { if (!isTauri) return; void ocr.requestRun('scanned'); }}
          onProtectDocument={() => { setMode('protect'); setAllToolsOpen(false); }}
          onWatermark={() => { setMode('protect'); setAllToolsOpen(false); }}
          onCheckForUpdates={handleCheckForUpdates}
          onDocumentMutated={handleDocumentMutated}
          onDocumentEdited={markDirty}
          onDocumentPathChanged={handleDocumentPathChanged}
          contentRevision={contentRevision}
          requestedPanel={requestedPanel}
          onRequestedPanelHandled={handleRequestedPanelHandled}
          onAuthorChange={handleAuthorChange}
          onReorderPages={handleReorderPages}
          onTtsBoundary={(ci, cl) => { setTtsCharIndex(ci < 0 ? -1 : ci); void cl; }}
          selectedTextTarget={selectedTextTarget}
          formatState={formatState}
        >
          {docLoading && (
            <div className="v3-canvas-state">
              <Loader2Icon className="spin" aria-hidden="true" />
              <span>{i18n.t('welcome.loadingDocument')}</span>
            </div>
          )}

          {/* Outside the welcome section, so "Open another file" on the
              open-error panel can reach it in the browser build too. */}
          <input
            ref={welcomeFileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleWelcomeFileInputChange}
            aria-label={i18n.t('welcome.openFileAria')}
          />

          {docError && !docLoading && (
            <OpenErrorPanel
              code={docError.code}
              onOpenAnother={() => { dismissDocError(); void handleOpenFile(); }}
              onRetry={() => {
                dismissDocError();
                const failed = documentTabs.lastFailedPath() ?? currentFilePath;
                if (failed) void handleLoadDocument(failed);
              }}
            />
          )}

          {/* data-testid="welcome-screen": every e2e helper waits for it before
              doing anything. It lived on components/WelcomeScreen.tsx, which
              nothing renders, so the wait timed out and every spec built on the
              helpers failed at its first line. */}
          {!pdfDoc && !docLoading && !docError && (
            <section className="welcome-v3" data-testid="welcome-screen">
              <div className="welcome-mark">P</div>
              <h1>PDFluent Editor</h1>
              <p>{i18n.t('welcome.v3Subtitle')}</p>
              <div className="welcome-actions">
                <button className="share-btn" type="button" onClick={() => { void handleOpenFile(); }}>
                  <FileTextIcon aria-hidden="true" />
                  {i18n.t('welcome.openFile')}
                </button>
                {recentFiles.length > 0 && (
                  <button className="iconbtn text" type="button" onClick={clearRecentFiles}>
                    {i18n.t('welcome.clearRecent')}
                  </button>
                )}
              </div>
              {recentFiles.length > 0 && (
                <div className="recent-v3">
                  <div className="recent-title">{i18n.t('welcome.recentShort')}</div>
                  {recentFiles.slice(0, 5).map(path => {
                    const name = path.split(/[\\/]/).pop() || path;
                    return (
                      <div className="recent-row" key={path}>
                        <button type="button" onClick={() => { void handleLoadDocument(path); }}>
                          <FileTextIcon aria-hidden="true" />
                          <span>{name}</span>
                        </button>
                        <button type="button" className="recent-remove" onClick={() => removeRecentFile(path)} aria-label={i18n.t('welcome.removeRecentAria', { name })}>
                          <XIcon aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {pdfDoc && !docLoading && mode === 'organize' && (
            <div className="organize-v3">
              <div className="organize-back-bar">
                <button
                  className="organize-back-btn"
                  type="button"
                  onClick={() => setMode('read')}
                  aria-label={i18n.t('welcome.backToDocument')}
                >
                  ← {i18n.t('welcome.backToDocument')}
                </button>
              </div>
              <OrganizeGrid
                thumbnails={thumbnails}
                pageCount={pageCount}
                onPageMutation={handlePageMutation}
                onMarkDirty={markDirty}
              />
            </div>
          )}

          {pdfDoc && scriptConsent.asking && scriptConsent.status && mode !== 'organize' && (
            <ScriptConsentBar
              status={scriptConsent.status}
              busy={scriptConsent.busy}
              alwaysAvailable={scriptConsent.alwaysAvailable}
              onRunOnce={scriptConsent.runOnce}
              onRunAlways={scriptConsent.runAlways}
              onDontRun={scriptConsent.dontRun}
            />
          )}

          {/* Calm, form-focused bar — replaces the old "active content"
              warning. Capability decisions (links) happen at point of use,
              not on open, so opening a form raises no alarm. */}
          {pdfDoc && formModel.hasForm && !pdfDoc.xfaDetected && mode !== 'organize' && (
            <FormBar
              fieldCount={formModel.fieldCount}
              highlight={highlightFields}
              onToggleHighlight={() => setHighlightFields(h => !h)}
              onJumpToFirst={() => {
                const first = formModel.tabOrder[0];
                if (first) formModel.focusField(first);
              }}
              autoOpenLinks={autoOpenLinks}
              onToggleAutoOpenLinks={() => persistAutoOpenLinks(autoOpenLinks ? null : true)}
            />
          )}

          {/* XFA documents can be filled in place (static Phase-1 values, see
              XFA_INTERACTIVE_FILL in xfaFillGate.ts); converting to a standard
              PDF remains the path to edit and search them. The product makes no
              dynamic-XFA Acrobat-parity claim: event scripts do not run. */}
          {pdfDoc && pdfDoc.xfaDetected && !xfaBannerDismissed && (
            <XfaBanner
              fillExperimental={XFA_INTERACTIVE_FILL}
              flattenError={xfaFlattenError}
              busy={xfaFlattenBusy}
              onConvert={() => { void handleFlattenXfa(); }}
              onDismiss={() => setXfaBannerDismissed(true)}
            />
          )}

          {pdfDoc && !docLoading && mode !== 'organize' && (
            // dir="ltr": the pages are the document's own geometry. A
            // right-to-left UI mirrors the chrome around them, never the pages.
            <div className="v3-page-stack" dir="ltr" {...stateDataAttr(annotationInteractionState)}>
              {Array.from({ length: pageCount }, (_, i) => {
                const pageW = pdfDoc.pages[i]?.size.width ?? 595;
                const pageH = pdfDoc.pages[i]?.size.height ?? 842;
                const inRenderWindow = Math.abs(i - pageIndex) <= renderRadius;
                const isCurrentPage = i === pageIndex;
                return (
                  <div
                    key={i}
                    ref={el => { pageRefs.current[i] = el; }}
                    data-page-index={i}
                    className={isCurrentPage ? 'page current' : 'page'}
                    style={{ width: pageW * zoom, height: pageH * zoom }}
                  >
                    {inRenderWindow && (
                      <>
                        <PageCanvas
                          key={i}
                          engine={engine}
                          document={pdfDoc}
                          pageIndex={i}
                          zoom={zoom}
                          textSpans={isCurrentPage ? textSpans : []}
                          pageWidthPt={pageW}
                          pageHeightPt={pageH}
                          highlights={isCurrentPage ? activeHighlights : []}
                          clickableAnnotations={isCurrentPage ? pageAnnotationMarks : []}
                          onAnnotationClick={isCurrentPage ? handleAnnotationClick : undefined}
                          onAnnotationRectChange={isCurrentPage ? (id, rect) => { void handleUpdateAnnotationRect(id, rect); } : undefined}
                          searchHighlights={isCurrentPage ? pageSearchHighlights : []}
                          activeSearchHighlightIdx={isCurrentPage ? activeSearchHighlightIdx : -1}
                          selectedAnnotationId={isCurrentPage ? selectedAnnotationId : null}
                          activeAnnotationTool={activeAnnotationTool}
                          onTextSelection={isCurrentPage ? handleTextSelection : undefined}
                          onRectDraw={isCurrentPage ? handleRectDraw : undefined}
                          onInkDraw={isCurrentPage ? handleInkDraw : undefined}
                          onRedactionDraw={isCurrentPage ? handleRedactionDraw : undefined}
                          textStructure={isCurrentPage ? pageTextStructure : null}
                          textInteractionActive={isCurrentPage && textInteractionActive}
                          selectedTextTarget={isCurrentPage ? selectedTextTarget : null}
                          onTextTargetSelect={isCurrentPage ? handleTextTargetSelect : undefined}
                          onTextTargetDoubleClick={isCurrentPage ? handleDoubleClickForEdit : undefined}
                          onTextTargetDoubleClickAt={isCurrentPage ? (target, clientX, clientY) => {
                            setLastDoubleClickAt({ clientX, clientY });
                            handleDoubleClickForEdit(target);
                          } : undefined}
                          editingParagraphBounds={isCurrentPage && editingTextTargetId ? selectedTextTarget?.rect ?? null : null}
                          editingTargetId={isCurrentPage ? editingTextTargetId : null}
                          onSelectionMarkup={isCurrentPage ? createTextMarkupFromSelection : undefined}
                          onSelectionComment={isCurrentPage ? handleAddComment : undefined}
                          isEditMode={mode === 'edit'}
                          renderFallback={renderFallback}
                          renderRevision={pageRevision(revision, i)}
                          ttsHighlightSpanIndex={isCurrentPage ? ttsHighlightSpanIndex : -1}
                        />
                        {isCurrentPage && mode !== 'edit' && shouldShowContextBar(mode, selectedTextTarget) && selectedTextTarget && !editingTextTargetId && (
                          <TextContextBar
                            target={selectedTextTarget}
                            mode={mode}
                            pageHeightPt={pageH}
                            zoom={zoom}
                            onAction={handleTextContextAction}
                            editability={getEditability(selectedTextTarget, mode, activeAnnotationTool)}
                          />
                        )}
                        {isCurrentPage && editingTextTargetId && mode === 'edit' && selectedTextTarget?.id === editingTextTargetId && (
                          <>
                            <TextInlineEditor
                              target={selectedTextTarget}
                              draft={textDraft}
                              onDraftChange={setTextDraft}
                              onCommit={handleDraftCommit}
                              onCancel={handleDraftCancel}
                              pageHeightPt={pageH}
                              zoom={zoom}
                              cursorAtPoint={lastDoubleClickAt}
                              editorRef={editorDivRef}
                              maxLength={textEditMaxLength}
                            />
                            <TextEditFloatingPill
                              isBold={formatState.isBold}
                              isItalic={formatState.isItalic}
                              isUnderline={formatState.isUnderline}
                              isStrikethrough={formatState.isStrikethrough}
                              fontSize={selectedTextTarget?.lines[0]?.spans[0]?.fontSize ?? 12}
                              onBold={() => handleFormatCommand('bold')}
                              onItalic={() => handleFormatCommand('italic')}
                              onUnderline={() => handleFormatCommand('underline')}
                              onStrikethrough={() => handleFormatCommand('strikeThrough')}
                              onCommit={() => {
                                // Same normalized reader as the blur/Enter
                                // paths — raw innerText kept nbsp and DOM line
                                // breaks, so the checkmark could commit text
                                // that never matches the PDF content stream.
                                if (editorDivRef.current) {
                                  handleDraftCommit(readInlineEditorText(editorDivRef.current));
                                } else {
                                  handleDraftCommit(textDraft);
                                }
                              }}
                              onCancel={handleDraftCancel}
                              editingParagraphBounds={selectedTextTarget?.rect ?? null}
                              pageHeightPt={pageH}
                              zoom={zoom}
                            />
                          </>
                        )}
                        {/* First-class AcroForm overlay: every page in the
                            render window, in normal read mode (no Form Mode),
                            unless an annotation tool has pointer priority. */}
                        {formModel.hasForm && !pdfDoc?.xfaDetected && !activeAnnotationTool && (mode === 'read' || mode === 'forms') && (
                          <FormOverlay
                            fields={formModel.model}
                            pageIndex={i}
                            pageHeightPt={pageH}
                            zoom={zoom}
                            values={formModel.values}
                            highlight={highlightFields}
                            onTextChange={formModel.setTextLocal}
                            onTextCommit={(name, value) => { void formModel.commitText(name, value); }}
                            onCheckbox={(name, checked) => { void formModel.commitCheckbox(name, checked); }}
                            onRadio={(name, exportValue) => { void formModel.commitRadio(name, exportValue); }}
                            onChoice={(name, value) => { void formModel.commitChoice(name, value); }}
                            onMultiChoice={(name, values) => { void formModel.commitMultiChoice(name, values); }}
                            onTab={(name, dir) => {
                              const next = formModel.siblingField(name, dir);
                              if (next) formModel.focusField(next);
                            }}
                          />
                        )}
                        {/* XFA fill overlay (XFA_INTERACTIVE_FILL, on in release
                            builds — J-59): editable inputs over the rendered XFA
                            pages. Mutually exclusive with the AcroForm overlay
                            (gated on xfaDetected), so no double overlay or
                            FormBar leakage. */}
                        {XFA_INTERACTIVE_FILL && pdfDoc?.xfaDetected && xfaForm.hasXfaForm && !activeAnnotationTool && (mode === 'read' || mode === 'forms') && (
                          <XfaFormOverlay
                            fields={xfaForm.model}
                            pageIndex={i}
                            zoom={zoom}
                            values={xfaForm.values}
                            highlight={highlightFields}
                            onTextChange={xfaForm.setTextLocal}
                            onTextCommit={(name, value) => { xfaForm.commitText(name, value); }}
                            onCheckbox={(name, checked) => { xfaForm.commitCheckbox(name, checked); }}
                            onRadio={(name, onValue) => { xfaForm.commitRadio(name, onValue); }}
                            onTab={(name, dir) => {
                              const next = xfaForm.siblingField(name, dir);
                              if (next) xfaForm.focusField(next);
                            }}
                          />
                        )}
                        {/* Clickable /Link → /URI layer; activation runs the
                            capability-trust flow (ask-on-first-use). */}
                        {linkAnnotations.length > 0 && !activeAnnotationTool && (
                          <LinkOverlay
                            links={linkAnnotations}
                            pageIndex={i}
                            pageHeightPt={pageH}
                            zoom={zoom}
                            highlight={highlightFields && formModel.hasForm}
                            onActivate={handleLinkActivate}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </EditorV3Shell>

        {!__IS_MAS_BUILD__ && updateAvailable && (
          <Suspense fallback={null}>
            {/* Fixed overlay: the V3 shell fills the viewport, so an in-flow
                sibling would render below the fold and never be seen. Offset
                by the top-bar height (56px) so it never covers the brand/menu. */}
            <div className="fixed top-[56px] left-0 right-0 z-[80]">
              <UpdateBanner
                isVisible={updateAvailable}
                version={updateVersion}
                installing={updateInstalling}
                installed={updateInstalled}
                restartHint={updateRestartHint}
                onInstall={handleInstallUpdate}
                onRestart={handleRestartApp}
                onDismiss={() => { setUpdateAvailable(false); setUpdateInstalled(false); setUpdateRestartHint(null); }}
              />
            </div>
          </Suspense>
        )}

      {/* ── Export dialog ──────────────────────────────────────────────────── */}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog
            isOpen={exportOpen}
            onClose={() => { setExportOpen(false); }}
            onExportComplete={clearDirty}
            pageIndex={pageIndex}
            pageCount={pageCount}
            document={pdfDoc}
            engine={engine}
            initialFormat={initialExportFormat}
          />
        </Suspense>
      )}

      {/* ── Bottom task bar ────────────────────────────────────────────────── */}
      <BottomTaskBar />

      {updateCheckNotice && (
        <div
          data-testid="update-check-notice"
          className="fixed right-4 bottom-24 z-[71] rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
        >
          {updateCheckNotice === 'uptodate' ? i18n.t('update.upToDate') : i18n.t('update.checkFailed')}
        </div>
      )}

      {/* Why the last text edit did not land. Sits above the toast stack and
          stays until the next edit: a rejection that scrolls away is the same
          as "not replaced", which is what this replaces. */}
      {textMutationRejection && (
        <TextEditRejectionNotice
          rejection={textMutationRejection}
          onDismiss={dismissTextMutationRejection}
        />
      )}

      {appErrors.length > 0 && (
        <div
          data-testid="app-error-stack"
          className="fixed right-4 bottom-12 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        >
          {appErrors.slice(-3).map(error => (
            <AppErrorToast
              key={error.id}
              error={error}
              onDismiss={() => { setAppErrors(prev => clearError(prev, error.id)); }}
            />
          ))}
        </div>
      )}

      {/* ── All tools overlay ──────────────────────────────────────────────── */}
      {allToolsOpen && (
        <Suspense fallback={null}>
          <AllToolsPanel
            isOpen={allToolsOpen}
            onClose={() => { setAllToolsOpen(false); }}
            onModeSelect={setMode}
            onOpenPanel={setRequestedPanel}
          />
        </Suspense>
      )}

      {/* ── Command palette overlay ────────────────────────────────────────── */}
      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => { setCommandPaletteOpen(false); }}
            commands={commands}
            recentIds={recentCmdIds}
            onRun={handleCommandRun}
          />
        </Suspense>
      )}

      {/* ── Settings dialog ────────────────────────────────────────────────── */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanel
            isOpen={settingsOpen}
            onClose={() => { setSettingsOpen(false); }}
            settings={appSettings}
            onSettingsChange={handleSettingsChange}
            ocr={isTauri ? { status: ocr.status } : undefined}
          />
        </Suspense>
      )}

      {/* ── Keyboard shortcut sheet ────────────────────────────────────────── */}
      {shortcutSheetOpen && (
        <Suspense fallback={null}>
          <ShortcutSheet
            isOpen={shortcutSheetOpen}
            onClose={() => { setShortcutSheetOpen(false); }}
          />
        </Suspense>
      )}

      {/* ── Go-to-page dialog ──────────────────────────────────────────────── */}
      {goToPageOpen && (
        <Suspense fallback={null}>
          <GoToPageDialog
            isOpen={goToPageOpen}
            pageCount={pageCount}
            onNavigate={(idx) => { navigateToPage(idx); }}
            onClose={() => { setGoToPageOpen(false); }}
          />
        </Suspense>
      )}

      {recoveryOffer[0] && (
        <Suspense fallback={null}>
          <RecoveryDialog
            isOpen
            recoveryPath={recoveryOffer[0].originalPath ?? ''}
            originalFileName={recoveryDocumentLabel(recoveryOffer)}
            timestamp={new Date(recoveryOffer[0].savedAt * 1000).toLocaleString(i18n.language)}
            onRecover={() => { void handleRecoverCopy(); }}
            onDiscard={() => { void handleDiscardRecovery(); }}
            onClose={() => { setRecoveryOffer([]); }}
          />
        </Suspense>
      )}

      {passwordRequest && (
        <Suspense fallback={null}>
          <PasswordPromptDialog
            request={passwordRequest.request}
            onSubmit={(password) => { answerPasswordRequest(password); }}
            onCancel={() => { answerPasswordRequest(null); }}
          />
        </Suspense>
      )}

      {signedSaveDialogOpen && (
        <Suspense fallback={null}>
          <SignedSaveDialog
            isOpen={signedSaveDialogOpen}
            onSaveCopy={() => { void handleSaveUnsignedCopy(); }}
            onCancel={() => { setSignedSaveDialogOpen(false); }}
          />
        </Suspense>
      )}

      {/* ── Unsaved changes dialog ──────────────────────────────────────────── */}
      {unsavedDialogOpen && (
        <Suspense fallback={null}>
          <UnsavedChangesDialog
            isOpen={unsavedDialogOpen}
            canSave={isTauri}
            onSave={() => { void handleUnsavedSave(); }}
            onDiscard={handleUnsavedDiscard}
            onCancel={handleUnsavedCancel}
            documentName={documentTabs.tabs.length > 1 ? fileName ?? undefined : undefined}
          />
        </Suspense>
      )}

      {pendingExternalLink && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleExternalLinkCancel}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-labelledby="external-link-dialog-title"
            aria-modal="true"
            data-testid="external-link-dialog"
            className="fixed left-1/2 top-1/3 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          >
            <div className="px-5 py-4">
              <h2 id="external-link-dialog-title" className="text-sm font-semibold text-foreground">
                {i18n.t('externalLink.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {i18n.t('externalLink.dialogBody')}
              </p>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{pendingExternalLink.label}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{pendingExternalLink.href}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <button
                type="button"
                data-testid="external-link-cancel-btn"
                onClick={handleExternalLinkCancel}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {i18n.t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="external-link-open-btn"
                onClick={handleExternalLinkConfirm}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {i18n.t('externalLink.openLink')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Capability trust for a clicked /Link: ask once, with "always allow"
          that flips the persistent (visible, reversible) Form Bar toggle. */}
      {pendingLinkChoice && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setPendingLinkChoice(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-labelledby="link-choice-dialog-title"
            aria-modal="true"
            data-testid="link-choice-dialog"
            className="fixed left-1/2 top-1/3 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          >
            <div className="px-5 py-4">
              <h2 id="link-choice-dialog-title" className="text-sm font-semibold text-foreground">
                {i18n.t('linkChoice.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {i18n.t('linkChoice.body')}
              </p>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="break-all text-xs text-muted-foreground">{pendingLinkChoice.uri}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <button
                type="button"
                data-testid="link-choice-cancel-btn"
                onClick={() => setPendingLinkChoice(null)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {i18n.t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="link-choice-always-btn"
                onClick={() => {
                  const uri = pendingLinkChoice.uri;
                  persistAutoOpenLinks(true);
                  setPendingLinkChoice(null);
                  void openExternalUri(uri);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                {i18n.t('linkChoice.alwaysAllow')}
              </button>
              <button
                type="button"
                data-testid="link-choice-once-btn"
                onClick={() => {
                  const uri = pendingLinkChoice.uri;
                  setPendingLinkChoice(null);
                  void openExternalUri(uri);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {i18n.t('linkChoice.openOnce')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </TaskQueueProvider>
  );
}
