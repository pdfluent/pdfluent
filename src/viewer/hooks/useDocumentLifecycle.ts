// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { PdfDocument } from '../../core/document';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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

  // ---------------------------------------------------------------------------
  // Save As
  // ---------------------------------------------------------------------------

  const handleSaveAs = useCallback(async () => {
    if (!isTauri || pageCount === 0) return;
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
  }, [pageCount, clearDirty, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Document open / close
  // ---------------------------------------------------------------------------

  // Wrap loadDocument to capture the file path when opened from disk.
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
  }, [isDirty, loadDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record a file path in the recent-files list only when a load succeeds.
  const lastDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfDoc) { lastDocIdRef.current = null; return; }
    if (!currentFilePath) return;
    if (pdfDoc.id === lastDocIdRef.current) return;
    lastDocIdRef.current = pdfDoc.id;
    addRecentFile(currentFilePath);
  }, [pdfDoc?.id, currentFilePath, addRecentFile]); // eslint-disable-line react-hooks/exhaustive-deps

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
