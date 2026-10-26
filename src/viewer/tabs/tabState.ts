// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90: the tabs of the open documents, as plain data.
//
// One tab per open document. The document itself lives in the backend as a
// session (src-tauri/src/sessions.rs); a tab remembers which one, where Save
// writes to, whether it has unsaved changes and where the reader was. Nothing
// in this file touches React or the backend, so the rules below (which tab
// opens, which tab follows a close, which sessions to free) are tested on
// their own in __tests__/tabState.test.ts.

/** Where the reader was in a document; restored when the tab comes back. */
export interface TabViewState {
  pageIndex: number;
  zoom: number;
  /**
   * The reader set this zoom by hand and it comes back as it was. False: the
   * document is fitted to the window, whatever size that is when it returns.
   */
  zoomManual: boolean;
}

export const DEFAULT_TAB_VIEW: TabViewState = { pageIndex: 0, zoom: 1, zoomManual: false };

export interface DocumentTab {
  /** Stable for the life of the tab; the backend session behind it may change. */
  id: string;
  /** The backend session, or null while the tab is hibernated. */
  sessionId: number | null;
  /** The file Save writes to; null for a document that was never saved. */
  path: string | null;
  title: string;
  /** Unsaved changes. A dirty tab is never hibernated. */
  dirty: boolean;
  /** The document is in memory. False after hibernation. */
  resident: boolean;
  /** Cannot be reopened without asking (a password): never hibernated. */
  keepResident: boolean;
  view: TabViewState;
  /** Monotonic counter of when the tab was last on screen; larger = later. */
  lastActiveAt: number;
}

export interface TabsState {
  tabs: DocumentTab[];
  activeId: string | null;
}

export const EMPTY_TABS: TabsState = { tabs: [], activeId: null };

/** More tabs than this and opening another one is refused with a message. */
export const MAX_TABS = 20;

/**
 * How many documents may sit in memory at once. Tabs past this that have
 * nothing unsaved are hibernated, least recently used first: the backend frees
 * the document, the tab stays, and the file is opened again when the tab is
 * selected. Tabs with unsaved changes (their undo history lives only in
 * memory) are never counted out, so the number can be exceeded by them.
 */
export const MAX_RESIDENT_DOCUMENTS = 4;

export type TabPatch = Partial<
  Pick<DocumentTab, 'sessionId' | 'path' | 'title' | 'dirty' | 'resident' | 'keepResident' | 'view'>
>;

export type TabsAction =
  | { type: 'add'; tab: DocumentTab }
  | { type: 'activate'; id: string; stamp: number }
  | { type: 'close'; id: string }
  | { type: 'patch'; id: string; patch: TabPatch }
  | { type: 'move'; id: string; toIndex: number };

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'add': {
      if (state.tabs.some((t) => t.id === action.tab.id)) return state;
      return { tabs: [...state.tabs, action.tab], activeId: action.tab.id };
    }
    case 'activate': {
      const tab = state.tabs.find((t) => t.id === action.id);
      if (!tab) return state;
      if (state.activeId === action.id && tab.lastActiveAt === action.stamp) return state;
      return {
        activeId: action.id,
        tabs: state.tabs.map((t) => (t.id === action.id ? { ...t, lastActiveAt: action.stamp } : t)),
      };
    }
    case 'close': {
      const at = state.tabs.findIndex((t) => t.id === action.id);
      if (at < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (state.activeId !== action.id) return { tabs, activeId: state.activeId };
      return { tabs, activeId: tabAfterClose(state, action.id) };
    }
    case 'patch': {
      let changed = false;
      const tabs = state.tabs.map((t) => {
        if (t.id !== action.id) return t;
        const next = { ...t, ...action.patch };
        if ((Object.keys(action.patch) as Array<keyof TabPatch>).every((k) => sameValue(t[k], next[k]))) return t;
        changed = true;
        return next;
      });
      return changed ? { ...state, tabs } : state;
    }
    case 'move': {
      const from = state.tabs.findIndex((t) => t.id === action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(state.tabs.length - 1, action.toIndex));
      if (from === to) return state;
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(from, 1);
      if (!moved) return state;
      tabs.splice(to, 0, moved);
      return { ...state, tabs };
    }
    default:
      return state;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = Object.keys(ao);
    return keys.length === Object.keys(bo).length && keys.every((k) => ao[k] === bo[k]);
  }
  return false;
}

/**
 * The tab to show after `closingId` goes: the one to its right, else the one
 * to its left, else none. (A browser does the same; it keeps the strip stable
 * under the pointer when several tabs are closed in a row.)
 */
export function tabAfterClose(state: TabsState, closingId: string): string | null {
  const at = state.tabs.findIndex((t) => t.id === closingId);
  if (at < 0) return state.activeId;
  const right = state.tabs[at + 1];
  const left = state.tabs[at - 1];
  return (right ?? left)?.id ?? null;
}

