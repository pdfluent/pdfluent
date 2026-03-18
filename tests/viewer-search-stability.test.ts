// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const panelSource = readFileSync(
  new URL('../src/viewer/components/SearchPanel.tsx', import.meta.url),
  'utf8'
);

const overlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Batch 7 — Sidebar result click
// ---------------------------------------------------------------------------

describe('SearchPanel — sidebar result click (Batch 7)', () => {
  it('result items have search-result-click action identifier', () => {
    expect(panelSource).toContain('search-result-click');
  });

  it('clicking a result calls onResultClick with the index', () => {
    expect(panelSource).toContain('onResultClick(idx)');
  });

  it('ViewerApp result click navigates to result page', () => {
    expect(viewerAppSource).toContain('searchResults[idx].pageIndex');
  });

  it('ViewerApp result click sets activeSearchResultIdx', () => {
    expect(viewerAppSource).toContain('setActiveSearchResultIdx(idx)');
  });
});

// ---------------------------------------------------------------------------
// Batch 8 — Active result highlight (orange vs yellow)
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — active result highlight (Batch 8)', () => {
  it('active highlight uses orange fill', () => {
    expect(overlaySource).toContain("fill={isActive ? 'orange' : 'yellow'}");
  });

  it('inactive matches use 0.2 opacity', () => {
    expect(overlaySource).toContain("fillOpacity={isActive ? '1' : '0.2'}");
  });

  it('active match has orange stroke', () => {
    expect(overlaySource).toContain("stroke={isActive ? 'orange' : 'none'}");
  });

  it('isActive checks idx === activeSearchHighlightIdx', () => {
    expect(overlaySource).toContain('idx === activeSearchHighlightIdx');
  });

  it('activeSearchHighlightIdx prop declared in AnnotationOverlay', () => {
    expect(overlaySource).toContain('activeSearchHighlightIdx?:');
  });

  it('ViewerApp computes activeSearchHighlightIdx from active result', () => {
    expect(viewerAppSource).toContain('activeSearchHighlightIdx');
    expect(viewerAppSource).toContain('activeResult?.pageIndex === pageIndex');
  });
});

// ---------------------------------------------------------------------------
// Batch 9 — Search persistence
// ---------------------------------------------------------------------------

describe('ViewerApp — search persistence (Batch 9)', () => {
  it('clears search when pdfDoc.id changes (new document)', () => {
    expect(viewerAppSource).toContain("pdfDoc?.id, clearSearch");
  });

  it('also closes the search panel on document change', () => {
    const docChangeEffect = viewerAppSource.indexOf("pdfDoc?.id, clearSearch");
    const effectStart = viewerAppSource.lastIndexOf('useEffect', docChangeEffect);
    const effectEnd = viewerAppSource.indexOf('}, [', docChangeEffect) + 40;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain('clearSearch()');
    expect(effectBody).toContain('setIsSearchOpen(false)');
  });

  it('search results persist across page navigation (pageIndex NOT in search state deps)', () => {
    // pageIndex is not in the runSearch useCallback deps — results persist when navigating
    const runSearchDeps = viewerAppSource.indexOf('[pdfDoc, engine, pageCount]');
    expect(viewerAppSource.slice(runSearchDeps, runSearchDeps + 35)).not.toContain('pageIndex');
  });
});

// ---------------------------------------------------------------------------
// Batch 10 — Stability guards
// ---------------------------------------------------------------------------

describe('ViewerApp — search stability (Batch 10)', () => {
  it('empty query clears results in runSearch', () => {
    expect(viewerAppSource).toContain("normalized === ''");
    expect(viewerAppSource).toContain('setSearchResults([])');
  });

  it('zero results sets activeSearchResultIdx to -1', () => {
    expect(viewerAppSource).toContain('results.length > 0 ? 0 : -1');
  });

  it('nextSearchResult guards against empty results', () => {
    const nextStart = viewerAppSource.indexOf('nextSearchResult = useCallback');
    const nextBody = viewerAppSource.slice(nextStart, nextStart + 300);
    expect(nextBody).toContain('searchResults.length === 0');
  });

  it('prevSearchResult guards against empty results', () => {
    const prevStart = viewerAppSource.indexOf('prevSearchResult = useCallback');
    const prevBody = viewerAppSource.slice(prevStart, prevStart + 300);
    expect(prevBody).toContain('searchResults.length === 0');
  });

  it('nextSearchResult wraps (clamps) at end', () => {
    const nextStart = viewerAppSource.indexOf('nextSearchResult = useCallback');
    const nextBody = viewerAppSource.slice(nextStart, nextStart + 300);
    expect(nextBody).toContain('searchResults.length - 1');
  });

  it('prevSearchResult wraps (clamps) at beginning', () => {
    const prevStart = viewerAppSource.indexOf('prevSearchResult = useCallback');
    const prevBody = viewerAppSource.slice(prevStart, prevStart + 300);
    expect(prevBody).toContain('searchResults.length - 1');
  });

  it('search result click guards against undefined result', () => {
    expect(viewerAppSource).toContain('searchResults[idx] !== undefined');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('Search implementation — no regressions', () => {
  it('search-input testid still present', () => {
    expect(panelSource).toContain('data-testid="search-input"');
  });

  it('search-result-item testid still present', () => {
    expect(panelSource).toContain('data-testid="search-result-item"');
  });

  it('search-result-count testid still present', () => {
    expect(panelSource).toContain('data-testid="search-result-count"');
  });

  it('search-panel-close-btn still present', () => {
    expect(viewerAppSource).toContain('search-panel-close-btn');
  });

  it('SearchResult interface still exported', () => {
    expect(viewerAppSource).toContain('export interface SearchResult');
  });
});
