// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResult } from '../ViewerApp';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchPanelProps {
  /** Current search query string. */
  query: string;
  /** Called when the user changes the query. */
  onQueryChange: (q: string) => void;
  /** All search results for the current query. */
  results: SearchResult[];
  /** Index of the currently active result (−1 = none). */
  activeIdx: number;
  /** Called when the user clicks a result item. */
  onResultClick: (idx: number) => void;
  /** Whether to auto-focus the input on mount. */
  autoFocus?: boolean;
}

// ---------------------------------------------------------------------------
// SearchPanel
// ---------------------------------------------------------------------------

export function SearchPanel({
  query,
  onQueryChange,
  results,
  activeIdx,
  onResultClick,
  autoFocus = false,
}: SearchPanelProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div className="flex flex-col h-full" data-testid="search-panel">
      {/* Search input */}
      <div className="p-2 border-b border-border shrink-0">
        <input
          ref={inputRef}
          data-testid="search-input"
          type="text"
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="w-full px-3 py-1.5 text-sm rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Result count */}
      <div
        data-testid="search-result-count"
        className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border shrink-0 select-none"
      >
        {query.trim() === ''
          ? t('search.enterTerm')
          : results.length === 0
            ? t('search.noResults')
            : results.length === 1
              ? t('search.resultCountSingle')
              : t('search.resultCountPlural', { count: results.length })}
      </div>

      {/* Result list */}
      <div className="flex-1 overflow-y-auto">
        {results.map((result, idx) => (
          <button
            key={`${result.pageIndex}-${result.spanIndex}`}
            data-testid="search-result-item"
            data-action="search-result-click"
            onClick={() => { onResultClick(idx); }}
            className={`w-full text-left px-3 py-2 text-xs border-b border-border/50 transition-colors cursor-pointer ${
              idx === activeIdx
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted text-foreground'
            }`}
            aria-label={t('search.resultAriaLabel', { page: result.pageIndex + 1, text: result.text })}
          >
            <span className="block text-muted-foreground text-[10px] mb-0.5">
              {t('search.resultPage', { page: result.pageIndex + 1 })}
            </span>
            <span className="block truncate">{result.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
