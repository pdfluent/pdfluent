// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PdfDocument } from '../../core/document';
import type { PdfEngine } from '../../core/engine/PdfEngine';

/** A single text-search hit within the document. */
export interface SearchResult {
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  spanIndex: number;
}

export function useSearch(
  pdfDoc: PdfDocument | null,
  engine: PdfEngine | null,
  pageCount: number,
  pageIndex: number,
  setPageIndex: (idx: number | ((prev: number) => number)) => void,
) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeSearchResultIdx, setActiveSearchResultIdx] = useState(-1);

  /** Reset search to initial state (query, results, active index). */
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setActiveSearchResultIdx(-1);
  }, []);

  /**
   * Run a case-insensitive full-document search.
   * Iterates every page, extracts TextSpans, and collects all spans whose
   * text contains the (trimmed, lowercased) query.
   */
  const runSearch = useCallback(async (query: string): Promise<void> => {
    if (!pdfDoc || !engine) return;
    const normalized = query.trim().toLowerCase();
    if (normalized === '') {
      setSearchResults([]);
      setActiveSearchResultIdx(-1);
      return;
    }
    const results: SearchResult[] = [];
    const queryEngine = engine.query;
    for (let p = 0; p < pageCount; p++) {
      const result = await queryEngine.extractPageTextSpans(pdfDoc, p);
      if (!result.success) continue;
      result.value.forEach((span, spanIndex) => {
        if (span.text.toLowerCase().includes(normalized)) {
          results.push({ pageIndex: p, rect: span.rect, text: span.text, spanIndex });
        }
      });
    }
    setSearchResults(results);
    setActiveSearchResultIdx(results.length > 0 ? 0 : -1);
  }, [pdfDoc, engine, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Advance to the next search result (wraps around). */
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = activeSearchResultIdx < searchResults.length - 1 ? activeSearchResultIdx + 1 : 0;
    setActiveSearchResultIdx(next);
    const nextItem = searchResults[next];
    if (nextItem) setPageIndex(nextItem.pageIndex);
  }, [searchResults, activeSearchResultIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Go to the previous search result (wraps around). */
  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = activeSearchResultIdx > 0 ? activeSearchResultIdx - 1 : searchResults.length - 1;
    setActiveSearchResultIdx(prev);
    const prevItem = searchResults[prev];
    if (prevItem) setPageIndex(prevItem.pageIndex);
  }, [searchResults, activeSearchResultIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search persistence: clear search when a new document is opened.
  // Search results are document-specific — persisting across loads would show stale matches.
  useEffect(() => {
    clearSearch();
    setIsSearchOpen(false);
  }, [pdfDoc?.id, clearSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search result rects for the current page — passed to AnnotationOverlay as yellow highlights.
  // Also compute the local index of the active result within the current-page results.
  const { pageSearchHighlights, activeSearchHighlightIdx } = useMemo(() => {
    const pageResults = searchResults.filter(r => r.pageIndex === pageIndex);
    const activeResult = searchResults[activeSearchResultIdx];
    const localIdx = activeResult?.pageIndex === pageIndex
      ? pageResults.findIndex(r => r.spanIndex === activeResult.spanIndex)
      : -1;
    return { pageSearchHighlights: pageResults.map(r => r.rect), activeSearchHighlightIdx: localIdx };
  }, [searchResults, pageIndex, activeSearchResultIdx]);

  return {
    isSearchOpen, setIsSearchOpen,
    searchQuery, setSearchQuery,
    searchResults,
    activeSearchResultIdx, setActiveSearchResultIdx,
    clearSearch,
    runSearch,
    nextSearchResult,
    prevSearchResult,
    pageSearchHighlights,
    activeSearchHighlightIdx,
  };
}
