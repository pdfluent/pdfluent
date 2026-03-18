// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// Locate ReviewModeContent function bounds for scoped assertions
const reviewStart = panelSource.indexOf('function ReviewModeContent');
const reviewEnd = panelSource.indexOf('\nfunction ', reviewStart + 1);
const reviewSource = reviewEnd === -1
  ? panelSource.slice(reviewStart)
  : panelSource.slice(reviewStart, reviewEnd);

// ---------------------------------------------------------------------------
// Filter UI testids
// ---------------------------------------------------------------------------

describe('review filter — testids', () => {
  it('has data-testid="comment-filter-input"', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-input"');
  });

  it('has data-testid="comment-filter-author"', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-author"');
  });

  it('has data-testid="comment-filter-count"', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-count"');
  });
});

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

describe('review filter — state', () => {
  it('declares filterText state', () => {
    expect(reviewSource).toContain('filterText');
    expect(reviewSource).toContain('setFilterText');
  });

  it('declares filterAuthor state', () => {
    expect(reviewSource).toContain('filterAuthor');
    expect(reviewSource).toContain('setFilterAuthor');
  });

  it('filterText input uses placeholder "Filter opmerkingen…"', () => {
    expect(reviewSource).toContain('Filter opmerkingen…');
  });

  it('filterAuthor select has "Alle reviewers" default option', () => {
    expect(reviewSource).toContain('Alle reviewers');
  });
});

// ---------------------------------------------------------------------------
// Filtered comments computation
// ---------------------------------------------------------------------------

describe('review filter — filteredComments', () => {
  it('declares filteredComments variable', () => {
    expect(reviewSource).toContain('filteredComments');
  });

  it('filters by author when filterAuthor is set', () => {
    expect(reviewSource).toContain('c.author !== filterAuthor');
  });

  it('filters by text using toLowerCase includes', () => {
    expect(reviewSource).toContain('filterText.toLowerCase()');
    expect(reviewSource).toContain('.toLowerCase().includes(q)');
  });

  it('shows filter count with "van" label when filter active', () => {
    expect(reviewSource).toContain('van {comments.length} opmerkingen');
  });
});

// ---------------------------------------------------------------------------
// commentFlatIndexMap
// ---------------------------------------------------------------------------

describe('review filter — commentFlatIndexMap', () => {
  it('declares commentFlatIndexMap', () => {
    expect(reviewSource).toContain('commentFlatIndexMap');
  });

  it('maps comment id to original flat index', () => {
    expect(reviewSource).toContain('commentFlatIndexMap.get(comment.id)');
  });

  it('derives originalIdx from commentFlatIndexMap for onCommentSelect', () => {
    expect(reviewSource).toContain('const originalIdx = commentFlatIndexMap.get(comment.id) ?? -1;');
  });

  it('calls onCommentSelect with originalIdx (not a flat counter)', () => {
    expect(reviewSource).toContain('onCommentSelect(originalIdx)');
  });

  it('uses originalIdx for isActive check against activeCommentIdx', () => {
    expect(reviewSource).toContain('const isActive = originalIdx === activeCommentIdx;');
  });

  it('does not use a local flat counter that would break under filters', () => {
    expect(reviewSource).not.toContain('let flatIdx = 0');
    expect(reviewSource).not.toContain('onCommentSelect(currentFlatIdx)');
  });
});

// ---------------------------------------------------------------------------
// Unique authors dropdown
// ---------------------------------------------------------------------------

describe('review filter — unique authors', () => {
  it('computes uniqueAuthors', () => {
    expect(reviewSource).toContain('uniqueAuthors');
  });

  it('renders author options from uniqueAuthors', () => {
    expect(reviewSource).toContain('uniqueAuthors.map');
  });
});

// ---------------------------------------------------------------------------
// Active comment deselection on filter change
// ---------------------------------------------------------------------------

describe('review filter — deselection', () => {
  it('filter change triggers useEffect that deselects invisible active comment', () => {
    expect(reviewSource).toContain('onCommentSelect(-1)');
  });

  it('checks if active comment is visible in filteredComments', () => {
    expect(reviewSource).toContain('filteredComments.some');
  });
});

// ---------------------------------------------------------------------------
// Regressions — existing review mode tests
// ---------------------------------------------------------------------------

