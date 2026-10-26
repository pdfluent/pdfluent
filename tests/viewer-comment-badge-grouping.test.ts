// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';


const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// Slice CommentsPanel body for scoped assertions

// Slice ReviewModeContent body for scoped assertions
const reviewStart = rightPanelSource.indexOf('function ReviewModeContent(');
const reviewEnd   = rightPanelSource.indexOf('\n// ---', reviewStart);
const reviewBody  = rightPanelSource.slice(reviewStart, reviewEnd);

// ---------------------------------------------------------------------------
// Comment count badge — left rail tab icon
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// CommentsPanel — grouping by page (left rail)
// ---------------------------------------------------------------------------



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
