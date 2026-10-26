// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
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
  pathKey,
  refuseNewTab,
  tabAfterClose,
  tabSwitchDirection,
  tabLabels,
  tabsReducer,
  tabsToHibernate,
  type DocumentTab,
  type TabsState,
} from '../tabState';

function tab(id: string, over: Partial<DocumentTab> = {}): DocumentTab {
  return {
    id,
    sessionId: 1,
    path: `/docs/${id}.pdf`,
    title: `${id}.pdf`,
    dirty: false,
    resident: true,
    keepResident: false,
    view: DEFAULT_TAB_VIEW,
    lastActiveAt: 0,
    ...over,
  };
}

function open(...ids: string[]): TabsState {
  return ids.reduce((s, id, i) => tabsReducer(s, { type: 'add', tab: tab(id, { sessionId: i + 1, lastActiveAt: i }) }), EMPTY_TABS);
}

describe('opening and switching', () => {
  it('a new tab becomes the active one', () => {
    const s = open('a', 'b');
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b']);
    expect(s.activeId).toBe('b');
  });

  it('adding a tab id that exists changes nothing', () => {
    const s = open('a');
    expect(tabsReducer(s, { type: 'add', tab: tab('a') })).toBe(s);
  });

  it('activating a tab makes it active and stamps when', () => {
    const s = tabsReducer(open('a', 'b'), { type: 'activate', id: 'a', stamp: 10 });
    expect(s.activeId).toBe('a');
    expect(s.tabs.find((t) => t.id === 'a')?.lastActiveAt).toBe(10);
  });

  it('activating an unknown tab changes nothing', () => {
    const s = open('a');
    expect(tabsReducer(s, { type: 'activate', id: 'zzz', stamp: 3 })).toBe(s);
  });

  it('next and previous wrap around the strip', () => {
    const s = tabsReducer(open('a', 'b', 'c'), { type: 'activate', id: 'c', stamp: 9 });
    expect(neighbourTabId(s, 1)).toBe('a');
    expect(neighbourTabId(s, -1)).toBe('b');
    expect(neighbourTabId(EMPTY_TABS, 1)).toBeNull();
  });
});

