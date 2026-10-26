// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90: the real useDocumentTabs hook, with a fake backend behind it. What it
// asks the backend to open, switch to, close and free, and what the viewer is
// told, for two and more documents.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks } from '../../hooks/__tests__/hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));

import type { PdfDocument } from '../../../core/document';
import { useDocumentTabs, type UseDocumentTabsArgs } from '../useDocumentTabs';

interface Backend {
  nextSession: number;
  /** path -> modified flag the next open of it reports */
  modified: Set<string>;
  failing: Set<string>;
  open: Set<number>;
}

let backend: Backend;
let loadCalls: Array<{ source: string; attach?: number }>;
let invokeCalls: Array<{ command: string; args?: Record<string, unknown> }>;
let sessionPath: Map<number, string>;

function fakeDocument(session: number, modified: boolean, encrypted = false): PdfDocument {
  return { backendSession: session, isModified: modified, ...(encrypted ? { encrypted } : {}) } as unknown as PdfDocument;
}

function useTabsHarness(over: Partial<UseDocumentTabsArgs> = {}) {
  const calls = {
    setCurrentFilePath: vi.fn(),
    setPageIndex: vi.fn(),
    setZoom: vi.fn(),
    clearViewer: vi.fn(),
    notify: vi.fn(),
    ask: vi.fn<(proceed: () => void, abandon: () => void) => void>(),
    releaseAccess: vi.fn(),
  };
  const args: UseDocumentTabsArgs = {
    enabled: true,
    loadDocument: async (source, options) => {
      loadCalls.push({ source, ...(options?.attachSession !== undefined ? { attach: options.attachSession } : {}) });
      if (options?.attachSession !== undefined) {
        return backend.open.has(options.attachSession) ? fakeDocument(options.attachSession, backend.modified.has(sessionPath.get(options.attachSession) ?? '')) : null;
      }
      if (backend.failing.has(source)) return null;
      const session = backend.nextSession++;
      backend.open.add(session);
      sessionPath.set(session, source);
      return fakeDocument(session, backend.modified.has(source));
    },
    isDirty: false,
    fileName: null,
    currentFilePath: null,
    setCurrentFilePath: calls.setCurrentFilePath,
    pageIndex: 0,
    setPageIndex: calls.setPageIndex,
    zoom: 1,
    setZoom: calls.setZoom,
    zoomManual: false,
    clearViewer: calls.clearViewer,
    isBusy: () => false,
    beginAccess: async () => undefined,
    releaseAccess: calls.releaseAccess,
    askAboutUnsavedChanges: calls.ask,
    notify: calls.notify,
    text: { tooMany: (max) => `at most ${max}` },
    invoke: async <T,>(command: string, args2?: Record<string, unknown>): Promise<T> => {
      invokeCalls.push({ command, ...(args2 ? { args: args2 } : {}) });
      if (command === 'close_session' || command === 'hibernate_session') {
        const id = args2?.sessionId as number;
        backend.open.delete(id);
        return (command === 'hibernate_session' ? true : undefined) as T;
      }
      return undefined as T;
    },
    ...over,
  };
  const tabs = useDocumentTabs(args);
  return { tabs, calls, args };
}

beforeEach(() => {
  backend = { nextSession: 1, modified: new Set(), failing: new Set(), open: new Set() };
  loadCalls = [];
  invokeCalls = [];
  sessionPath = new Map();
});

const ids = (t: ReturnType<typeof useTabsHarness>['tabs']) => t.snapshot().tabs.map((x) => x.path);

