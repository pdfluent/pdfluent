// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { PdfDocument } from '../../core/document';
import { rememberFileAccess, prepareRecentOpen, releaseFileAccess } from '../state/fileBookmarks';

const isTauri = isTauriRuntime();

export function useDocumentLifecycle(
  isDirty: boolean,
  loadDocument: (source: string | ArrayBuffer) => Promise<void>,
  clearDirty: () => void,
  addRecentFile: (path: string) => void,
  pdfDoc: PdfDocument | null,
  pageCount: number,
  currentFilePath: string | null,
  setCurrentFilePath: Dispatch<SetStateAction<string | null>>,
  setUnsavedDialogOpen: (open: boolean) => void,
  docLoading: boolean,
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
  // The path whose macOS security-scoped access we started for a recent reopen,
  // so we can balance it with a stop on document change / close.
  const activeScopedPathRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Save As
  // ---------------------------------------------------------------------------

  const handleSaveAs = useCallback(async () => {
    if (!isTauri || pageCount === 0) return;
    if (docLoadingRef.current) return;
    isSavingRef.current = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string | null>('save_pdf_as_dialog');
      if (!path) return;
      setCurrentFilePath(path);
      clearDirty();
      addRecentFile(path);
      // Remember a security-scoped bookmark so the saved file survives in Recent
      // across a sandboxed relaunch (no-op off macOS; blob stays in Rust).
      void rememberFileAccess(path);
    } catch { /* silent — task queue lives in TopBar, not here */ }
    finally { isSavingRef.current = false; }
  }, [pageCount, clearDirty, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Document open / close
  // ---------------------------------------------------------------------------

  // Wrap loadDocument to capture the file path when opened from disk.
  // Guard: ask for confirmation when unsaved changes would be discarded.
  const handleLoadDocument = useCallback(async (source: string | ArrayBuffer): Promise<void> => {
    // Balance scoped access of the previously-open recent file before switching.
    const releasePrevious = (): void => {
      const prev = activeScopedPathRef.current;
      const next = typeof source === 'string' ? source : null;
      if (prev && prev !== next) {
        void releaseFileAccess(prev);
        activeScopedPathRef.current = null;
      }
    };
    // Re-acquire sandbox access for a recent file reopened by stored path before
    // loading. No-op for fresh picks (no stored bookmark, already granted) /
    // ArrayBuffer sources / non-macOS.
    const beginAccess = async (): Promise<void> => {
      if (typeof source !== 'string') return;
      const granted = await prepareRecentOpen(source);
      if (granted) activeScopedPathRef.current = source;
    };
    if (isDirty) {
      pendingActionRef.current = () => {
        setCurrentFilePath(typeof source === 'string' ? source : null);
        void (async () => {
          releasePrevious();
          await beginAccess();
          void loadDocument(source);
        })();
      };
      setUnsavedDialogOpen(true);
      return;
    }
    setCurrentFilePath(typeof source === 'string' ? source : null);
    releasePrevious();
    await beginAccess();
    await loadDocument(source);
  }, [isDirty, loadDocument]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Balance security-scoped access when the document is closed (pdfDoc → null).
  // Document *switches* are balanced in handleLoadDocument; app exit is balanced
  // in the Rust run loop.
  useEffect(() => {
    if (pdfDoc) return;
    const prev = activeScopedPathRef.current;
    if (prev) {
      void releaseFileAccess(prev);
      activeScopedPathRef.current = null;
    }
  }, [pdfDoc]);

  // Warn the browser / OS when there are unsaved changes and the window is closed.
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
  }, [currentFilePath, clearDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnsavedDiscard = useCallback(() => {
    setUnsavedDialogOpen(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialogOpen(false);
    pendingActionRef.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    pendingActionRef,
    isSavingRef,
    docLoadingRef,
    handleSaveAs,
    handleLoadDocument,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  };
}
