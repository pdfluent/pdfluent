// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const summarySource = readFileSync(
  new URL('../src/viewer/export/reviewSummary.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// reviewSummary — ReviewSummaryData
// ---------------------------------------------------------------------------

describe('reviewSummary — ReviewSummaryData interface', () => {
  it('has title field', () => {
    expect(summarySource).toContain('title: string');
  });

  it('has generatedAt field', () => {
    expect(summarySource).toContain('generatedAt: string');
  });

  it('has comments array', () => {
    expect(summarySource).toContain('comments: Array<');
  });

  it('has redactions array', () => {
    expect(summarySource).toContain('redactions: Array<');
  });

  it('has issues array', () => {
    expect(summarySource).toContain('issues: DocumentIssue[]');
  });

  it('has events array', () => {
    expect(summarySource).toContain('events: DocumentEvent[]');
  });

  it('has metadataChanges array', () => {
    expect(summarySource).toContain('metadataChanges');
  });
});

// ---------------------------------------------------------------------------
// buildReviewSummaryData
// ---------------------------------------------------------------------------

describe('buildReviewSummaryData', () => {
  it('is exported', () => {
    expect(summarySource).toContain('export function buildReviewSummaryData(');
  });

  it('accepts title, annotations, reviewStatuses, commentReplies, issues, events', () => {
    const fnStart = summarySource.indexOf('export function buildReviewSummaryData(');
    const fnSig = summarySource.slice(fnStart, fnStart + 400);
    expect(fnSig).toContain('annotations');
    expect(fnSig).toContain('reviewStatuses');
    expect(fnSig).toContain('commentReplies');
    expect(fnSig).toContain('issues');
    expect(fnSig).toContain('events');
  });

  it('sets generatedAt to new ISO timestamp', () => {
    expect(summarySource).toContain('new Date().toISOString()');
  });

  it('filters annotations by text type for comments', () => {
    expect(summarySource).toContain("a.type === 'text'");
  });

  it('filters annotations by redaction type', () => {
    expect(summarySource).toContain("a.type === 'redaction'");
  });

  it('extracts metadataChanges from metadata_changed events', () => {
    expect(summarySource).toContain("e.type === 'metadata_changed'");
  });
});

// ---------------------------------------------------------------------------
// buildReviewSummaryJson
// ---------------------------------------------------------------------------

describe('buildReviewSummaryJson', () => {
  it('is exported', () => {
    expect(summarySource).toContain('export function buildReviewSummaryJson(');
  });

  it('uses JSON.stringify with indent', () => {
    expect(summarySource).toContain('JSON.stringify(data, null, 2)');
  });
});

// ---------------------------------------------------------------------------
// buildReviewSummaryMarkdown
// ---------------------------------------------------------------------------

describe('buildReviewSummaryMarkdown', () => {
  it('is exported', () => {
    expect(summarySource).toContain('export function buildReviewSummaryMarkdown(');
  });

  it('includes comments section', () => {
    expect(summarySource).toContain('## Commentaren');
  });

  it('includes redactions section', () => {
    expect(summarySource).toContain('## Redacties');
  });

  it('includes issues section', () => {
    expect(summarySource).toContain('## Problemen');
  });

  it('includes metadata changes section', () => {
    expect(summarySource).toContain('## Metadata wijzigingen');
  });

  it('renders replies in comments section', () => {
    expect(summarySource).toContain('c.replies');
  });
});

// ---------------------------------------------------------------------------
// buildReviewSummaryHtml
// ---------------------------------------------------------------------------

describe('buildReviewSummaryHtml', () => {
  it('is exported', () => {
    expect(summarySource).toContain('export function buildReviewSummaryHtml(');
  });

  it('produces DOCTYPE html', () => {
    expect(summarySource).toContain('<!DOCTYPE html>');
  });

  it('escapes HTML entities', () => {
    expect(summarySource).toContain('&amp;');
    expect(summarySource).toContain('&lt;');
  });

  it('includes comments section heading', () => {
    expect(summarySource).toContain('<h2>Commentaren</h2>');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — review summary export wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — handleExportReviewSummary', () => {
  it('imports buildReviewSummaryData', () => {
    expect(viewerAppSource).toContain('buildReviewSummaryData');
  });

  it('imports buildReviewSummaryJson', () => {
    expect(viewerAppSource).toContain('buildReviewSummaryJson');
  });

  it('imports buildReviewSummaryMarkdown', () => {
    expect(viewerAppSource).toContain('buildReviewSummaryMarkdown');
  });

  it('imports buildReviewSummaryHtml', () => {
    expect(viewerAppSource).toContain('buildReviewSummaryHtml');
  });

  it('defines handleExportReviewSummary callback', () => {
    expect(viewerAppSource).toContain('handleExportReviewSummary');
  });

  it('guards against empty export (no annotations, issues, events)', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations.length === 0');
    expect(fnBody).toContain('documentIssues.length === 0');
    expect(fnBody).toContain('documentEventLog.length === 0');
  });

  it('creates download anchor with correct extension for json', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("ext = 'json'");
  });

  it('creates download anchor with correct extension for markdown', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("ext = 'md'");
  });

  it('creates download anchor with correct extension for html', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("ext = 'html'");
  });

  it('revokes object URL after download', () => {
    expect(viewerAppSource).toContain('URL.revokeObjectURL(url)');
  });
});
