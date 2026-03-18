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

// ---------------------------------------------------------------------------
// ⌘F / Ctrl+F → open SearchPanel (Batch 4 behaviour)
// ---------------------------------------------------------------------------

describe('ViewerApp — Cmd+F search shortcut', () => {
  it('has a handleSearchKey function', () => {
    expect(viewerAppSource).toContain('handleSearchKey');
  });

  it('checks metaKey or ctrlKey', () => {
    const fnStart = viewerAppSource.indexOf('handleSearchKey');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart);
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/metaKey|ctrlKey/);
  });

  it('checks for key "f"', () => {
    const fnStart = viewerAppSource.indexOf('handleSearchKey');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart);
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("e.key !== 'f'");
  });

  it('calls e.preventDefault()', () => {
    const fnStart = viewerAppSource.indexOf('handleSearchKey');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart);
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('e.preventDefault()');
  });

  it('opens the SearchPanel (setIsSearchOpen)', () => {
    const fnStart = viewerAppSource.indexOf('handleSearchKey');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart);
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setIsSearchOpen(true)');
  });

  it('registers and cleans up the event listener', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handleSearchKey)");
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handleSearchKey)");
  });

  it('useEffect has empty dependency array (always active)', () => {
    const fnStart = viewerAppSource.indexOf('handleSearchKey');
    const closeIdx = viewerAppSource.indexOf('}, [])', fnStart);
    expect(closeIdx).toBeGreaterThan(fnStart);
  });
});

// ---------------------------------------------------------------------------
// SearchPanel wired in ViewerApp JSX
// ---------------------------------------------------------------------------

describe('ViewerApp — SearchPanel integration', () => {
  it('imports SearchPanel', () => {
    expect(viewerAppSource).toContain("from './components/SearchPanel'");
  });

  it('renders SearchPanel when isSearchOpen is true', () => {
    expect(viewerAppSource).toContain('isSearchOpen');
    expect(viewerAppSource).toContain('<SearchPanel');
  });

  it('passes searchQuery as query prop', () => {
    expect(viewerAppSource).toContain('query={searchQuery}');
  });

  it('passes searchResults as results prop', () => {
    expect(viewerAppSource).toContain('results={searchResults}');
  });

  it('passes activeSearchResultIdx as activeIdx prop', () => {
    expect(viewerAppSource).toContain('activeIdx={activeSearchResultIdx}');
  });

  it('onQueryChange triggers runSearch', () => {
    expect(viewerAppSource).toContain('runSearch(q)');
  });

  it('onResultClick navigates to result page', () => {
    expect(viewerAppSource).toContain('setPageIndex(searchResults[idx].pageIndex)');
  });

  it('search panel has a close button', () => {
    expect(viewerAppSource).toContain('search-panel-close-btn');
    expect(viewerAppSource).toContain('setIsSearchOpen(false)');
  });

  it('close button also calls clearSearch', () => {
    expect(viewerAppSource).toContain('clearSearch()');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing shortcuts still present
// ---------------------------------------------------------------------------

describe('ViewerApp — search shortcut: no regressions', () => {
  it('Cmd+K command palette shortcut still present', () => {
    expect(viewerAppSource).toContain("e.key === 'k'");
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('Cmd+Shift+S save-as shortcut still present', () => {
    expect(viewerAppSource).toContain("e.key !== 'S'");
    expect(viewerAppSource).toContain('e.shiftKey');
  });

  it('Cmd+P print shortcut still present', () => {
    expect(viewerAppSource).toContain("e.key !== 'p'");
    expect(viewerAppSource).toContain('window.print()');
  });

  it('arrow key page navigation still present', () => {
    expect(viewerAppSource).toContain("case 'ArrowRight'");
    expect(viewerAppSource).toContain("case 'ArrowLeft'");
  });
});