describe('closing', () => {
  it('the tab on the right takes over, else the left', () => {
    const s = tabsReducer(open('a', 'b', 'c'), { type: 'activate', id: 'b', stamp: 5 });
    expect(tabAfterClose(s, 'b')).toBe('c');
    expect(tabsReducer(s, { type: 'close', id: 'b' }).activeId).toBe('c');
    const last = tabsReducer(s, { type: 'activate', id: 'c', stamp: 6 });
    expect(tabsReducer(last, { type: 'close', id: 'c' }).activeId).toBe('b');
  });

  it('closing a tab in the background keeps the active one', () => {
    const s = tabsReducer(open('a', 'b', 'c'), { type: 'close', id: 'a' });
    expect(s.activeId).toBe('c');
    expect(s.tabs.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('closing the last tab leaves none active', () => {
    const s = tabsReducer(open('a'), { type: 'close', id: 'a' });
    expect(s.tabs).toEqual([]);
    expect(s.activeId).toBeNull();
    expect(activeTab(s)).toBeNull();
  });

  it('closing an unknown tab changes nothing', () => {
    const s = open('a');
    expect(tabsReducer(s, { type: 'close', id: 'nope' })).toBe(s);
  });
});

describe('unsaved changes are tracked per tab', () => {
  it('one dirty tab does not make the others dirty', () => {
    const s = tabsReducer(open('a', 'b'), { type: 'patch', id: 'a', patch: { dirty: true } });
    expect(s.tabs.find((t) => t.id === 'a')?.dirty).toBe(true);
    expect(s.tabs.find((t) => t.id === 'b')?.dirty).toBe(false);
    expect(dirtyTabs(s).map((t) => t.id)).toEqual(['a']);
    expect(anyTabDirty(s)).toBe(true);
  });

  it('saving one tab clears only that tab', () => {
    let s = open('a', 'b');
    s = tabsReducer(s, { type: 'patch', id: 'a', patch: { dirty: true } });
    s = tabsReducer(s, { type: 'patch', id: 'b', patch: { dirty: true } });
    s = tabsReducer(s, { type: 'patch', id: 'a', patch: { dirty: false } });
    expect(dirtyTabs(s).map((t) => t.id)).toEqual(['b']);
  });

  it('a patch that changes nothing returns the same state', () => {
    const s = open('a');
    expect(tabsReducer(s, { type: 'patch', id: 'a', patch: { dirty: false, view: { ...DEFAULT_TAB_VIEW } } })).toBe(s);
  });

  it('Save As moves the tab to the new file', () => {
    const s = tabsReducer(open('a'), { type: 'patch', id: 'a', patch: { path: '/new/copy.pdf', title: 'copy.pdf' } });
    expect(findTabByPath(s, '/new/copy.pdf', false)?.id).toBe('a');
    expect(findTabByPath(s, '/docs/a.pdf', false)).toBeNull();
  });
});

describe('the same file is not opened twice', () => {
  it('finds a tab by path across separators and trailing slashes', () => {
    const s = open('a');
    expect(findTabByPath(s, '/docs/a.pdf', false)?.id).toBe('a');
    expect(findTabByPath(s, '/docs//./a.pdf', false)?.id).toBe('a');
    expect(findTabByPath(s, '/docs/sub/../a.pdf', false)?.id).toBe('a');
  });

  it('folds case only where the file system does', () => {
    const s = open('a');
    expect(findTabByPath(s, '/DOCS/A.PDF', true)?.id).toBe('a');
    expect(findTabByPath(s, '/DOCS/A.PDF', false)).toBeNull();
  });

  it('treats Windows paths with either separator as one file', () => {
    expect(pathKey('C:\\Users\\Ann\\Report.pdf', true)).toBe(pathKey('c:/users/ann/report.pdf', true));
    expect(pathKey('C:\\a\\b.pdf', true)).not.toBe(pathKey('D:\\a\\b.pdf', true));
    expect(pathKey('\\\\server\\share\\x.pdf', true)).not.toBe(pathKey('\\server\\share\\x.pdf', true));
  });

  it('a different file with the same name is a different tab', () => {
    const s = open('a');
    expect(findTabByPath(s, '/other/a.pdf', false)).toBeNull();
  });

  it('a never-saved document matches no path', () => {
    const s = tabsReducer(open('a'), { type: 'patch', id: 'a', patch: { path: null } });
    expect(findTabByPath(s, '/docs/a.pdf', false)).toBeNull();
  });

  it('names the file from either kind of path', () => {
    expect(fileNameOf('C:\\Users\\Ann\\Report.pdf')).toBe('Report.pdf');
    expect(fileNameOf('/a/b/c.pdf')).toBe('c.pdf');
  });
});

describe('labels', () => {
  it('two tabs with one name show their folders', () => {
    const labels = tabLabels([
      tab('x', { title: 'invoice.pdf', path: '/2025/invoice.pdf' }),
      tab('y', { title: 'invoice.pdf', path: '/2026/invoice.pdf' }),
      tab('z', { title: 'other.pdf', path: '/2026/other.pdf' }),
    ]);
    expect(labels.get('x')).toBe('invoice.pdf — 2025');
    expect(labels.get('y')).toBe('invoice.pdf — 2026');
    expect(labels.get('z')).toBe('other.pdf');
  });
});

describe('memory', () => {
  function crowded(): TabsState {
    let s = open('a', 'b', 'c', 'd', 'e', 'f');
    s = tabsReducer(s, { type: 'activate', id: 'f', stamp: 100 });
    return s;
  }

  it('does nothing while few documents are open', () => {
    expect(tabsToHibernate(open('a', 'b', 'c'), 4)).toEqual([]);
  });

  it('frees the least recently used clean tabs first, never the one on screen', () => {
    expect(tabsToHibernate(crowded(), 4)).toEqual(['a', 'b']);
  });

  it('never frees a tab with unsaved changes, however old', () => {
    let s = crowded();
    s = tabsReducer(s, { type: 'patch', id: 'a', patch: { dirty: true } });
    expect(tabsToHibernate(s, 4)).toEqual(['b', 'c']);
  });

  it('never frees a tab that cannot be reopened without asking, or has no file', () => {
    let s = crowded();
    s = tabsReducer(s, { type: 'patch', id: 'a', patch: { keepResident: true } });
    s = tabsReducer(s, { type: 'patch', id: 'b', patch: { path: null } });
    expect(tabsToHibernate(s, 4)).toEqual(['c', 'd']);
  });

  it('already hibernated tabs do not count', () => {
    let s = crowded();
    s = tabsReducer(s, { type: 'patch', id: 'a', patch: { resident: false, sessionId: null } });
    expect(tabsToHibernate(s, 4)).toEqual(['b']);
  });

  it('stops at the limit even if dirty tabs make it unreachable', () => {
    let s = crowded();
    for (const id of ['a', 'b', 'c', 'd', 'e']) s = tabsReducer(s, { type: 'patch', id, patch: { dirty: true } });
    expect(tabsToHibernate(s, 4)).toEqual([]);
  });

  it('refuses a tab past the cap', () => {
    const ids = Array.from({ length: MAX_TABS }, (_, i) => `t${i}`);
    expect(refuseNewTab(open(...ids))).toBe('too-many-tabs');
    expect(refuseNewTab(open(...ids.slice(1)))).toBeNull();
  });
});

describe('reordering', () => {
  it('moves a tab and keeps the active one', () => {
    const s = tabsReducer(open('a', 'b', 'c'), { type: 'move', id: 'c', toIndex: 0 });
    expect(s.tabs.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(s.activeId).toBe('c');
  });

  it('clamps the target to the strip', () => {
    const s = tabsReducer(open('a', 'b', 'c'), { type: 'move', id: 'a', toIndex: 99 });
    expect(s.tabs.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('keys', () => {
  const key = (k: string, over: Partial<Parameters<typeof tabSwitchDirection>[0]> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over,
  });

  it('Ctrl+Tab goes forward and Ctrl+Shift+Tab back, on every platform', () => {
    expect(tabSwitchDirection(key('Tab', { ctrlKey: true }))).toBe(1);
    expect(tabSwitchDirection(key('Tab', { ctrlKey: true, shiftKey: true }))).toBe(-1);
  });

  it('Ctrl+Page Down and Page Up move as in a browser', () => {
    expect(tabSwitchDirection(key('PageDown', { ctrlKey: true }))).toBe(1);
    expect(tabSwitchDirection(key('PageUp', { ctrlKey: true }))).toBe(-1);
  });

  it('Cmd+Shift+] and Cmd+Shift+[ move on macOS, with either bracket the shift key produces', () => {
    expect(tabSwitchDirection(key(']', { metaKey: true, shiftKey: true }))).toBe(1);
    expect(tabSwitchDirection(key('}', { metaKey: true, shiftKey: true }))).toBe(1);
    expect(tabSwitchDirection(key('[', { metaKey: true, shiftKey: true }))).toBe(-1);
    expect(tabSwitchDirection(key('{', { metaKey: true, shiftKey: true }))).toBe(-1);
  });

  it('leaves every other key alone, including plain Tab and the zoom and page keys', () => {
    expect(tabSwitchDirection(key('Tab'))).toBeNull();
    expect(tabSwitchDirection(key('PageDown'))).toBeNull();
    expect(tabSwitchDirection(key(']', { metaKey: true }))).toBeNull();
    expect(tabSwitchDirection(key('Tab', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(tabSwitchDirection(key('=', { metaKey: true }))).toBeNull();
    expect(tabSwitchDirection(key('PageDown', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});
