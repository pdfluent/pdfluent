// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const leftNavSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

// Slice OutlineItem body for scoped assertions
const outlineItemStart = leftNavSource.indexOf('function OutlineItem(');
const outlineItemEnd   = leftNavSource.indexOf('\nfunction BookmarksPanel', outlineItemStart);
const outlineItemBody  = leftNavSource.slice(outlineItemStart, outlineItemEnd);

// Slice BookmarksPanel body for scoped assertions
const bookmarksPanelStart = leftNavSource.indexOf('function BookmarksPanel(');
const bookmarksPanelEnd   = leftNavSource.indexOf('\n// TODO', bookmarksPanelStart);
const bookmarksPanelBody  = leftNavSource.slice(bookmarksPanelStart, bookmarksPanelEnd);

// Slice PanelContent body for threading assertions
const panelContentStart = leftNavSource.indexOf('function PanelContent(');
const panelContentEnd   = leftNavSource.indexOf('\n// ── Root', panelContentStart);
const panelContentBody  = leftNavSource.slice(panelContentStart, panelContentEnd);

// ---------------------------------------------------------------------------
// currentPage prop threading
// ---------------------------------------------------------------------------

describe('BookmarksPanel — currentPage prop threading', () => {
  it('BookmarksPanel declares currentPage in its props', () => {
    expect(bookmarksPanelBody).toContain('currentPage');
    expect(bookmarksPanelBody).toContain('currentPage: number');
  });

  it('PanelContent passes currentPage to BookmarksPanel', () => {
    const bookmarksCase = panelContentBody.indexOf("case 'bookmarks'");
    const currentPageInCase = panelContentBody.indexOf('currentPage={currentPage}', bookmarksCase);
    expect(currentPageInCase).toBeGreaterThan(bookmarksCase);
  });

  it('BookmarksPanel passes currentPage down to each OutlineItem', () => {
    expect(bookmarksPanelBody).toContain('currentPage={currentPage}');
  });

  it('OutlineItem declares currentPage in its props', () => {
    expect(outlineItemBody).toContain('currentPage');
    expect(outlineItemBody).toContain('currentPage: number');
  });

  it('OutlineItem passes currentPage to recursive child OutlineItem calls', () => {
    // Children must also receive currentPage so the whole tree is highlightable
    const childRender = outlineItemBody.indexOf('node.children.map');
    const currentPageInChild = outlineItemBody.indexOf('currentPage={currentPage}', childRender);
    expect(currentPageInChild).toBeGreaterThan(childRender);
  });
});

// ---------------------------------------------------------------------------
// Active highlight on matching pageIndex
// ---------------------------------------------------------------------------

describe('OutlineItem — active highlight', () => {
  it('computes isActive as node.pageIndex === currentPage', () => {
    expect(outlineItemBody).toContain('node.pageIndex === currentPage');
  });

  it('applies active styling (bg-primary/10) when isActive', () => {
    expect(outlineItemBody).toContain('bg-primary/10');
  });

  it('applies active text color (text-primary) when isActive', () => {
    expect(outlineItemBody).toContain('text-primary');
  });

  it('applies font-medium to the active item', () => {
    expect(outlineItemBody).toContain('font-medium');
  });

  it('uses isActive to branch className', () => {
    expect(outlineItemBody).toContain('isActive');
    // isActive must appear before the class string that uses it
    const isActiveDecl = outlineItemBody.indexOf('const isActive');
    const isActiveUsage = outlineItemBody.indexOf('isActive', isActiveDecl + 1);
    expect(isActiveUsage).toBeGreaterThan(isActiveDecl);
  });
});

// ---------------------------------------------------------------------------
// No highlight on non-matching items
// ---------------------------------------------------------------------------

describe('OutlineItem — inactive items', () => {
  it('inactive items use muted text color (text-foreground/80)', () => {
    expect(outlineItemBody).toContain('text-foreground/80');
  });

  it('inactive items have hover:bg-muted/60 hover state', () => {
    expect(outlineItemBody).toContain('hover:bg-muted/60');
  });

  it('active and inactive styles are mutually exclusive via ternary', () => {
    // The className is built with a conditional: isActive ? '...' : '...'
    const ternaryIdx = outlineItemBody.indexOf('isActive\n            ?');
    expect(ternaryIdx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// data-testid for structural assertions
// ---------------------------------------------------------------------------

describe('OutlineItem — testid', () => {
  it('has data-testid="outline-item" on the button', () => {
    expect(outlineItemBody).toContain('data-testid="outline-item"');
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing bookmark behavior
// ---------------------------------------------------------------------------

describe('BookmarksPanel — no regressions', () => {
  it('click still calls onPageSelect with node.pageIndex', () => {
    expect(outlineItemBody).toContain('onPageSelect(node.pageIndex)');
  });

  it('expand/collapse toggle still present for nodes with children', () => {
    expect(outlineItemBody).toContain('setExpanded');
    expect(outlineItemBody).toContain('hasChildren');
  });

  it('ChevronRightIcon rotates when expanded', () => {
    expect(outlineItemBody).toContain('rotate-90');
  });

  it('children are rendered recursively when expanded', () => {
    expect(outlineItemBody).toContain('node.children.map');
    expect(outlineItemBody).toContain('depth + 1');
  });

  it('empty state still renders when outline is empty', () => {
    expect(bookmarksPanelBody).toContain("t('leftNav.noBookmarks'");
  });

  it('indent is computed from depth (paddingLeft)', () => {
    expect(outlineItemBody).toContain('4 + depth * 10');
  });

  it('title tooltip still present', () => {
    expect(outlineItemBody).toContain('Pagina ${node.pageIndex + 1}');
  });
});
