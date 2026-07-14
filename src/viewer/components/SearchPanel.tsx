// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
    <div className="searchpanel" data-testid="search-panel">
      {/* Search input */}
      <div className="searchpanel-input-row">
        <input
          ref={inputRef}
          data-testid="search-input"
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="settings-input"
        />
      </div>

      {/* Result count */}
      <div
        data-testid="search-result-count"
        className="searchpanel-status"
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
      <div className="searchpanel-list">
        {results.map((result, idx) => (
          <button
            key={`${result.pageIndex}-${result.spanIndex}`}
            type="button"
            data-testid="search-result-item"
            data-action="search-result-click"
            onClick={() => {
              onResultClick(idx);
            }}
            className={
              idx === activeIdx
                ? 'searchpanel-result searchpanel-result-active'
                : 'searchpanel-result'
            }
            aria-label={t('search.resultAriaLabel', {
              page: result.pageIndex + 1,
              text: result.text,
            })}
          >
            <span className="searchpanel-result-page">
              {t('search.resultPage', { page: result.pageIndex + 1 })}
            </span>
            <span className="searchpanel-result-text">{result.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
