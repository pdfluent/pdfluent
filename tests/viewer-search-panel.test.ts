// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/SearchPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// SearchPanel — structure
// ---------------------------------------------------------------------------

describe('SearchPanel — component declaration', () => {
  it('exports SearchPanel function', () => {
    expect(panelSource).toContain('export function SearchPanel');
  });

  it('imports SearchResult from ViewerApp', () => {
    expect(panelSource).toContain("from '../ViewerApp'");
    expect(panelSource).toContain('SearchResult');
  });
});

// ---------------------------------------------------------------------------
// SearchPanel — props
// ---------------------------------------------------------------------------

describe('SearchPanel — props interface', () => {
  it('declares query prop', () => {
    expect(panelSource).toContain('query: string');
  });

  it('declares onQueryChange prop', () => {
    expect(panelSource).toContain('onQueryChange: (q: string) => void');
  });

  it('declares results prop as SearchResult array', () => {
    expect(panelSource).toContain('results: SearchResult[]');
  });

  it('declares activeIdx prop as number', () => {
    expect(panelSource).toContain('activeIdx: number');
  });

  it('declares onResultClick prop', () => {
    expect(panelSource).toContain('onResultClick: (idx: number) => void');
  });
});

// ---------------------------------------------------------------------------
// SearchPanel — search input
// ---------------------------------------------------------------------------

describe('SearchPanel — search-input', () => {
  it('renders search-input testid', () => {
    expect(panelSource).toContain('data-testid="search-input"');
  });

  it('input is type text', () => {
    const inputPos = panelSource.indexOf('search-input');
    const inputStart = panelSource.lastIndexOf('<input', inputPos);
    const inputEnd = panelSource.indexOf('/>', inputStart) + 2;
    const inputBlock = panelSource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('type="text"');
  });

  it('input value is bound to query prop', () => {
    const inputPos = panelSource.indexOf('search-input');
    const inputStart = panelSource.lastIndexOf('<input', inputPos);
    const inputEnd = panelSource.indexOf('/>', inputStart) + 2;
    const inputBlock = panelSource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('value={query}');
  });

  it('input onChange calls onQueryChange', () => {
    expect(panelSource).toContain('onQueryChange(e.target.value)');
  });

  it('input has aria-label', () => {
    const inputPos = panelSource.indexOf('search-input');
    const inputStart = panelSource.lastIndexOf('<input', inputPos);
    const inputEnd = panelSource.indexOf('/>', inputStart) + 2;
    const inputBlock = panelSource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('aria-label=');
  });
});

// ---------------------------------------------------------------------------
// SearchPanel — result count
// ---------------------------------------------------------------------------

describe('SearchPanel — search-result-count', () => {
  it('renders search-result-count testid', () => {
    expect(panelSource).toContain('data-testid="search-result-count"');
  });

  it('shows result count from results.length', () => {
    expect(panelSource).toContain('results.length');
  });
});

// ---------------------------------------------------------------------------
// SearchPanel — result items
// ---------------------------------------------------------------------------

describe('SearchPanel — search-result-item', () => {
  it('renders search-result-item testid on each result', () => {
    expect(panelSource).toContain('data-testid="search-result-item"');
  });

  it('result item shows page number', () => {
    expect(panelSource).toContain('result.pageIndex + 1');
  });

  it('result item shows snippet text', () => {
    expect(panelSource).toContain('result.text');
  });

  it('result item calls onResultClick when clicked', () => {
    expect(panelSource).toContain('onResultClick(idx)');
  });

  it('result item maps over results array', () => {
    expect(panelSource).toContain('results.map(');
  });
});

// ---------------------------------------------------------------------------
// SearchPanel — active result highlight
// ---------------------------------------------------------------------------

describe('SearchPanel — active result styling', () => {
  it('applies active class when idx === activeIdx', () => {
    expect(panelSource).toContain('idx === activeIdx');
  });
});
