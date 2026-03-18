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

const modelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Annotation model — author field
// ---------------------------------------------------------------------------

describe('Annotation model — author field', () => {
  it('Annotation interface has author field', () => {
    expect(modelSource).toContain('readonly author: string');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — author filter select
// ---------------------------------------------------------------------------

describe('RightContextPanel — author filter', () => {
  it('renders comment-filter-author select', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-author"');
  });

  it('has Alle reviewers option (default empty value)', () => {
    expect(rightPanelSource).toContain("t('review.allReviewers')");
  });

  it('renders per-author options from uniqueAuthors', () => {
    expect(rightPanelSource).toContain('uniqueAuthors.map');
  });

  it('updates filterAuthor state on change', () => {
    expect(rightPanelSource).toContain('setFilterAuthor(');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — my comments filter button
// ---------------------------------------------------------------------------

describe('RightContextPanel — my comments quick filter', () => {
  it('renders my-comments-filter-btn', () => {
    expect(rightPanelSource).toContain('data-testid="my-comments-filter-btn"');
  });

  it('my-comments button sets filterAuthor to authorName', () => {
    const btnStart = rightPanelSource.indexOf('my-comments-filter-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('authorName');
    expect(btnBody).toContain('setFilterAuthor(');
  });

  it('my-comments button toggles off when already filtering by own name', () => {
    const btnStart = rightPanelSource.indexOf('my-comments-filter-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('filterAuthor === authorName');
  });

  it('my-comments button has Mijn opmerkingen aria-label', () => {
    expect(rightPanelSource).toContain("t('review.myComments')");
  });

  it('my-comments button shows active styling when own filter is on', () => {
    const btnStart = rightPanelSource.indexOf('my-comments-filter-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('bg-primary');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — author in comment card display
// ---------------------------------------------------------------------------

describe('RightContextPanel — author shown in comment card', () => {
  it('renders comment author name in comment header', () => {
    expect(rightPanelSource).toContain('comment.author');
  });

  it('falls back to Onbekend when author is empty', () => {
    expect(rightPanelSource).toContain("t('review.unknown')");
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — filteredComments includes author filter
// ---------------------------------------------------------------------------

describe('RightContextPanel — filteredComments includes author filter', () => {
  it('filteredComments filters by filterAuthor', () => {
    const filteredStart = rightPanelSource.indexOf('filteredComments = useMemo');
    const filteredEnd = rightPanelSource.indexOf('), [comments,', filteredStart) + 40;
    const filteredBody = rightPanelSource.slice(filteredStart, filteredEnd);
    expect(filteredBody).toContain('filterAuthor');
  });
});
