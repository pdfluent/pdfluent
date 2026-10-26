// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useRef, useCallback, useEffect } from 'react';
import { UndoStack } from '../undoEngine';
import {
  DOCUMENT_HISTORY_EVENT,
  EMPTY_HISTORY,
  getDocumentHistory,
  redoDocument,
  undoDocument,
  type DocumentHistoryState,
  type HistoryStepResult,
} from '../state/documentHistory';

export interface UseUndoRedoOptions {
  /**
   * True in the desktop app: the backend keeps the history of every edit
   * (J-85). False in the browser runtime with the mock engine, which keeps
   * the old webview stack of form-field closures.
   */
  backend: boolean;
  /** Called after a backend undo or redo, to bring the views up to date. */
  onBackendStep?: (step: HistoryStepResult) => void;
  /** Called when a backend undo or redo fails, with the reason. */
  onBackendError?: (message: string) => void;
  /**
   * Called when the backend announces that the document now differs from what
   * was opened or saved. Every mutating command announces its history, so the
   * webview's unsaved flag follows edits made from any panel (compress,
   * watermark, properties, remove password, attachments, comments) without
   * each call site having to remember to mark the document dirty.
   */
  onBackendModified?: () => void;
}

/**
 * The menu accelerator and the keydown handler can both see one Cmd/Ctrl-Z
 * (the native menu forwards it on some platforms). A second request within
 * this window is the same key press, not a second undo.
 */
const SAME_PRESS_MS = 120;

export function useUndoRedo(options: UseUndoRedoOptions = { backend: false }) {
  const { backend } = options;
  const onStepRef = useRef(options.onBackendStep);
  const onErrorRef = useRef(options.onBackendError);
  const onModifiedRef = useRef(options.onBackendModified);
  useEffect(() => { onStepRef.current = options.onBackendStep; }, [options.onBackendStep]);
  useEffect(() => { onErrorRef.current = options.onBackendError; }, [options.onBackendError]);
  useEffect(() => { onModifiedRef.current = options.onBackendModified; }, [options.onBackendModified]);

  // Webview stack — the browser runtime only.
  const undoStackRef = useRef<UndoStack>(new UndoStack());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [history, setHistory] = useState<DocumentHistoryState>(EMPTY_HISTORY);
  const lastRequestRef = useRef(0);
  const busyRef = useRef(false);

  const applyHistory = useCallback((h: DocumentHistoryState) => {
    setHistory(h);
    setCanUndo(h.canUndo);
    setCanRedo(h.canRedo);
  }, []);

  /** Synchronise canUndo/canRedo state after each stack mutation. */
  const syncUndoState = useCallback(() => {
    if (backend) return;
    setCanUndo(undoStackRef.current.canUndo);
    setCanRedo(undoStackRef.current.canRedo);
  }, [backend]);

  /**
   * Push a webview command. In the desktop app the backend already recorded
   * the edit that this command would reverse, so pushing it too would make one
   * action two undo steps.
   */
  const pushUndo = useCallback((cmd: Parameters<UndoStack['push']>[0]) => {
    if (backend) return;
    undoStackRef.current.push(cmd);
    syncUndoState();
  }, [backend, syncUndoState]);

  const refresh = useCallback(async () => {
    if (!backend) return;
    try {
      applyHistory(await getDocumentHistory());
    } catch (error) {
      onErrorRef.current?.(error instanceof Error ? error.message : String(error));
    }
  }, [backend, applyHistory]);

  // The backend announces every change of the history.
  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<DocumentHistoryState>(DOCUMENT_HISTORY_EVENT, (event) => {
        applyHistory(event.payload);
        // Only ever towards dirty: a save clears the flag itself, and an
        // announcement of "not modified" must not wipe changes the webview
        // still holds (an open inline edit).
        if (event.payload.modified) onModifiedRef.current?.();
      });
      if (cancelled) unlisten();
    })();
    void refresh();
    return () => { cancelled = true; unlisten?.(); };
  }, [backend, applyHistory, refresh]);

  const step = useCallback(async (direction: 'undo' | 'redo') => {
    const now = Date.now();
    if (now - lastRequestRef.current < SAME_PRESS_MS) return;
    lastRequestRef.current = now;
    if (!backend) {
      if (direction === 'undo') await undoStackRef.current.undo();
      else await undoStackRef.current.redo();
      syncUndoState();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = direction === 'undo' ? await undoDocument() : await redoDocument();
      applyHistory(result.history);
      if (result.applied) onStepRef.current?.(result);
    } catch (error) {
      onErrorRef.current?.(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
    }
  }, [backend, applyHistory, syncUndoState]);

  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  return { canUndo, canRedo, history, pushUndo, undoStackRef, syncUndoState, undo, redo, refresh };
}
