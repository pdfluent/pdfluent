// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Review filters — filter state
// ---------------------------------------------------------------------------

describe('ReviewModeContent — filter state', () => {
  function reviewModeBody(): string {
    const fnStart = rightPanelSource.indexOf('function ReviewModeContent(');
    const fnEnd = rightPanelSource.indexOf('\n// ---------------------------------------------------------------------------\n// Review mode — Redigeringen', fnStart);
    return rightPanelSource.slice(fnStart, fnEnd);
  }

  it('has filterText state', () => {
    expect(reviewModeBody()).toContain('filterText');
    expect(reviewModeBody()).toContain('setFilterText');
  });

  it('has filterAuthor state', () => {
    expect(reviewModeBody()).toContain('filterAuthor');
    expect(reviewModeBody()).toContain('setFilterAuthor');
  });

  it('has filterPage state', () => {
    expect(reviewModeBody()).toContain('filterPage');
    expect(reviewModeBody()).toContain('setFilterPage');
  });

  it('has filterStatus state', () => {
    expect(reviewModeBody()).toContain('filterStatus');
    expect(reviewModeBody()).toContain('setFilterStatus');
  });
});

// ---------------------------------------------------------------------------
// Review filters — filteredComments logic
// ---------------------------------------------------------------------------

describe('ReviewModeContent — filteredComments filter logic', () => {
  it('applies filterAuthor to filteredComments', () => {
    expect(rightPanelSource).toContain('filterAuthor && c.author !== filterAuthor');
  });

  it('applies filterPage to filteredComments', () => {
    expect(rightPanelSource).toContain("filterPage !== '' && String(c.pageIndex) !== filterPage");
  });

  it('applies filterStatus to filteredComments', () => {
    expect(rightPanelSource).toContain("filterStatus !== '' && (c.status ?? 'open') !== filterStatus");
  });

  it('applies filterText to filteredComments', () => {
    expect(rightPanelSource).toContain("filterText.toLowerCase()");
  });

  it('filteredComments useMemo depends on filterStatus', () => {
    const memoStart = rightPanelSource.indexOf('filteredComments = useMemo');
    const memoEnd = rightPanelSource.indexOf('), [comments,', memoStart) + 60;
    const memoBody = rightPanelSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('filterStatus');
  });
});

// ---------------------------------------------------------------------------
// Review filters — status filter UI
// ---------------------------------------------------------------------------

describe('ReviewModeContent — status filter UI', () => {
  it('renders comment-filter-status select', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-status"');
  });

  it('has Alle statussen default option', () => {
    expect(rightPanelSource).toContain("t('review.allStatuses')");
  });

  it('has Open option', () => {
    const statusSelect = rightPanelSource.slice(
      rightPanelSource.indexOf('comment-filter-status'),
      rightPanelSource.indexOf('</select>', rightPanelSource.indexOf('comment-filter-status')) + 9
    );
    expect(statusSelect).toContain('"open"');
    expect(statusSelect).toContain('Open');
  });

  it('has Opgelost option for resolved', () => {
    const statusSelect = rightPanelSource.slice(
      rightPanelSource.indexOf('comment-filter-status'),
      rightPanelSource.indexOf('</select>', rightPanelSource.indexOf('comment-filter-status')) + 9
    );
    expect(statusSelect).toContain('"resolved"');
    expect(statusSelect).toContain("t('review.statusResolved')");
  });
});

// ---------------------------------------------------------------------------
// Review filters — anyFilterActive and clearAllFilters
// ---------------------------------------------------------------------------

describe('ReviewModeContent — filter state management', () => {
  it('anyFilterActive includes filterStatus', () => {
    expect(rightPanelSource).toContain("filterStatus !== ''");
  });

  it('clearAllFilters resets filterStatus', () => {
    const clearStart = rightPanelSource.indexOf('function clearAllFilters()');
    const clearEnd = rightPanelSource.indexOf('\n  }', clearStart) + 4;
    const clearBody = rightPanelSource.slice(clearStart, clearEnd);
    expect(clearBody).toContain("setFilterStatus('')");
  });

  it('renders comment-filter-clear button when any filter is active', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-clear"');
  });

  it('useEffect deselects active comment when filterStatus changes', () => {
    const effectStart = rightPanelSource.indexOf('if (!isVisible) onCommentSelect(-1)');
    const effectBody = rightPanelSource.slice(effectStart, effectStart + 100);
    expect(effectBody).toContain('filterStatus');
  });
});