describe('review filter — no regressions', () => {
  it('ReviewModeContent still exists', () => {
    expect(panelSource).toContain('function ReviewModeContent');
  });

  it('Opmerkingen section title still present', () => {
    expect(panelSource).toContain('Opmerkingen');
  });

  it('review-comment-item testid still present', () => {
    expect(reviewSource).toContain('data-testid="review-comment-item"');
  });

  it('review-comment-group-heading testid still present', () => {
    expect(reviewSource).toContain('data-testid="review-comment-group-heading"');
  });

  it('comment.author || Onbekend fallback still present', () => {
    expect(reviewSource).toContain("comment.author || 'Onbekend'");
  });

  it('comment.contents still shown', () => {
    expect(reviewSource).toContain('comment.contents');
  });
});

// ---------------------------------------------------------------------------
// filterPage state
// ---------------------------------------------------------------------------

describe('review filter — filterPage state', () => {
  it('declares filterPage state initialised to empty string', () => {
    expect(reviewSource).toContain("const [filterPage, setFilterPage] = useState('');");
  });

  it('filterPage lives alongside filterText and filterAuthor', () => {
    const textPos   = reviewSource.indexOf("const [filterText, setFilterText] = useState('')");
    const authorPos = reviewSource.indexOf("const [filterAuthor, setFilterAuthor] = useState('')");
    const pagePos   = reviewSource.indexOf("const [filterPage, setFilterPage] = useState('')");
    expect(textPos).toBeGreaterThan(-1);
    expect(authorPos).toBeGreaterThan(-1);
    expect(pagePos).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// uniquePages useMemo
// ---------------------------------------------------------------------------

describe('review filter — uniquePages useMemo', () => {
  it('declares uniquePages via useMemo', () => {
    expect(reviewSource).toContain('const uniquePages = useMemo(');
  });

  it('uniquePages collects c.pageIndex values', () => {
    const memoStart = reviewSource.indexOf('const uniquePages = useMemo(');
    const memoEnd   = reviewSource.indexOf('}, [comments]);', memoStart) + 15;
    const memoBody  = reviewSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('c.pageIndex');
  });

  it('uniquePages sorts ascending', () => {
    const memoStart = reviewSource.indexOf('const uniquePages = useMemo(');
    const memoEnd   = reviewSource.indexOf('}, [comments]);', memoStart) + 15;
    const memoBody  = reviewSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('.sort((a, b) => a - b)');
  });

  it('uniquePages deduplicates with a seen Set', () => {
    const memoStart = reviewSource.indexOf('const uniquePages = useMemo(');
    const memoEnd   = reviewSource.indexOf('}, [comments]);', memoStart) + 15;
    const memoBody  = reviewSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('seen.has(c.pageIndex)');
  });
});

// ---------------------------------------------------------------------------
// filteredComments — page filter predicate
// ---------------------------------------------------------------------------

describe('review filter — filteredComments page filter', () => {
  it('filteredComments applies page filter guard', () => {
    expect(reviewSource).toContain("filterPage !== ''");
    expect(reviewSource).toContain('String(c.pageIndex) !== filterPage');
  });

  it('filteredComments dep array includes filterPage', () => {
    expect(reviewSource).toContain('[comments, filterText, filterAuthor, filterPage,');
  });
});

// ---------------------------------------------------------------------------
// Active-deselect useEffect — filterPage in deps
// ---------------------------------------------------------------------------

describe('review filter — active-deselect useEffect includes filterPage', () => {
  it('active-deselect dep array contains filterText, filterAuthor, filterPage', () => {
    expect(reviewSource).toContain('filterText, filterAuthor, filterPage, filterStatus]); // eslint-disable-line');
  });
});

// ---------------------------------------------------------------------------
// anyFilterActive
// ---------------------------------------------------------------------------

describe('review filter — anyFilterActive', () => {
  it('declares anyFilterActive combining all filter states', () => {
    expect(reviewSource).toContain(
      "const anyFilterActive = filterText !== '' || filterAuthor !== '' || filterPage !== '' || filterStatus !== '';"
    );
  });
});

// ---------------------------------------------------------------------------
// clearAllFilters
// ---------------------------------------------------------------------------

describe('review filter — clearAllFilters', () => {
  it('declares clearAllFilters function', () => {
    expect(reviewSource).toContain('function clearAllFilters(): void {');
  });

  it('clearAllFilters resets all three filter states', () => {
    const fnStart = reviewSource.indexOf('function clearAllFilters(): void {');
    const fnEnd   = reviewSource.indexOf('}', fnStart) + 1;
    const fnBody  = reviewSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setFilterText('')");
    expect(fnBody).toContain("setFilterAuthor('')");
    expect(fnBody).toContain("setFilterPage('')");
  });
});

// ---------------------------------------------------------------------------
// comment-filter-page dropdown
// ---------------------------------------------------------------------------

describe('review filter — comment-filter-page dropdown', () => {
  it('renders comment-filter-page select', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-page"');
  });

  it('comment-filter-page binds to filterPage', () => {
    const selStart = reviewSource.indexOf('data-testid="comment-filter-page"');
    const selEnd   = reviewSource.indexOf('</select>', selStart) + 9;
    const selEl    = reviewSource.slice(selStart, selEnd);
    expect(selEl).toContain('value={filterPage}');
  });

  it('comment-filter-page calls setFilterPage on change', () => {
    const selStart = reviewSource.indexOf('data-testid="comment-filter-page"');
    const selEnd   = reviewSource.indexOf('</select>', selStart) + 9;
    const selEl    = reviewSource.slice(selStart, selEnd);
    expect(selEl).toContain('setFilterPage(e.target.value)');
  });

  it("comment-filter-page has 'Alle pagina's' as empty option", () => {
    const selStart = reviewSource.indexOf('data-testid="comment-filter-page"');
    const selEnd   = reviewSource.indexOf('</select>', selStart) + 9;
    const selEl    = reviewSource.slice(selStart, selEnd);
    expect(selEl).toContain("<option value=\"\">Alle pagina's</option>");
  });

  it('page option value is String(p) and label is 1-based', () => {
    const selStart = reviewSource.indexOf('data-testid="comment-filter-page"');
    const selEnd   = reviewSource.indexOf('</select>', selStart) + 9;
    const selEl    = reviewSource.slice(selStart, selEnd);
    expect(selEl).toContain('value={String(p)}');
    expect(selEl).toContain('Pagina {p + 1}');
  });

  it('comment-filter-page appears after comment-filter-author', () => {
    const authorPos = reviewSource.indexOf('data-testid="comment-filter-author"');
    const pagePos   = reviewSource.indexOf('data-testid="comment-filter-page"');
    expect(authorPos).toBeGreaterThan(-1);
    expect(pagePos).toBeGreaterThan(authorPos);
  });
});

// ---------------------------------------------------------------------------
// comment-filter-clear button
// ---------------------------------------------------------------------------

describe('review filter — comment-filter-clear button', () => {
  it('renders comment-filter-clear button', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-clear"');
  });

  it('comment-filter-clear calls clearAllFilters on click', () => {
    const btnStart = reviewSource.indexOf('data-testid="comment-filter-clear"');
    const btnEnd   = reviewSource.indexOf('/>', btnStart) + 2;
    const btnEl    = reviewSource.slice(btnStart, btnEnd);
    expect(btnEl).toContain('onClick={clearAllFilters}');
  });

  it('comment-filter-clear appears after comment-filter-page', () => {
    const pagePos  = reviewSource.indexOf('data-testid="comment-filter-page"');
    const clearPos = reviewSource.indexOf('data-testid="comment-filter-clear"');
    expect(clearPos).toBeGreaterThan(pagePos);
  });
});

// ---------------------------------------------------------------------------
// comment-filter-empty zero-results state
// ---------------------------------------------------------------------------

describe('review filter — comment-filter-empty state', () => {
  it('renders comment-filter-empty element', () => {
    expect(reviewSource).toContain('data-testid="comment-filter-empty"');
  });

  it('comment-filter-empty is conditional on anyFilterActive && filteredComments.length === 0', () => {
    const emptyPos = reviewSource.indexOf('data-testid="comment-filter-empty"');
    const condPos  = reviewSource.lastIndexOf('anyFilterActive && filteredComments.length === 0', emptyPos);
    expect(condPos).toBeGreaterThan(-1);
    expect(emptyPos - condPos).toBeLessThan(200);
  });
});
