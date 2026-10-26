// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-85: in the desktop app, Undo and Redo ask the backend, which keeps the
// history of every edit (src-tauri/tests/undo_redo.rs proves the backend
// half). These tests call the real useUndoRedo hook and check what it sends
// and what it hands the views afterwards.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reactForHooks } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));

const invoke = vi.fn();
vi.mock('../../../lib/commandBridge', () => ({
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
}));
const listeners: Array<(e: { payload: unknown }) => void> = [];
let subscribed = 0;
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, fn: (e: { payload: unknown }) => void) => {
    subscribed++;
    listeners.push(fn);
    return () => undefined;
  },
}));

import { useUndoRedo } from '../useUndoRedo';
import { makeCommand } from '../../undoEngine';

// Every mount subscribes after a dynamic import. The test file may only end
// once each of them has reached the mock: one that resolves after the file's
// mocks are gone loads the real event module, which throws on the missing window.
let mounted = 0;
const useCountedUndoRedo = (options: Parameters<typeof useUndoRedo>[0]) => {
  mounted++;
  return useUndoRedo(options);
};

/**
 * The hook subscribes after a dynamic import. Under load that import can take
 * longer than one tick, and one that resolves after the file has finished
 * loads the real @tauri-apps/api/event, which throws on the missing window.
 */
async function untilListening(): Promise<void> {
  for (let i = 0; i < 100 && listeners.length === 0; i++) await new Promise(r => setTimeout(r, 10));
}

afterEach(async () => {
  for (let i = 0; i < 500 && subscribed < mounted; i++) await new Promise(r => setTimeout(r, 10));
  expect(subscribed).toBe(mounted);
});

const history = { canUndo: false, canRedo: true, undoLabel: null, redoLabel: 'rotate-pages', modified: false };

beforeEach(() => {
  mounted = 0;
  subscribed = 0;
  invoke.mockReset();
  listeners.length = 0;
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_document_history') return history;
    if (cmd === 'undo_document' || cmd === 'redo_document') {
      return { applied: true, history, document: { page_count: 3, title: null, author: null } };
    }
    throw new Error(`unexpected ${cmd}`);
  });
});

describe('useUndoRedo with the backend history', () => {
  it('Undo asks the backend and hands the views the new page count and unsaved state', async () => {
    const onBackendStep = vi.fn();
    const h = useCountedUndoRedo({ backend: true, onBackendStep });
    await h.undo();
    expect(invoke).toHaveBeenCalledWith('undo_document', undefined);
    expect(onBackendStep).toHaveBeenCalledWith({
      applied: true,
      history,
      document: { pageCount: 3, title: null, author: null },
    });
  });

  // The top bar's buttons call the hook's undo/redo (ViewerApp onUndo/onRedo).
  it.each([['undo-btn', 'undo_document'], ['redo-btn', 'redo_document']] as const)(
    'the %s toolbar button steps the backend history (%s)',
    async (button, command) => {
      const h = useCountedUndoRedo({ backend: true });
      await (button === 'undo-btn' ? h.undo() : h.redo());
      expect(invoke).toHaveBeenCalledWith(command, undefined);
    },
  );

  it('Redo asks the backend for redo', async () => {
    const h = useCountedUndoRedo({ backend: true });
    await h.redo();
    expect(invoke).toHaveBeenCalledWith('redo_document', undefined);
  });

  it('a step that applied nothing does not refresh the views', async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'get_document_history' ? history : { applied: false, history, document: { page_count: 1 } });
    const onBackendStep = vi.fn();
    const h = useCountedUndoRedo({ backend: true, onBackendStep });
    await h.undo();
    expect(onBackendStep).not.toHaveBeenCalled();
  });

  it('one key press seen by both the menu and the keydown handler is one undo', async () => {
    const h = useCountedUndoRedo({ backend: true });
    await Promise.all([h.undo(), h.undo()]);
    expect(invoke.mock.calls.filter(([c]) => c === 'undo_document')).toHaveLength(1);
  });

  it('webview closures are not pushed: the backend already holds the step', async () => {
    const h = useCountedUndoRedo({ backend: true });
    const undoFn = vi.fn(async () => undefined);
    h.pushUndo(makeCommand('field', async () => undefined, undoFn));
    expect(h.undoStackRef.current.canUndo).toBe(false);
  });

  it('listens for the history the backend announces', async () => {
    await new Promise(r => setTimeout(r, 0));
    listeners.length = 0;
    useCountedUndoRedo({ backend: true });
    await untilListening();
    expect(listeners).toHaveLength(1);
  });

  // J-81: compress, watermark, properties, remove password, attachments and
  // comments changed the document from panels that never marked it dirty.
  // Every mutating command announces its history; "modified" sets the flag.
  it('an announced modification marks the document unsaved, and only that', async () => {
    await new Promise(r => setTimeout(r, 0));
    listeners.length = 0;
    const onBackendModified = vi.fn();
    useCountedUndoRedo({ backend: true, onBackendModified });
    await untilListening();
    const announce = listeners[0];
    expect(announce).toBeDefined();
    announce!({ payload: { ...history, canUndo: true, undoLabel: 'compress', modified: false } });
    expect(onBackendModified).not.toHaveBeenCalled();
    announce!({ payload: { ...history, canUndo: true, undoLabel: 'compress', modified: true } });
    expect(onBackendModified).toHaveBeenCalledTimes(1);
  });

  it('a failed undo is reported, not thrown', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_document_history') return history;
      throw new Error('Undo failed: boom');
    });
    const onBackendError = vi.fn();
    const h = useCountedUndoRedo({ backend: true, onBackendError });
    await h.undo();
    expect(onBackendError).toHaveBeenCalledWith('Undo failed: boom');
  });
});

describe('useUndoRedo in the browser runtime', () => {
  it('keeps the webview stack', async () => {
    const h = useUndoRedo({ backend: false });
    const undoFn = vi.fn(async () => undefined);
    h.pushUndo(makeCommand('field', async () => undefined, undoFn));
    await h.undo();
    expect(undoFn).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
