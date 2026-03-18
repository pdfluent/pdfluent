// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const leftNavSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// Slice CommentsPanel body for scoped assertions
const commentsPanelStart = leftNavSource.indexOf('function CommentsPanel(');
const commentsPanelEnd   = leftNavSource.indexOf('\nfunction ', commentsPanelStart + 1);
const commentsPanelBody  = leftNavSource.slice(commentsPanelStart, commentsPanelEnd);

// Slice ReviewModeContent body for scoped assertions
const reviewStart = rightPanelSource.indexOf('function ReviewModeContent(');
const reviewEnd   = rightPanelSource.indexOf('\n// ---', reviewStart);
const reviewBody  = rightPanelSource.slice(reviewStart, reviewEnd);

// ---------------------------------------------------------------------------
// Comment count badge — left rail tab icon
// ---------------------------------------------------------------------------

describe('LeftNavRail — comments badge', () => {
  it('renders a badge with data-testid="comments-badge"', () => {
    expect(leftNavSource).toContain('data-testid="comments-badge"');
  });

  it('badge is only shown when commentCount > 0', () => {
    expect(leftNavSource).toContain('commentCount > 0');
  });

  it('badge is scoped to the comments tab (panel.id === "comments")', () => {
    expect(leftNavSource).toContain("panel.id === 'comments'");
  });

  it('badge displays the comment count', () => {
    expect(leftNavSource).toContain('{commentCount}');
  });

  it('badge is absent (null) when no comments', () => {
    // The condition ensures zero count produces no badge
    expect(leftNavSource).toContain("panel.id === 'comments' ? comments.length : 0");
  });

  it('comments is destructured from props in LeftNavRail', () => {
    const railStart = leftNavSource.indexOf('export function LeftNavRail(');
    const destructure = leftNavSource.indexOf('const { pageCount, comments } = props;', railStart);
    expect(destructure).toBeGreaterThan(railStart);
  });

  it('icon is wrapped in a relative container for badge positioning', () => {
    expect(leftNavSource).toContain('className="relative"');
  });
});

// ---------------------------------------------------------------------------
// CommentsPanel — grouping by page (left rail)
// ---------------------------------------------------------------------------

describe('CommentsPanel — grouping by page', () => {
  it('renders group headings with data-testid="comment-group-heading"', () => {
    expect(commentsPanelBody).toContain('data-testid="comment-group-heading"');
  });

  it('shows "Pagina {pageIndex + 1}" in group headings', () => {
    expect(commentsPanelBody).toContain("t('review.commentPage', { page: pageIndex + 1 })");
  });

  it('groups comments into a Map keyed by pageIndex', () => {
    expect(commentsPanelBody).toContain('new Map<number, Annotation[]>()');
    expect(commentsPanelBody).toContain('comment.pageIndex');
  });

  it('sorts group keys in ascending page order', () => {
    expect(commentsPanelBody).toContain('sort((a, b) => a - b)');
  });

  it('uses sortedPageIndices to drive the group render loop', () => {
    expect(commentsPanelBody).toContain('sortedPageIndices');
  });

  it('renders each group using Array.from on groups.keys()', () => {
    expect(commentsPanelBody).toContain('Array.from(groups.keys())');
  });

  it('still renders author for each comment', () => {
    expect(commentsPanelBody).toContain('comment.author');
  });

  it('still renders contents for each comment', () => {
    expect(commentsPanelBody).toContain('comment.contents');
  });

  it('still shows empty state when no comments', () => {
    expect(commentsPanelBody).toContain("t('leftNav.noCommentsSide'");
  });

  it('uses comment.id as key within a group', () => {
    expect(commentsPanelBody).toContain('key={comment.id}');
  });

  it('uses pageIndex as key for each group container', () => {
    expect(commentsPanelBody).toContain('key={pageIndex}');
  });
});

// ---------------------------------------------------------------------------
// ReviewModeContent — grouping by page (right panel)
// ---------------------------------------------------------------------------

describe('ReviewModeContent — grouping by page', () => {
  it('renders group headings with data-testid="review-comment-group-heading"', () => {
    expect(reviewBody).toContain('data-testid="review-comment-group-heading"');
  });

  it('shows "Pagina {pageIndex + 1}" in group headings', () => {
    expect(reviewBody).toContain("t('review.commentPage', { page: pageIndex + 1 })");
  });

  it('groups comments into a Map keyed by pageIndex', () => {
    expect(reviewBody).toContain('new Map<number, Annotation[]>()');
    expect(reviewBody).toContain('comment.pageIndex');
  });

  it('sorts group keys in ascending page order', () => {
    expect(reviewBody).toContain('sort((a, b) => a - b)');
  });

  it('uses sortedPageIndices to drive the group render loop', () => {
    expect(reviewBody).toContain('sortedPageIndices');
  });

  it('still renders total comment count summary', () => {
    expect(reviewBody).toContain('comments.length');
    expect(reviewBody).toContain("t('review.commentCount");
  });

  it('still renders author per comment', () => {
    expect(reviewBody).toContain('comment.author');
  });

  it('still renders contents per comment', () => {
    expect(reviewBody).toContain('comment.contents');
  });

  it('still shows empty state when no comments', () => {
    expect(reviewBody).toContain("t('leftNav.noCommentsSide'");
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('LeftNavRail — no regressions', () => {
  it('ThumbnailPanel still present', () => {
    expect(leftNavSource).toContain('function ThumbnailPanel(');
  });

  it('BookmarksPanel still present', () => {
    expect(leftNavSource).toContain('function BookmarksPanel(');
  });

  it('comments: Annotation[] still in LeftNavRailProps', () => {
    expect(leftNavSource).toContain('comments: Annotation[]');
  });

  it('comments still passed to CommentsPanel via PanelContent', () => {
    expect(leftNavSource).toContain('comments={comments}');
  });

  it('auto-scroll to active thumbnail still present', () => {
    expect(leftNavSource).toContain('scrollIntoView');
  });
});

describe('RightContextPanel — no regressions', () => {
  it('ReviewModeContent is still wired in review mode', () => {
    expect(rightPanelSource).toContain('<ReviewModeContent comments={comments}');
  });

  it('MetadataInfo still present', () => {
    expect(rightPanelSource).toContain('function MetadataInfo(');
  });

  it('comments: Annotation[] still in RightContextPanelProps', () => {
    expect(rightPanelSource).toContain('comments: Annotation[]');
  });
});
