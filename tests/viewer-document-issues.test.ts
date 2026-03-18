// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const issuesSource = readFileSync(
  new URL('../src/viewer/documentIssues.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// documentIssues — types
// ---------------------------------------------------------------------------

describe('documentIssues — IssueStatus', () => {
  it('defines open status', () => {
    expect(issuesSource).toContain("'open'");
  });

  it('defines resolved status', () => {
    expect(issuesSource).toContain("'resolved'");
  });
});

describe('documentIssues — IssueSource', () => {
  it('defines comment source', () => {
    expect(issuesSource).toContain("'comment'");
  });

  it('defines redaction source', () => {
    expect(issuesSource).toContain("'redaction'");
  });

  it('defines annotation source', () => {
    expect(issuesSource).toContain("'annotation'");
  });
});

describe('documentIssues — DocumentIssue interface', () => {
  it('has id field', () => {
    expect(issuesSource).toContain('readonly id:');
  });

  it('has description field', () => {
    expect(issuesSource).toContain('readonly description:');
  });

  it('has page field', () => {
    expect(issuesSource).toContain('readonly page: number');
  });

  it('has author field', () => {
    expect(issuesSource).toContain('readonly author: string');
  });

  it('has status field', () => {
    expect(issuesSource).toContain('readonly status: IssueStatus');
  });

  it('has source field', () => {
    expect(issuesSource).toContain('readonly source: IssueSource');
  });

  it('has annotationId field', () => {
    expect(issuesSource).toContain('readonly annotationId: string');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentIssues — function
// ---------------------------------------------------------------------------

describe('extractDocumentIssues — function', () => {
  it('exports extractDocumentIssues', () => {
    expect(issuesSource).toContain('export function extractDocumentIssues(');
  });

  it('accepts annotations and reviewStatuses params', () => {
    const fnStart = issuesSource.indexOf('export function extractDocumentIssues(');
    const fnSig = issuesSource.slice(fnStart, fnStart + 300);
    expect(fnSig).toContain('annotations');
    expect(fnSig).toContain('reviewStatuses');
  });

  it('extracts comment issues from text annotations', () => {
    expect(issuesSource).toContain("ann.type === 'text'");
    expect(issuesSource).toContain("source: 'comment'");
  });

  it('extracts redaction issues from redaction annotations', () => {
    expect(issuesSource).toContain("ann.type === 'redaction'");
    expect(issuesSource).toContain("source: 'redaction'");
  });

  it('extracts annotation issues from highlight annotations', () => {
    expect(issuesSource).toContain("ann.type === 'highlight'");
    expect(issuesSource).toContain("source: 'annotation'");
  });

  it('extracts annotation issues from underline annotations', () => {
    expect(issuesSource).toContain("ann.type === 'underline'");
  });

  it('extracts annotation issues from strikeout annotations', () => {
    expect(issuesSource).toContain("ann.type === 'strikeout'");
  });

  it('extracts annotation issues from rectangle annotations', () => {
    expect(issuesSource).toContain("ann.type === 'square'");
  });

  it('uses reviewStatuses.get to look up comment status', () => {
    expect(issuesSource).toContain('reviewStatuses.get(ann.id)');
  });

  it('defaults to open status when not in reviewStatuses', () => {
    expect(issuesSource).toContain("?? 'open'");
  });

  it('sorts results by page ascending', () => {
    expect(issuesSource).toContain('a.page - b.page');
  });

  it('sorts open issues before resolved within the same page', () => {
    expect(issuesSource).toContain("a.status === 'open'");
  });
});

// ---------------------------------------------------------------------------
// countOpenIssues / countResolvedIssues
// ---------------------------------------------------------------------------

describe('documentIssues — count helpers', () => {
  it('exports countOpenIssues', () => {
    expect(issuesSource).toContain('export function countOpenIssues(');
  });

  it('countOpenIssues filters by open status', () => {
    expect(issuesSource).toContain("i.status === 'open'");
  });

  it('exports countResolvedIssues', () => {
    expect(issuesSource).toContain('export function countResolvedIssues(');
  });

  it('countResolvedIssues filters by resolved status', () => {
    expect(issuesSource).toContain("i.status === 'resolved'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — documentIssues wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — documentIssues wiring', () => {
  it('imports extractDocumentIssues', () => {
    expect(viewerAppSource).toContain('extractDocumentIssues');
  });

  it('derives documentIssues via useMemo', () => {
    expect(viewerAppSource).toContain('documentIssues');
    const memoIdx = viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)');
    expect(memoIdx).toBeGreaterThan(0);
  });

  it('documentIssues depends on allAnnotations', () => {
    const memoStart = viewerAppSource.indexOf('extractDocumentIssues(allAnnotations');
    const memoEnd = viewerAppSource.indexOf(']', memoStart) + 1;
    const memoDeps = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoDeps).toContain('allAnnotations');
  });

  it('documentIssues depends on reviewStatuses', () => {
    const memoStart = viewerAppSource.indexOf('extractDocumentIssues(allAnnotations');
    const memoEnd = viewerAppSource.indexOf(']', memoStart) + 1;
    const memoDeps = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoDeps).toContain('reviewStatuses');
  });
});
