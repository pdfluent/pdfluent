// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useRef, useEffect, useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PdfDocument } from '../../core/document';
import type { DocumentTabsApi } from '../tabs/useDocumentTabs';
import { rememberFileAccess, prepareRecentOpen, releaseFileAccess } from '../state/fileBookmarks';
import { saveAsWithDialog, settleUnsavedWithSave, type SaveAsResult } from '../state/saveFlow';
import { CLOSE_REQUESTED_EVENT, handleCloseRequest, type CloseRequestPayload } from '../state/closeGuard';
import { releaseListener } from '../../lib/releaseListener';

const isTauri = isTauriRuntime();

/** Fire a command whose failure invokeCommand shows; keep it off the crash reporter. */
async function invokeReported(command: string, args?: Record<string, unknown>): Promise<void> {
  try {
    const { invokeCommand } = await import('../../lib/commandBridge');
    await invokeCommand(command, args);
  } catch (error) {
    console.warn(`${command} failed (already reported)`, error);
  }
}

/** Log a failure invokeCommand has already shown, so the log keeps the caller. */
async function logReportedFailure(command: string, error: unknown): Promise<void> {
  const { logToApp, describeError } = await import('../../lib/commandBridge');
  await logToApp(`${command} failed (already reported): ${describeError(error)}`);
}