describe('opening', () => {
  it('a second file opens beside the first; the first is not closed', async () => {
    const { tabs } = useTabsHarness();
    expect(await tabs.openPath('/d/a.pdf')).toBe(true);
    expect(await tabs.openPath('/d/b.pdf')).toBe(true);
    expect(ids(tabs)).toEqual(['/d/a.pdf', '/d/b.pdf']);
    expect(tabs.snapshot().activeId).toBe(tabs.snapshot().tabs[1]?.id);
    expect(invokeCalls.filter((c) => c.command === 'close_session')).toEqual([]);
    expect(backend.open.size).toBe(2);
  });

  it('a file that is already open is switched to, not opened again', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    loadCalls = [];
    expect(await tabs.openPath('/d/a.pdf')).toBe(true);
    expect(tabs.snapshot().tabs).toHaveLength(2);
    expect(tabs.snapshot().activeId).toBe(tabs.snapshot().tabs[0]?.id);
    expect(loadCalls).toEqual([{ source: '/d/a.pdf', attach: 1 }]);
  });

  it('a file that cannot be opened adds no tab and the viewer keeps its path', async () => {
    const { tabs, calls } = useTabsHarness({ currentFilePath: '/d/a.pdf' });
    await tabs.openPath('/d/a.pdf');
    backend.failing.add('/d/broken.pdf');
    expect(await tabs.openPath('/d/broken.pdf')).toBe(false);
    expect(tabs.snapshot().tabs).toHaveLength(1);
    expect(calls.setCurrentFilePath).toHaveBeenLastCalledWith('/d/a.pdf');
    expect(tabs.lastFailedPath()).toBe('/d/broken.pdf');
  });

  it('a recovered copy may be a second tab for a file that is open', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/a.pdf', { allowDuplicate: true });
    expect(tabs.snapshot().tabs).toHaveLength(2);
  });

  it('refuses a tab past the cap and says why', async () => {
    const { tabs, calls } = useTabsHarness();
    for (let i = 0; i < 20; i++) await tabs.openPath(`/d/${i}.pdf`);
    loadCalls = [];
    expect(await tabs.openPath('/d/over.pdf')).toBe(false);
    expect(loadCalls).toEqual([]);
    expect(calls.notify).toHaveBeenCalledWith('at most 20');
  });

  it('keeps a tab for a file with unsaved changes marked dirty', async () => {
    backend.modified.add('/d/a.pdf');
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    expect(tabs.snapshot().tabs[0]?.dirty).toBe(true);
  });
});

describe('switching', () => {
  it('shows an open document by session, without reading the file again', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    loadCalls = [];
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    expect(loadCalls).toEqual([{ source: '/d/a.pdf', attach: 1 }]);
  });

  it('remembers the page and a hand-set zoom each tab was left at', async () => {
    const view = { pageIndex: 4, zoom: 2, zoomManual: true };
    const { tabs, calls } = useTabsHarness({ pageIndex: view.pageIndex, zoom: view.zoom, zoomManual: true });
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    expect(tabs.snapshot().tabs[0]?.view).toEqual(view);
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    tabs.applyPendingView();
    expect(calls.setPageIndex).toHaveBeenCalledWith(4);
    expect(calls.setZoom).toHaveBeenCalledWith(2);
  });

  it('a fitted tab restores no zoom: the document is fitted to the window as it is now', async () => {
    const { tabs, calls } = useTabsHarness({ pageIndex: 3, zoom: 1.37, zoomManual: false });
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    expect(tabs.snapshot().tabs[0]?.view).toEqual({ pageIndex: 3, zoom: 1.37, zoomManual: false });
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    tabs.applyPendingView();
    expect(calls.setPageIndex).toHaveBeenCalledWith(3);
    expect(calls.setZoom).not.toHaveBeenCalled();
  });

  it('next and previous wrap around', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    await tabs.openPath('/d/c.pdf');
    await tabs.switchRelative(1);
    expect(tabs.snapshot().activeId).toBe(tabs.snapshot().tabs[0]?.id);
    await tabs.switchRelative(-1);
    expect(tabs.snapshot().activeId).toBe(tabs.snapshot().tabs[2]?.id);
  });

  it('stays on the current tab when the other cannot be shown', async () => {
    const { tabs, calls } = useTabsHarness({ currentFilePath: '/d/b.pdf' });
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    backend.open.clear();
    backend.failing.add('/d/a.pdf');
    const before = tabs.snapshot().activeId;
    expect(await tabs.switchTo(tabs.snapshot().tabs[0]!.id)).toBe(false);
    expect(tabs.snapshot().activeId).toBe(before);
    expect(calls.setCurrentFilePath).toHaveBeenLastCalledWith('/d/b.pdf');
  });
});

