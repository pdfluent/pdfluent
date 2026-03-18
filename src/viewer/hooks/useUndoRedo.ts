// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useRef, useCallback } from 'react';
import { UndoStack } from '../undoEngine';

export function useUndoRedo() {
  // Undo/redo stack — lives as a ref to avoid re-renders on push; canUndo/canRedo
  // are mirrored in state so the TopBar buttons update correctly.
  const undoStackRef = useRef<UndoStack>(new UndoStack());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /** Synchronise canUndo/canRedo state after each stack mutation. */
  const syncUndoState = useCallback(() => {
    setCanUndo(undoStackRef.current.canUndo);
    setCanRedo(undoStackRef.current.canRedo);
  }, []);

  /** Push a command and update undo/redo button state. */
  const pushUndo = useCallback((cmd: Parameters<UndoStack['push']>[0]) => {
    undoStackRef.current.push(cmd);
    syncUndoState();
  }, [syncUndoState]);

  return { canUndo, canRedo, pushUndo, undoStackRef, syncUndoState };
}
