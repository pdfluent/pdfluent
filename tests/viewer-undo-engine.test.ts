// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The webview undo stack (src/viewer/undoEngine.ts), used by the browser
// runtime. This file used to read the source of the stack, ViewerApp and the
// top bar and look for strings; it now runs the stack. In the desktop app the
// history lives in the backend: src-tauri/tests/undo_redo.rs and
// src/viewer/hooks/__tests__/useUndoRedo.backend.test.ts prove that path, and
// useKeyboardShortcuts.typing.test.ts the keys.

import { describe, it, expect } from 'vitest';
import { UndoStack, makeCommand } from '../src/viewer/undoEngine';

function counter() {
  const log: string[] = [];
  const cmd = (name: string) => makeCommand(name, async () => { log.push(`do ${name}`); }, async () => { log.push(`undo ${name}`); });
  return { log, cmd };
}

describe('UndoStack', () => {
  it('starts empty', () => {
    const s = new UndoStack();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.undoLabel).toBeNull();
    expect(s.redoLabel).toBeNull();
  });

  it('undoes the newest command first and redoes it', async () => {
    const { log, cmd } = counter();
    const s = new UndoStack();
    s.push(cmd('a'));
    s.push(cmd('b'));
    expect(s.undoLabel).toBe('b');
    expect((await s.undo())?.description).toBe('b');
    expect(log).toEqual(['undo b']);
    expect(s.redoLabel).toBe('b');
    expect((await s.redo())?.description).toBe('b');
    expect(log).toEqual(['undo b', 'do b']);
    expect(s.undoLabel).toBe('b');
  });

  it('a new command ends the redo branch', async () => {
    const { cmd } = counter();
    const s = new UndoStack();
    s.push(cmd('a'));
    await s.undo();
    expect(s.canRedo).toBe(true);
    s.push(cmd('c'));
    expect(s.canRedo).toBe(false);
  });

  it('undo and redo on an empty stack do nothing and say so', async () => {
    const s = new UndoStack();
    expect(await s.undo()).toBeNull();
    expect(await s.redo()).toBeNull();
  });

  it('clear empties both stacks', async () => {
    const { cmd } = counter();
    const s = new UndoStack();
    s.push(cmd('a'));
    s.push(cmd('b'));
    await s.undo();
    s.clear();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });
});
