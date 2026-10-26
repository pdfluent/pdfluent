// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90: several documents, one window.
//
// The backend keeps every open document as a session and one of them on
// screen (src-tauri/src/sessions.rs). This hook is the other half: the tabs,
// and the rules for what opening, switching and closing do to them.
//
//   open    A file already in a tab is switched to, not opened twice. Any
//           other file gets a new tab; the document on screen stays open
//           behind it, with its unsaved changes and its undo steps.
//   switch  The reader's page and zoom are remembered per tab. A document
//           the backend still holds is shown as it was; one that was freed to
//           save memory is opened from its file again.
//   close   A tab with unsaved changes asks first (Save, Don't save, Cancel),
//           through the same dialog and save flow the single document used.
//
// Everything else the viewer does (render, edit, save) still works on "the
// document on screen" and does not know about tabs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PdfDocument } from '../../core/document';
import type { LoadDocumentOptions } from '../hooks/useDocument';
import {
  DEFAULT_TAB_VIEW,
  EMPTY_TABS,
  MAX_TABS,
  activeTab,
  anyTabDirty,
  dirtyTabs,
  fileNameOf,
  findTabByPath,
  neighbourTabId,
  refuseNewTab,
  tabsReducer,
  tabsToHibernate,
  type DocumentTab,
  type TabPatch,
  type TabsAction,
  type TabsState,
  type TabViewState,
} from './tabState';

