// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useTranslation } from 'react-i18next';
import { SearchPanel } from './components/SearchPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { IssuePanel } from './components/IssuePanel';
import type { SearchResult } from './hooks/useSearch';
import type { DocumentEvent } from './state/documentEvents';
import type { DocumentIssue } from './documentIssues';

interface ViewerSidePanelsProps {
  // Search panel
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  clearSearch: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  runSearch: (q: string) => void;
  searchResults: SearchResult[];
  activeSearchResultIdx: number;
  setActiveSearchResultIdx: (idx: number) => void;
  setPageIndex: (idx: number) => void;
  // Timeline panel
  showTimeline: boolean;
  setShowTimeline: (show: boolean) => void;
  documentEventLog: DocumentEvent[];
  // Issue panel
  showIssuePanel: boolean;
  setShowIssuePanel: (show: boolean) => void;
  documentIssues: DocumentIssue[];
}

export function ViewerSidePanels({
  isSearchOpen,
  setIsSearchOpen,
  clearSearch,
  searchQuery,
  setSearchQuery,
  runSearch,
  searchResults,
  activeSearchResultIdx,
  setActiveSearchResultIdx,
  setPageIndex,
  showTimeline,
  setShowTimeline,
  documentEventLog,
  showIssuePanel,
  setShowIssuePanel,
  documentIssues,
}: ViewerSidePanelsProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* ── Search panel ────────────────────────────────────────────────── */}
      {isSearchOpen && (
        <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="search-panel-container">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-foreground">{t('panels.search')}</span>
            <button
              data-testid="search-panel-close-btn"
              onClick={() => { setIsSearchOpen(false); clearSearch(); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('panels.searchCloseAriaLabel')}
            >
              ✕
            </button>
          </div>
          <SearchPanel
            query={searchQuery}
            onQueryChange={(q) => {
              setSearchQuery(q);
              void runSearch(q);
            }}
            results={searchResults}
            activeIdx={activeSearchResultIdx}
            onResultClick={(idx) => {
              setActiveSearchResultIdx(idx);
              if (searchResults[idx] !== undefined) {
                setPageIndex(searchResults[idx].pageIndex);
              }
            }}
            autoFocus
          />
        </div>
      )}

      {/* ── Timeline panel ──────────────────────────────────────────────── */}
      {showTimeline && (
        <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="timeline-panel-container">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-foreground">{t('panels.activity')}</span>
            <button
              data-testid="timeline-panel-close-btn"
              onClick={() => { setShowTimeline(false); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('panels.activityCloseAriaLabel')}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <TimelinePanel
              events={documentEventLog}
              onNavigate={(idx) => { setPageIndex(idx); }}
            />
          </div>
        </div>
      )}

      {/* ── Issue panel ─────────────────────────────────────────────────── */}
      {showIssuePanel && (
        <div className="w-64 shrink-0 flex flex-col border-r border-border bg-background" data-testid="issue-panel-container">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-foreground">{t('panels.issues')}</span>
            <button
              data-testid="issue-panel-close-btn"
              onClick={() => { setShowIssuePanel(false); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('panels.issuesCloseAriaLabel')}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <IssuePanel
              issues={documentIssues}
              onNavigate={(idx) => { setPageIndex(idx); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
