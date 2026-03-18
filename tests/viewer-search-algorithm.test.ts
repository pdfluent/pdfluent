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

// Locate runSearch body
const runSearchStart = viewerAppSource.indexOf('runSearch = useCallback');
const runSearchEnd   = viewerAppSource.indexOf('}, [pdfDoc, engine, pageCount])', runSearchStart) + 30;
const runSearchBody  = viewerAppSource.slice(runSearchStart, runSearchEnd);

// ---------------------------------------------------------------------------
// runSearch — declaration
// ---------------------------------------------------------------------------

describe('ViewerApp — runSearch: declaration', () => {
  it('defines runSearch with useCallback', () => {
    expect(viewerAppSource).toContain('runSearch = useCallback');
  });

  it('accepts a query string parameter', () => {
    expect(runSearchBody).toContain('query: string');
  });

  it('is async', () => {
    expect(runSearchBody).toContain('async (query: string)');
  });

  it('depends on [pdfDoc, engine, pageCount]', () => {
    expect(runSearchBody).toContain('[pdfDoc, engine, pageCount]');
  });
});

// ---------------------------------------------------------------------------
// runSearch — guards
// ---------------------------------------------------------------------------

describe('ViewerApp — runSearch: guards', () => {
  it('bails early if pdfDoc or engine is missing', () => {
    expect(runSearchBody).toContain('if (!pdfDoc || !engine) return');
  });

  it('returns early on empty normalized query', () => {
    expect(runSearchBody).toContain("normalized === ''");
    expect(runSearchBody).toContain('setSearchResults([])');
    expect(runSearchBody).toContain('setActiveSearchResultIdx(-1)');
  });
});

// ---------------------------------------------------------------------------
// runSearch — normalization (case-insensitive)
// ---------------------------------------------------------------------------

describe('ViewerApp — runSearch: case normalization', () => {
  it('trims and lowercases the query', () => {
    expect(runSearchBody).toContain('query.trim().toLowerCase()');
  });

  it('lowercases each span text before comparison', () => {
    expect(runSearchBody).toContain('span.text.toLowerCase()');
  });

  it('uses includes() for substring matching', () => {
    expect(runSearchBody).toContain('.includes(normalized)');
  });
});

// ---------------------------------------------------------------------------
// runSearch — page iteration
// ---------------------------------------------------------------------------

describe('ViewerApp — runSearch: page iteration', () => {
  it('iterates all pages using pageCount', () => {
    expect(runSearchBody).toContain('p < pageCount');
  });

  it('calls extractPageTextSpans for each page', () => {
    expect(runSearchBody).toContain('queryEngine.extractPageTextSpans(pdfDoc, p)');
  });

  it('skips pages where extraction fails', () => {
    expect(runSearchBody).toContain('if (!result.success) continue');
  });
});

// ---------------------------------------------------------------------------
// runSearch — result building
// ---------------------------------------------------------------------------

describe('ViewerApp — runSearch: result building', () => {
  it('builds SearchResult objects with pageIndex', () => {
    expect(runSearchBody).toContain('pageIndex: p');
  });

  it('includes rect from the span', () => {
    expect(runSearchBody).toContain('rect: span.rect');
  });

  it('includes text from the span', () => {
    expect(runSearchBody).toContain('text: span.text');
  });

  it('includes spanIndex', () => {
    expect(runSearchBody).toContain('spanIndex');
  });

  it('sets searchResults after iterating all pages', () => {
    expect(runSearchBody).toContain('setSearchResults(results)');
  });

  it('sets activeSearchResultIdx to 0 when there are results', () => {
    expect(runSearchBody).toContain('results.length > 0 ? 0 : -1');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — search algorithm: no regressions', () => {
  it('clearSearch still defined', () => {
    expect(viewerAppSource).toContain('clearSearch = useCallback');
  });

  it('searchResults state still present', () => {
    expect(viewerAppSource).toContain('setSearchResults');
  });
});