export interface UseDocumentTabsArgs {
  /** Tabs exist in the desktop app only; the browser build keeps one document. */
  enabled: boolean;
  loadDocument: (source: string, options?: LoadDocumentOptions) => Promise<PdfDocument | null>;
  isDirty: boolean;
  fileName: string | null;
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
  pageIndex: number;
  setPageIndex: (index: number) => void;
  zoom: number;
  /** Marks the zoom as the reader's own choice. */
  setZoom: (zoom: number) => void;
  /** The reader zoomed the document on screen by hand. */
  zoomManual: boolean;
  /** Empty the viewer: the last tab was closed. */
  clearViewer: () => void;
  /** A save, an open or a switch is running; switching now could split it. */
  isBusy: () => boolean;
  /** macOS sandbox: get access to a file before it is opened. */
  beginAccess: (path: string) => Promise<void>;
  /** ...and give it back when its tab closes. */
  releaseAccess: (path: string) => void;
  /**
   * Ask what to do with the unsaved changes of the document on screen. Save
   * (and it worked) or Don't save call `proceed`; Cancel, or a save that
   * failed, calls `abandon`.
   */
  askAboutUnsavedChanges: (proceed: () => void, abandon: () => void) => void;
  /** A short message for the person using the app. */
  notify: (message: string) => void;
  /** Tab texts, in the user's language. */
  text: {
    tooMany: (max: number) => string;
  };
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

export interface DocumentTabsApi {
  tabs: readonly DocumentTab[];
  activeId: string | null;
  /** Any tab, the one on screen included, has unsaved changes. */
  anyDirty: boolean;
  /** A switch or an open is in progress. */
  switching: boolean;
  /**
   * Open a file in a tab, or switch to the tab that has it. Resolves true when
   * the file's document is on screen afterwards; false when it could not be
   * opened (the open screen says why) or the app stayed busy too long.
   */
  openPath: (path: string, options?: { allowDuplicate?: boolean }) => Promise<boolean>;
  /** Show another tab. True when it is on screen afterwards. */
  switchTo: (id: string) => Promise<boolean>;
  switchRelative: (direction: 1 | -1) => Promise<boolean>;
  /** Close a tab, asking first when it has unsaved changes. */
  requestClose: (id: string) => Promise<void>;
  /** Close the tab on screen, asking first. */
  requestCloseActive: () => Promise<void>;
  /** Walk the tabs with unsaved changes one by one (quit). True when none is left to ask about. */
  reviewUnsavedTabs: () => Promise<boolean>;
  moveTab: (id: string, toIndex: number) => void;
  /** Call once the viewer has reset itself for the document that just appeared. */
  applyPendingView: () => void;
  /** The file that could not be opened last, for "Try again". */
  lastFailedPath: () => string | null;
  /** The tabs right now, also between renders (flows read the state they just changed). */
  snapshot: () => TabsState;
}

/** How long a switch or an open waits for a save or another switch to finish. */
const BUSY_WAIT_MS = 15_000;

let tabCounter = 0;
function newTabId(): string {
  tabCounter += 1;
  return `tab-${tabCounter}`;
}

export function useDocumentTabs(args: UseDocumentTabsArgs): DocumentTabsApi {
  const [state, setState] = useState<TabsState>(EMPTY_TABS);
  const stateRef = useRef<TabsState>(EMPTY_TABS);
  const [switching, setSwitching] = useState(false);
  // True from the moment a flow starts changing which document is on screen
  // until the state it sets has been committed. The effects below that copy
  // the viewer's state (dirty, path, title) into the active tab stay out of
  // it: for a moment the viewer still shows the previous document.
  const flowRef = useRef(false);
  const stampRef = useRef(0);
  const failedPathRef = useRef<string | null>(null);
  const pendingViewRef = useRef<TabViewState | null>(null);

  const argsRef = useRef(args);
  argsRef.current = args;

  const apply = useCallback((action: TabsAction): TabsState => {
    const next = tabsReducer(stateRef.current, action);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
    return next;
  }, []);

  const patch = useCallback((id: string, change: TabPatch): void => {
    apply({ type: 'patch', id, patch: change });
  }, [apply]);

  const nextStamp = (): number => {
    stampRef.current += 1;
    return stampRef.current;
  };

  /**
   * Run `body` as the one flow changing the document on screen. A flow that
   * arrives while another runs, or while a save or a load is in progress,
   * waits its turn (a few seconds at most) rather than being dropped: a file
   * the system asked us to open must not be lost to a busy moment.
   */
  const exclusive = useCallback(async (body: () => Promise<boolean>): Promise<boolean> => {
    const deadline = Date.now() + BUSY_WAIT_MS;
    while (flowRef.current || argsRef.current.isBusy()) {
      if (Date.now() > deadline) return false;
      await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
    }
    flowRef.current = true;
    setSwitching(true);
    try {
      return await body();
    } finally {
      flowRef.current = false;
      setSwitching(false);
    }
  }, []);

  const rememberView = useCallback((): void => {
    const a = argsRef.current;
    const current = activeTab(stateRef.current);
    if (current) patch(current.id, { view: { pageIndex: a.pageIndex, zoom: a.zoom, zoomManual: a.zoomManual } });
  }, [patch]);

  /** Free the documents of tabs nobody is looking at once too many are open. */
  const hibernateExcess = useCallback(async (): Promise<void> => {
    for (const id of tabsToHibernate(stateRef.current)) {
      const tab = stateRef.current.tabs.find((t) => t.id === id);
      if (!tab || tab.sessionId === null) continue;
      try {
        const freed = await argsRef.current.invoke<boolean>('hibernate_session', { sessionId: tab.sessionId });
        if (freed) patch(id, { resident: false, sessionId: null });
      } catch (error) {
        console.warn('hibernate_session failed (already reported)', error);
      }
    }
  }, [patch]);

  /** Put `tab`'s document on screen. False when that was not possible. */
  const present = useCallback(async (tab: DocumentTab): Promise<PdfDocument | null> => {
    const a = argsRef.current;
    a.setCurrentFilePath(tab.path);
    if (tab.resident && tab.sessionId !== null) {
      const shown = await a.loadDocument(tab.path ?? tab.title, { attachSession: tab.sessionId, quiet: true });
      if (shown) return shown;
    }
    // Freed to save memory, or the backend lost it: open the file again.
    if (!tab.path) return null;
    await a.beginAccess(tab.path);
    const reopened = await a.loadDocument(tab.path);
    if (reopened && reopened.backendSession !== undefined) {
      patch(tab.id, { sessionId: reopened.backendSession, resident: true });
    }
    return reopened;
  }, [patch]);

  const showTab = useCallback(async (id: string): Promise<boolean> => {
    return exclusive(async () => {
      const target = stateRef.current.tabs.find((t) => t.id === id);
      if (!target) return false;
      if (stateRef.current.activeId === id) return true;
      rememberView();
      const previousPath = argsRef.current.currentFilePath;
      // Set before the document appears: the viewer applies it in the effect
      // that runs when the new document is on screen.
      pendingViewRef.current = target.view;
      const shown = await present(target);
      if (!shown) {
        // The open screen explains; the previous tab stays.
        pendingViewRef.current = null;
        failedPathRef.current = target.path;
        argsRef.current.setCurrentFilePath(previousPath);
        return false;
      }
      apply({ type: 'activate', id, stamp: nextStamp() });
      await hibernateExcess();
      return true;
    });
  }, [apply, exclusive, hibernateExcess, present, rememberView]);

  const openPath = useCallback(async (path: string, options?: { allowDuplicate?: boolean }): Promise<boolean> => {
    const existing = options?.allowDuplicate ? null : findTabByPath(stateRef.current, path);
    if (existing) return showTab(existing.id);
    if (refuseNewTab(stateRef.current)) {
      argsRef.current.notify(argsRef.current.text.tooMany(MAX_TABS));
      return false;
    }
    return exclusive(async () => {
      const a = argsRef.current;
      rememberView();
      // A new document opens at its own page; no tab's view applies to it.
      pendingViewRef.current = null;
      const previousPath = a.currentFilePath;
      a.setCurrentFilePath(path);
      await a.beginAccess(path);
      const loaded = await a.loadDocument(path);
      if (!loaded) {
        // Nothing opened (damaged file, wrong password, cancelled): the
        // document that was on screen still is.
        failedPathRef.current = path;
        a.setCurrentFilePath(previousPath);
        return false;
      }
      failedPathRef.current = null;
      const tab: DocumentTab = {
        id: newTabId(),
        sessionId: loaded.backendSession ?? null,
        path,
        title: fileNameOf(path),
        dirty: loaded.isModified,
        resident: true,
        keepResident: loaded.encrypted === true,
        view: DEFAULT_TAB_VIEW,
        lastActiveAt: nextStamp(),
      };
      apply({ type: 'add', tab });
      await hibernateExcess();
      return true;
    });
  }, [apply, exclusive, hibernateExcess, rememberView, showTab]);

  const switchRelative = useCallback(async (direction: 1 | -1): Promise<boolean> => {
    const id = neighbourTabId(stateRef.current, direction);
    if (!id || id === stateRef.current.activeId) return false;
    return showTab(id);
  }, [showTab]);

  /** The work of closing: the backend session, the sandbox grant, the tab, and the document that takes over. */
  const closeTab = useCallback(async (tab: DocumentTab, wasActive: boolean): Promise<void> => {
    const a = argsRef.current;
    if (tab.sessionId !== null) {
      try {
        await a.invoke('close_session', { sessionId: tab.sessionId });
      } catch (error) {
        console.warn('close_session failed (already reported)', error);
      }
    }
    if (tab.path) a.releaseAccess(tab.path);
    const next = apply({ type: 'close', id: tab.id });
    if (!wasActive) return;
    const successor = next.activeId ? next.tabs.find((t) => t.id === next.activeId) ?? null : null;
    if (!successor) {
      a.clearViewer();
      failedPathRef.current = null;
      return;
    }
    // The successor is already `activeId` in the state; show its document.
    pendingViewRef.current = successor.view;
    const shown = await present(successor);
    if (!shown) {
      pendingViewRef.current = null;
      failedPathRef.current = successor.path;
    }
    apply({ type: 'activate', id: successor.id, stamp: nextStamp() });
    await hibernateExcess();
  }, [apply, hibernateExcess, present]);

  /** Drop a tab and its document, no questions asked. */
  const closeNow = useCallback(async (id: string): Promise<void> => {
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    if (!tab) return;
    const wasActive = stateRef.current.activeId === id;
    // Closing the tab on screen changes which document is shown: no other flow
    // runs, and the viewer's state is not copied into the tab that takes over
    // until the viewer shows that tab's document.
    if (wasActive) {
      flowRef.current = true;
      setSwitching(true);
    }
    try {
      await closeTab(tab, wasActive);
    } finally {
      if (wasActive) {
        flowRef.current = false;
        setSwitching(false);
      }
    }
  }, [closeTab]);

  const requestClose = useCallback(async (id: string): Promise<void> => {
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    if (!tab || flowRef.current) return;
    if (!tab.dirty) {
      await closeNow(id);
      return;
    }
    // Bring the tab to the front so the dialog is about the document the
    // person can see, then ask.
    if (stateRef.current.activeId !== id && !(await showTab(id))) return;
    argsRef.current.askAboutUnsavedChanges(() => { void closeNow(id); }, () => undefined);
  }, [closeNow, showTab]);

  const requestCloseActive = useCallback(async (): Promise<void> => {
    const id = stateRef.current.activeId;
    if (id) await requestClose(id);
  }, [requestClose]);

  const reviewUnsavedTabs = useCallback(async (): Promise<boolean> => {
    const ids = dirtyTabs(stateRef.current).map((t) => t.id);
    for (const id of ids) {
      const tab = stateRef.current.tabs.find((t) => t.id === id);
      if (!tab?.dirty) continue; // saved while an earlier tab was being asked about
      if (stateRef.current.activeId !== id && !(await showTab(id))) return false;
      const answered = await new Promise<boolean>((resolve) => {
        argsRef.current.askAboutUnsavedChanges(() => { resolve(true); }, () => { resolve(false); });
      });
      if (!answered) return false;
    }
    return true;
  }, [showTab]);

  const moveTab = useCallback((id: string, toIndex: number): void => {
    apply({ type: 'move', id, toIndex });
  }, [apply]);

  const applyPendingView = useCallback((): void => {
    const view = pendingViewRef.current;
    if (!view) return;
    pendingViewRef.current = null;
    const a = argsRef.current;
    a.setPageIndex(view.pageIndex);
    // A zoom the reader set comes back as it was. A fitted tab restores
    // nothing: the document that just appeared is fitted to the window as it
    // is now, which may not be the window it was last seen in.
    if (view.zoomManual) a.setZoom(view.zoom);
  }, []);

  // The viewer's own state flows into the tab that is on screen.
  useEffect(() => {
    if (!args.enabled || flowRef.current) return;
    const current = activeTab(stateRef.current);
    if (current) patch(current.id, { dirty: args.isDirty });
  }, [args.enabled, args.isDirty, state.activeId, patch]);

  useEffect(() => {
    if (!args.enabled || flowRef.current || !args.currentFilePath) return;
    const current = activeTab(stateRef.current);
    if (!current) return;
    patch(current.id, {
      path: args.currentFilePath,
      title: args.fileName ?? fileNameOf(args.currentFilePath),
    });
  }, [args.enabled, args.currentFilePath, args.fileName, state.activeId, patch]);

  useEffect(() => {
    if (!args.enabled || flowRef.current) return;
    const current = activeTab(stateRef.current);
    if (current && args.fileName && args.fileName !== current.title && !args.currentFilePath) {
      patch(current.id, { title: args.fileName });
    }
  }, [args.enabled, args.fileName, args.currentFilePath, state.activeId, patch]);

  const anyDirty = useMemo(() => args.isDirty || anyTabDirty(state), [args.isDirty, state]);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    anyDirty,
    switching,
    openPath,
    switchTo: showTab,
    switchRelative,
    requestClose,
    requestCloseActive,
    reviewUnsavedTabs,
    moveTab,
    applyPendingView,
    lastFailedPath: () => failedPathRef.current,
    snapshot: () => stateRef.current,
  };
}