/** The next (`1`) or previous (`-1`) tab, wrapping around. */
export function neighbourTabId(state: TabsState, direction: 1 | -1): string | null {
  if (state.tabs.length === 0) return null;
  const at = state.tabs.findIndex((t) => t.id === state.activeId);
  if (at < 0) return state.tabs[0]?.id ?? null;
  const n = state.tabs.length;
  return state.tabs[(at + direction + n) % n]?.id ?? null;
}

export function activeTab(state: TabsState): DocumentTab | null {
  return state.tabs.find((t) => t.id === state.activeId) ?? null;
}

export function dirtyTabs(state: TabsState): DocumentTab[] {
  return state.tabs.filter((t) => t.dirty);
}

export function anyTabDirty(state: TabsState): boolean {
  return state.tabs.some((t) => t.dirty);
}

/** Two tabs of the same name get their folder added so they can be told apart. */
export function tabLabels(tabs: readonly DocumentTab[]): Map<string, string> {
  const byTitle = new Map<string, number>();
  for (const t of tabs) byTitle.set(t.title, (byTitle.get(t.title) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const t of tabs) {
    if ((byTitle.get(t.title) ?? 0) < 2 || !t.path) {
      labels.set(t.id, t.title);
      continue;
    }
    const parts = t.path.replace(/\\/g, '/').split('/').filter(Boolean);
    const folder = parts.length >= 2 ? parts[parts.length - 2] : null;
    labels.set(t.id, folder ? `${t.title} — ${folder}` : t.title);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// The same file, found again
// ---------------------------------------------------------------------------

/**
 * A key for "is this the same file". Separators, `.` segments, doubled and
 * trailing separators are folded; case is folded where the file system does
 * (Windows, macOS). No call to the file system is made: it would stat the
 * parent folder, which on macOS raises a permission prompt for a protected
 * folder (see security.rs). A symlink or alias to a file already open is
 * therefore opened as its own tab.
 */
export function pathKey(path: string, caseInsensitive: boolean = defaultCaseInsensitive()): string {
  const slashed = path.replace(/\\/g, '/');
  const drive = /^[A-Za-z]:/.exec(slashed)?.[0] ?? '';
  const unc = slashed.startsWith('//') ? '//' : '';
  const body = slashed.slice(drive.length);
  const segments: string[] = [];
  for (const seg of body.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  const lead = unc || (body.startsWith('/') ? '/' : '');
  const joined = `${drive}${lead}${segments.join('/')}`;
  return caseInsensitive ? joined.toLowerCase() : joined;
}

function defaultCaseInsensitive(): boolean {
  const platform = typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|Win/i.test(platform);
}

export function findTabByPath(
  state: TabsState,
  path: string,
  caseInsensitive: boolean = defaultCaseInsensitive(),
): DocumentTab | null {
  const key = pathKey(path, caseInsensitive);
  return state.tabs.find((t) => t.path !== null && pathKey(t.path, caseInsensitive) === key) ?? null;
}

export function fileNameOf(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/**
 * The tabs whose documents to free so that no more than `maxResident` stay in
 * memory. Only a tab that is not on screen, has nothing unsaved and can be
 * reopened without asking qualifies; the least recently used go first.
 */
export function tabsToHibernate(state: TabsState, maxResident: number = MAX_RESIDENT_DOCUMENTS): string[] {
  const resident = state.tabs.filter((t) => t.resident);
  let excess = resident.length - Math.max(1, maxResident);
  if (excess <= 0) return [];
  const candidates = resident
    .filter((t) => t.id !== state.activeId && !t.dirty && !t.keepResident && t.path !== null)
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  const out: string[] = [];
  for (const t of candidates) {
    if (excess <= 0) break;
    out.push(t.id);
    excess -= 1;
  }
  return out;
}

/** Why one more tab cannot be opened, or null. */
export function refuseNewTab(state: TabsState): 'too-many-tabs' | null {
  return state.tabs.length >= MAX_TABS ? 'too-many-tabs' : null;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export interface TabKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Which way a key press moves between tabs, or null when it is not a tab key.
 * Ctrl+Tab and Ctrl+Shift+Tab work everywhere, Ctrl+Page Down and Ctrl+Page Up
 * as in browsers, and on macOS Cmd+Shift+] and Cmd+Shift+[. File > New Tab and
 * Close Tab are menu items (Cmd/Ctrl+T, Cmd/Ctrl+W) and are not handled here.
 */
export function tabSwitchDirection(e: TabKeyEvent): 1 | -1 | null {
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'Tab') return e.shiftKey ? -1 : 1;
    if (!e.shiftKey && e.key === 'PageDown') return 1;
    if (!e.shiftKey && e.key === 'PageUp') return -1;
  }
  if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey) {
    if (e.key === ']' || e.key === '}') return 1;
    if (e.key === '[' || e.key === '{') return -1;
  }
  return null;
}