describe('closing', () => {
  it('closes a clean tab in the background without touching the one on screen', async () => {
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    const first = tabs.snapshot().tabs[0]!;
    await tabs.requestClose(first.id);
    expect(invokeCalls).toContainEqual({ command: 'close_session', args: { sessionId: first.sessionId } });
    expect(ids(tabs)).toEqual(['/d/b.pdf']);
    expect(calls.clearViewer).not.toHaveBeenCalled();
    expect(calls.releaseAccess).toHaveBeenCalledWith('/d/a.pdf');
  });

  it('closing the tab on screen shows the next one', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    loadCalls = [];
    await tabs.requestCloseActive();
    expect(ids(tabs)).toEqual(['/d/a.pdf']);
    expect(loadCalls).toEqual([{ source: '/d/a.pdf', attach: 1 }]);
    expect(tabs.snapshot().activeId).toBe(tabs.snapshot().tabs[0]?.id);
  });

  it('closing the last tab empties the viewer', async () => {
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.requestCloseActive();
    expect(tabs.snapshot().tabs).toEqual([]);
    expect(calls.clearViewer).toHaveBeenCalledTimes(1);
  });

  it('a tab with unsaved changes asks first, and Cancel keeps it open', async () => {
    backend.modified.add('/d/b.pdf');
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    const dirty = tabs.snapshot().tabs[1]!;
    await tabs.requestClose(dirty.id);
    // The tab was brought to the front so the question is about what is on screen.
    expect(tabs.snapshot().activeId).toBe(dirty.id);
    expect(calls.ask).toHaveBeenCalledTimes(1);
    expect(invokeCalls.filter((c) => c.command === 'close_session')).toEqual([]);
    expect(ids(tabs)).toEqual(['/d/a.pdf', '/d/b.pdf']);
    const [, abandon] = calls.ask.mock.calls[0]!;
    abandon();
    expect(ids(tabs)).toEqual(['/d/a.pdf', '/d/b.pdf']);
  });

  it('Save or Don\'t save then closes it, and only it', async () => {
    backend.modified.add('/d/b.pdf');
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    await tabs.requestCloseActive();
    const [proceed] = calls.ask.mock.calls[0]!;
    proceed();
    await vi.waitFor(() => { expect(ids(tabs)).toEqual(['/d/a.pdf']); });
    expect(invokeCalls.filter((c) => c.command === 'close_session')).toHaveLength(1);
    expect(backend.open.size).toBe(1);
  });
});

describe('memory', () => {
  it('frees the oldest clean documents past the limit and reopens them from their file', async () => {
    const { tabs } = useTabsHarness();
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await tabs.openPath(`/d/${n}.pdf`);
    const hibernated = tabs.snapshot().tabs.filter((t) => !t.resident).map((t) => t.path);
    expect(hibernated).toEqual(['/d/a.pdf', '/d/b.pdf']);
    expect(invokeCalls.filter((c) => c.command === 'hibernate_session')).toHaveLength(2);
    expect(backend.open.size).toBe(4);

    loadCalls = [];
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    expect(loadCalls).toEqual([{ source: '/d/a.pdf' }]);
    const reopened = tabs.snapshot().tabs[0]!;
    expect(reopened.resident).toBe(true);
    expect(reopened.sessionId).not.toBeNull();
  });

  it('never frees a tab with unsaved changes', async () => {
    backend.modified.add('/d/a.pdf');
    const { tabs } = useTabsHarness();
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await tabs.openPath(`/d/${n}.pdf`);
    expect(tabs.snapshot().tabs[0]?.resident).toBe(true);
    expect(tabs.snapshot().tabs.filter((t) => !t.resident).map((t) => t.path)).toEqual(['/d/b.pdf', '/d/c.pdf']);
  });

  it('falls back to opening the file when the backend lost the session', async () => {
    const { tabs } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    backend.open.delete(1);
    loadCalls = [];
    await tabs.switchTo(tabs.snapshot().tabs[0]!.id);
    expect(loadCalls).toEqual([{ source: '/d/a.pdf', attach: 1 }, { source: '/d/a.pdf' }]);
    expect(tabs.snapshot().tabs[0]?.sessionId).not.toBe(1);
  });
});

describe('quitting with several unsaved documents', () => {
  it('asks about each in turn and finishes when all are settled', async () => {
    backend.modified.add('/d/a.pdf');
    backend.modified.add('/d/b.pdf');
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    calls.ask.mockImplementation((proceed) => { proceed(); });
    expect(await tabs.reviewUnsavedTabs()).toBe(true);
    expect(calls.ask).toHaveBeenCalledTimes(2);
  });

  it('stops at the first Cancel', async () => {
    backend.modified.add('/d/a.pdf');
    backend.modified.add('/d/b.pdf');
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    await tabs.openPath('/d/b.pdf');
    calls.ask.mockImplementation((_proceed, abandon) => { abandon(); });
    expect(await tabs.reviewUnsavedTabs()).toBe(false);
    expect(calls.ask).toHaveBeenCalledTimes(1);
  });

  it('has nothing to ask when no document has unsaved changes', async () => {
    const { tabs, calls } = useTabsHarness();
    await tabs.openPath('/d/a.pdf');
    expect(await tabs.reviewUnsavedTabs()).toBe(true);
    expect(calls.ask).not.toHaveBeenCalled();
  });
});

describe('a busy moment', () => {
  it('waits for a save in progress instead of dropping the open', async () => {
    let busy = true;
    const { tabs } = useTabsHarness({ isBusy: () => busy });
    const opening = tabs.openPath('/d/a.pdf');
    setTimeout(() => { busy = false; }, 120);
    expect(await opening).toBe(true);
    expect(ids(tabs)).toEqual(['/d/a.pdf']);
  });
});