export function useDocumentLifecycle(
  isDirty: boolean,
  loadDocument: (source: string | ArrayBuffer) => Promise<unknown>,
  clearDirty: () => void,
  addRecentFile: (path: string) => void,
  pdfDoc: PdfDocument | null,
  pageCount: number,
  currentFilePath: string | null,
  setCurrentFilePath: Dispatch<SetStateAction<string | null>>,
  setUnsavedDialogOpen: (open: boolean) => void,
  docLoading: boolean,
  /**
   * The tabs (J-90), filled in by the viewer once the hook exists: the tabs
   * need what this hook returns, so they cannot be an argument. While it is
   * empty (the browser build) there is one document and a file replaces it.
   */
  tabsRef: MutableRefObject<DocumentTabsApi | null>,
) {
  // ---------------------------------------------------------------------------
  // Refs for navigation / save guards
  // ---------------------------------------------------------------------------

  // Stores the action to run after the user resolves the unsaved-changes dialog
  const pendingActionRef = useRef<(() => void) | null>(null);
  // State resilience — tracks whether a save is in progress to block navigation.
  const isSavingRef = useRef(false);
  const docLoadingRef = useRef(docLoading);
  useEffect(() => { docLoadingRef.current = docLoading; }, [docLoading]);
  // The paths whose macOS security-scoped access we started for a recent
  // reopen, so each can be balanced with a stop when its document is closed.
  // With tabs (J-90) a parked document still has to be saved, so access is
  // kept for every open file, not just the one on screen.
  const scopedPathsRef = useRef<Set<string>>(new Set());
  // What the unsaved-changes dialog does on Cancel, or when the save it ran
  // failed; the tabs wait on it.
  const abandonRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Save As
  // ---------------------------------------------------------------------------

  // A failure rejects: the caller (task bar, unsaved-changes dialog) must know
  // the document was not saved. invokeCommand has already reported it.
  const handleSaveAsWithResult = useCallback(async (): Promise<SaveAsResult> => {
    if (!isTauri || pageCount === 0) return { status: 'cancelled' };
    if (docLoadingRef.current) return { status: 'cancelled' };
    isSavingRef.current = true;
    try {
      const { invokeCommand } = await import('../../lib/commandBridge');
      return await saveAsWithDialog(invokeCommand, (path) => {
        setCurrentFilePath(path);
        clearDirty();
        addRecentFile(path);
        // Remember a security-scoped bookmark so the saved file survives in Recent
        // across a sandboxed relaunch (no-op off macOS; blob stays in Rust).
        void rememberFileAccess(path);
      });
    } finally { isSavingRef.current = false; }
  }, [pageCount, clearDirty, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // For callers that await and report (task bar, Save button): rejects.
  const handleSaveAsOrThrow = useCallback(async (): Promise<void> => {
    await handleSaveAsWithResult();
  }, [handleSaveAsWithResult]);

  // For fire-and-forget callers (palette, shortcut, menu). The failure is
  // already on screen via invokeCommand; an unhandled rejection here would be
  // caught by the crash reporter and shown as a crash.
  const handleSaveAs = useCallback(async (): Promise<void> => {
    try {
      await handleSaveAsWithResult();
    } catch (error) {
      void logReportedFailure('save_pdf_as_dialog', error);
    }
  }, [handleSaveAsWithResult]);

  // ---------------------------------------------------------------------------
  // Document open / close
  // ---------------------------------------------------------------------------

  // Re-acquire sandbox access for a recent file reopened by stored path before
  // loading. No-op for fresh picks (no stored bookmark, already granted) /
  // non-macOS.
  const beginAccess = useCallback(async (path: string): Promise<void> => {
    const granted = await prepareRecentOpen(path);
    if (granted) scopedPathsRef.current.add(path);
  }, []);

  /** Balance `beginAccess` for a file whose document was closed. */
  const releaseAccess = useCallback((path: string): void => {
    if (scopedPathsRef.current.delete(path)) void releaseFileAccess(path);
  }, []);

  // Wrap loadDocument to capture the file path when opened from disk.
  // In the desktop app a file opens in a tab, or the tab that already has it
  // comes to the front; the document on screen is parked, so there is nothing
  // to ask about. Elsewhere one document is open at a time and a new file
  // replaces it, after a guard: ask for confirmation when unsaved changes
  // would be discarded.
  const handleLoadDocument = useCallback(async (source: string | ArrayBuffer): Promise<void> => {
    const tabs = tabsRef.current;
    if (tabs && typeof source === 'string') {
      await tabs.openPath(source);
      return;
    }
    if (isDirty) {
      pendingActionRef.current = () => {
        setCurrentFilePath(typeof source === 'string' ? source : null);
        void (async () => {
          if (typeof source === 'string') await beginAccess(source);
          void loadDocument(source);
        })();
      };
      setUnsavedDialogOpen(true);
      return;
    }
    setCurrentFilePath(typeof source === 'string' ? source : null);
    if (typeof source === 'string') await beginAccess(source);
    await loadDocument(source);
  }, [isDirty, loadDocument, beginAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record a file path in the recent-files list only when a load succeeds.
  const lastDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfDoc) { lastDocIdRef.current = null; return; }
    if (!currentFilePath) return;
    if (pdfDoc.id === lastDocIdRef.current) return;
    lastDocIdRef.current = pdfDoc.id;
    addRecentFile(currentFilePath);
    // Remember a security-scoped bookmark so this file can be reopened from
    // Recent after a sandboxed relaunch (no-op off macOS; blob stays in Rust).
    void rememberFileAccess(currentFilePath);
  }, [pdfDoc?.id, currentFilePath, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Balance security-scoped access when the last document is closed
  // (pdfDoc → null). A tab's file is released when its tab closes; app exit is
  // balanced in the Rust run loop.
  useEffect(() => {
    if (pdfDoc) return;
    for (const path of scopedPathsRef.current) void releaseFileAccess(path);
    scopedPathsRef.current.clear();
  }, [pdfDoc]);

  // Close / quit guard (J-81). The backend holds the window's close button,
  // Alt-F4 and Quit while there are unsaved changes; it learns about them here.
  // With several documents the backend is told about unsaved changes in any
  // of them (the viewer sends it, where the tabs are known).
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      const stop = await listen<CloseRequestPayload>(CLOSE_REQUESTED_EVENT, (event) => {
        void invokeReported('acknowledge_close_request');
        const tabs = tabsRef.current;
        handleCloseRequest({
          isDirty: () => (tabs ? tabs.anyDirty : isDirtyRef.current),
          pending: pendingActionRef,
          openUnsavedDialog: () => { setUnsavedDialogOpen(true); },
          confirmClose: () => { void invokeReported('confirm_close'); },
          // Several documents with unsaved changes: ask about each before the app goes.
          reviewUnsaved: tabs && tabs.tabs.some((t) => t.dirty)
            ? () => tabs.reviewUnsavedTabs()
            : undefined,
        }, event.payload);
      });
      if (cancelled) releaseListener(stop);
      else unlisten = stop;
    })();
    return () => { cancelled = true; releaseListener(unlisten); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser builds only: Tauri does not consult beforeunload, which is why the
  // guard above exists.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [isDirty]);

  // Unsaved-changes dialog handlers
  // The pending action runs only once the changes are on disk. A failed save
  // is already on screen (invokeCommand); the document stays open and dirty.
  const handleUnsavedSave = useCallback(async () => {
    const { invokeCommand } = await import('../../lib/commandBridge');
    const result = await settleUnsavedWithSave(pendingActionRef, {
      currentFilePath,
      saveToPath: async (path) => {
        await invokeCommand('save_pdf', { path });
        clearDirty();
      },
      saveAs: handleSaveAsWithResult,
    }, () => { setUnsavedDialogOpen(false); });
    if (result.proceed) {
      abandonRef.current = null;
    } else {
      // Cancelled at the save panel, or the save failed: whoever asked stays
      // where it is, and the error (if any) is already on screen.
      const abandon = abandonRef.current;
      abandonRef.current = null;
      abandon?.();
    }
    if (!result.proceed && result.reason === 'failed') void logReportedFailure('save_pdf', result.error);
  }, [currentFilePath, clearDirty, handleSaveAsWithResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnsavedDiscard = useCallback(() => {
    setUnsavedDialogOpen(false);
    abandonRef.current = null;
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialogOpen(false);
    pendingActionRef.current = null;
    const abandon = abandonRef.current;
    abandonRef.current = null;
    abandon?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Open the unsaved-changes dialog for the document on screen. Save (when it
   * worked) and Don't save run `proceed`; Cancel, or a save that failed, runs
   * `abandon`.
   */
  const askAboutUnsavedChanges = useCallback((proceed: () => void, abandon: () => void): void => {
    pendingActionRef.current = proceed;
    abandonRef.current = abandon;
    setUnsavedDialogOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    pendingActionRef,
    isSavingRef,
    docLoadingRef,
    handleSaveAs,
    handleSaveAsOrThrow,
    handleSaveAsWithResult,
    handleLoadDocument,
    beginAccess,
    releaseAccess,
    askAboutUnsavedChanges,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  };
}
