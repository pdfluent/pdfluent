// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-41 / #642: typing digits while editing text must not switch the viewer
// mode. These tests call the real useKeyboardShortcuts hook and fire keydown
// events at its window listeners (hookHarness.ts), so they fail if the hook
// stops using the shared typing guard.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks, installFakeWindow, keyEvent, inlineEditorTarget, type FakeWindow } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));
vi.mock('../../state/printFlow', () => ({ printDocument: vi.fn(async () => undefined) }));

import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { UndoStack, makeCommand } from '../../undoEngine';
import { isTypingTarget, modeForKeyEvent, historyActionForKeyEvent } from '../keyTargets';

function useShortcutsUnderTest(editingTextTargetId: string | null) {
  const setMode = vi.fn();
  const undoStack = new UndoStack();
  const undone: string[] = [];
  undoStack.push(makeCommand('rotate', async () => { undone.push('redo'); }, async () => { undone.push('undo'); }));
  const noop = () => undefined;
  useKeyboardShortcuts({
    pageCount: 3,
    pageIndex: 0,
    setPageIndex: noop,
    isSearchOpen: false,
    searchResults: [],
    nextSearchResult: noop,
    prevSearchResult: noop,
    selectedTextTarget: null,
    editingTextTargetId,
    handleEditEntry: noop,
    mode: 'edit',
    formFields: [],
    activeFieldIdx: -1,
    handleFieldNav: noop,
    setZoom: noop,
    onUndo: () => undoStack.undo().then(noop),
    onRedo: () => undoStack.redo().then(noop),
    handleSaveAs: async () => undefined,
    setExportOpen: noop,
    setCommandPaletteOpen: noop,
    setIsSearchOpen: noop,
    setShortcutSheetOpen: noop,
    setMode,
    setLeftRailOpen: noop,
    setGoToPageOpen: noop,
    isSavingRef: { current: false },
    handleNextComment: noop,
    handlePrevComment: noop,
  });
  return { setMode, undoStack, undone };
}

describe('J-41 digits typed in the inline text editor (#642)', () => {
  let win: FakeWindow;
  beforeEach(() => { win = installFakeWindow(); });

  it('typing 1-2-3 into the contentEditable editor does not switch mode', () => {
    const { setMode } = useShortcutsUnderTest('para-1');
    for (const key of ['1', '2', '3']) win.fire('keydown', keyEvent({ key, target: inlineEditorTarget }));
    expect(setMode).not.toHaveBeenCalled();
  });

  it('a contentEditable target alone is enough, even before the editing id is set', () => {
    const { setMode } = useShortcutsUnderTest(null);
    win.fire('keydown', keyEvent({ key: '2', target: inlineEditorTarget }));
    expect(setMode).not.toHaveBeenCalled();
  });

  it('typing a digit into a plain input does not switch mode', () => {
    const { setMode } = useShortcutsUnderTest(null);
    win.fire('keydown', keyEvent({ key: '5', target: { tagName: 'INPUT' } }));
    expect(setMode).not.toHaveBeenCalled();
  });

  it('a digit on the page itself still switches mode (the shortcut still exists)', () => {
    const { setMode } = useShortcutsUnderTest(null);
    win.fire('keydown', keyEvent({ key: '2' }));
    expect(setMode).toHaveBeenCalledWith('review');
  });
});

describe('document undo/redo keys', () => {
  let win: FakeWindow;
  beforeEach(() => { win = installFakeWindow(); });

  it('Cmd-Z on the page undoes the last document command', async () => {
    const { undone } = useShortcutsUnderTest(null);
    win.fire('keydown', keyEvent({ key: 'z', metaKey: true }));
    await Promise.resolve();
    expect(undone).toEqual(['undo']);
  });

  it('Cmd-Shift-Z redoes (the key reads "Z" with Shift held)', async () => {
    const { undone, undoStack } = useShortcutsUnderTest(null);
    await undoStack.undo();
    undone.length = 0;
    win.fire('keydown', keyEvent({ key: 'Z', metaKey: true, shiftKey: true }));
    await Promise.resolve();
    expect(undone).toEqual(['redo']);
  });

  it('Ctrl-Y redoes on Windows', async () => {
    const { undone, undoStack } = useShortcutsUnderTest(null);
    await undoStack.undo();
    undone.length = 0;
    win.fire('keydown', keyEvent({ key: 'y', ctrlKey: true }));
    await Promise.resolve();
    expect(undone).toEqual(['redo']);
  });

  it('Cmd-Z inside the inline editor is left to the editor', async () => {
    const { undone } = useShortcutsUnderTest('para-1');
    const ev = keyEvent({ key: 'z', metaKey: true, target: inlineEditorTarget });
    win.fire('keydown', ev);
    await Promise.resolve();
    expect(undone).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('keyTargets', () => {
  it('recognises every typing target and nothing else', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget(inlineEditorTarget as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'SPAN', closest: () => ({}) } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'CANVAS', closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('a consumed key or a modifier is never a mode switch', () => {
    expect(modeForKeyEvent({ ...keyEvent({ key: '3' }), defaultPrevented: true }, null)).toBeNull();
    expect(modeForKeyEvent(keyEvent({ key: '3', altKey: true }), null)).toBeNull();
    expect(modeForKeyEvent(keyEvent({ key: '3' }), null)).toBe('edit');
    expect(modeForKeyEvent(keyEvent({ key: '9' }), null)).toBeNull();
  });

  it('Cmd-Y is not redo on macOS and Cmd-Alt-Z is not undo', () => {
    expect(historyActionForKeyEvent(keyEvent({ key: 'y', metaKey: true }), null)).toBeNull();
    expect(historyActionForKeyEvent(keyEvent({ key: 'z', metaKey: true, altKey: true }), null)).toBeNull();
  });
});
