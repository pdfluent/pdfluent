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

// Locate nextSearchResult body
const nextStart = viewerAppSource.indexOf('nextSearchResult = useCallback');
const nextEnd   = viewerAppSource.indexOf('}, [searchResults, activeSearchResultIdx])', nextStart) + 42;
const nextBody  = viewerAppSource.slice(nextStart, nextEnd);

// Locate prevSearchResult body
const prevStart = viewerAppSource.indexOf('prevSearchResult = useCallback');
const prevEnd   = viewerAppSource.indexOf('}, [searchResults, activeSearchResultIdx])', prevStart) + 42;
const prevBody  = viewerAppSource.slice(prevStart, prevEnd);

// Locate handleSearchNav body
const navStart = viewerAppSource.indexOf('handleSearchNav');
const navEnd   = viewerAppSource.indexOf('}, [isSearchOpen, searchResults, nextSearchResult, prevSearchResult])', navStart) + 69;
const navBody  = viewerAppSource.slice(navStart, navEnd);

// ---------------------------------------------------------------------------
// nextSearchResult
// ---------------------------------------------------------------------------

describe('ViewerApp — nextSearchResult', () => {
  it('defines nextSearchResult with useCallback', () => {
    expect(viewerAppSource).toContain('nextSearchResult = useCallback');
  });

  it('bails when searchResults is empty', () => {
    expect(nextBody).toContain('searchResults.length === 0');
  });

  it('advances index to activeSearchResultIdx + 1', () => {
    expect(nextBody).toContain('activeSearchResultIdx + 1');
  });

  it('wraps around to 0 at the end', () => {
    expect(nextBody).toContain(': 0');
  });

  it('navigates to the result page', () => {
    expect(nextBody).toContain('searchResults[next]');
    expect(nextBody).toContain('.pageIndex');
  });

  it('updates activeSearchResultIdx', () => {
    expect(nextBody).toContain('setActiveSearchResultIdx(next)');
  });
});

// ---------------------------------------------------------------------------
// prevSearchResult
// ---------------------------------------------------------------------------

describe('ViewerApp — prevSearchResult', () => {
  it('defines prevSearchResult with useCallback', () => {
    expect(viewerAppSource).toContain('prevSearchResult = useCallback');
  });

  it('bails when searchResults is empty', () => {
    expect(prevBody).toContain('searchResults.length === 0');
  });

  it('decrements index by 1', () => {
    expect(prevBody).toContain('activeSearchResultIdx - 1');
  });

  it('wraps around to last result at the start', () => {
    expect(prevBody).toContain('searchResults.length - 1');
  });

  it('navigates to the result page', () => {
    expect(prevBody).toContain('searchResults[prev]');
    expect(prevBody).toContain('.pageIndex');
  });

  it('updates activeSearchResultIdx', () => {
    expect(prevBody).toContain('setActiveSearchResultIdx(prev)');
  });
});

// ---------------------------------------------------------------------------
// Keyboard: Enter / Shift+Enter
// ---------------------------------------------------------------------------

describe('ViewerApp — search keyboard navigation', () => {
  it('defines handleSearchNav', () => {
    expect(viewerAppSource).toContain('handleSearchNav');
  });

  it('only fires when isSearchOpen is true', () => {
    expect(navBody).toContain('isSearchOpen');
    expect(navBody).toContain('searchResults.length === 0');
  });

  it('triggers on Enter key', () => {
    expect(navBody).toContain("e.key !== 'Enter'");
  });

  it('calls e.preventDefault()', () => {
    expect(navBody).toContain('e.preventDefault()');
  });

  it('Shift+Enter calls prevSearchResult', () => {
    expect(navBody).toContain('e.shiftKey');
    expect(navBody).toContain('prevSearchResult()');
  });

  it('Enter (no shift) calls nextSearchResult', () => {
    expect(navBody).toContain('nextSearchResult()');
  });

  it('registers and cleans up the listener', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handleSearchNav)");
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handleSearchNav)");
  });

  it('effect depends on isSearchOpen, searchResults, and nav functions', () => {
    expect(navBody).toContain('[isSearchOpen, searchResults, nextSearchResult, prevSearchResult]');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — search navigation: no regressions', () => {
  it('runSearch still defined', () => {
    expect(viewerAppSource).toContain('runSearch = useCallback');
  });

  it('clearSearch still defined', () => {
    expect(viewerAppSource).toContain('clearSearch = useCallback');
  });

  it('searchResults state still present', () => {
    expect(viewerAppSource).toContain('[searchResults, setSearchResults]');
  });
});
