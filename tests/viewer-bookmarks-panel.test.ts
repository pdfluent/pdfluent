// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const navRailSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// LeftNavRail — BookmarksPanel component
// ---------------------------------------------------------------------------

describe('LeftNavRail — BookmarksPanel component', () => {
  // BookmarksPanel ends just before the next function definition (SearchPanel or TODO comment)
  function bookmarksPanelBody(): string {
    const fnStart = navRailSource.indexOf('function BookmarksPanel(');
    const fnEnd = navRailSource.indexOf('\n// TODO', fnStart);
    return navRailSource.slice(fnStart, fnEnd);
  }

  it('defines BookmarksPanel function', () => {
    expect(navRailSource).toContain('function BookmarksPanel(');
  });

  it('renders empty state when no outline nodes', () => {
    expect(bookmarksPanelBody()).toContain('Geen bladwijzers beschikbaar');
  });

  it('renders outline nodes as OutlineItem components', () => {
    expect(bookmarksPanelBody()).toContain('OutlineItem');
  });

  it('passes onPageSelect to OutlineItem for navigation', () => {
    expect(bookmarksPanelBody()).toContain('onPageSelect');
  });
});

// ---------------------------------------------------------------------------
// LeftNavRail — OutlineItem component
// ---------------------------------------------------------------------------

describe('LeftNavRail — OutlineItem component', () => {
  it('defines OutlineItem function', () => {
    expect(navRailSource).toContain('function OutlineItem(');
  });

  it('renders outline-item testid button', () => {
    expect(navRailSource).toContain('data-testid="outline-item"');
  });

  it('calls onPageSelect when clicked', () => {
    const fnStart = navRailSource.indexOf('function OutlineItem(');
    const fnEnd = navRailSource.indexOf('function BookmarksPanel(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onPageSelect(node.pageIndex)');
  });

  it('highlights active bookmark matching current page', () => {
    const fnStart = navRailSource.indexOf('function OutlineItem(');
    const fnEnd = navRailSource.indexOf('function BookmarksPanel(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('node.pageIndex === currentPage');
  });

  it('renders nested children recursively', () => {
    expect(navRailSource).toContain('node.children');
  });

  it('supports expand/collapse of children', () => {
    const fnStart = navRailSource.indexOf('function OutlineItem(');
    const fnEnd = navRailSource.indexOf('function BookmarksPanel(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('expanded');
  });

  it('shows node title', () => {
    const fnStart = navRailSource.indexOf('function OutlineItem(');
    const fnEnd = navRailSource.indexOf('function BookmarksPanel(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('node.title');
  });
});

// ---------------------------------------------------------------------------
// LeftNavRail — bookmarks panel tab
// ---------------------------------------------------------------------------

describe('LeftNavRail — bookmarks panel tab registration', () => {
  it("registers 'bookmarks' panel in PANELS array", () => {
    expect(navRailSource).toContain("id: 'bookmarks'");
  });

  it('uses BookmarkIcon for the bookmarks tab', () => {
    expect(navRailSource).toContain('BookmarkIcon');
  });

  it('renders BookmarksPanel when bookmarks tab is active', () => {
    expect(navRailSource).toContain('BookmarksPanel');
  });

  it('passes outline to BookmarksPanel', () => {
    expect(navRailSource).toContain('outline={outline}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — outline state and fetch
// ---------------------------------------------------------------------------

describe('ViewerApp — outline state and fetch', () => {
  it('declares outline state as OutlineNode array', () => {
    expect(viewerAppSource).toContain('useState<OutlineNode[]>');
  });

  it('fetches outline via engine.document.getOutline', () => {
    expect(viewerAppSource).toContain('engine.document.getOutline(');
  });

  it('passes outline to LeftNavRail', () => {
    expect(viewerAppSource).toContain('outline={outline}');
  });
});
