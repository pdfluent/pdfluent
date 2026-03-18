// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const compareSource = readFileSync(
  new URL('../src/viewer/revisionCompare.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// SnapshotDiff — interface
// ---------------------------------------------------------------------------

describe('revisionCompare — SnapshotDiff interface', () => {
  it('has newAnnotations field', () => {
    expect(compareSource).toContain('newAnnotations:');
  });

  it('has deletedAnnotations field', () => {
    expect(compareSource).toContain('deletedAnnotations:');
  });

  it('has resolvedIssues field', () => {
    expect(compareSource).toContain('resolvedIssues:');
  });

  it('has newRedactions field', () => {
    expect(compareSource).toContain('newRedactions:');
  });

  it('has metadataChanged field', () => {
    expect(compareSource).toContain('metadataChanged: boolean');
  });

  it('has hasDifferences field', () => {
    expect(compareSource).toContain('hasDifferences: boolean');
  });
});

// ---------------------------------------------------------------------------
// compareSnapshots
// ---------------------------------------------------------------------------

describe('compareSnapshots', () => {
  it('is exported', () => {
    expect(compareSource).toContain('export function compareSnapshots(');
  });

  it('accepts before and after snapshots', () => {
    const fnStart = compareSource.indexOf('export function compareSnapshots(');
    const fnSig = compareSource.slice(fnStart, fnStart + 200);
    expect(fnSig).toContain('before');
    expect(fnSig).toContain('after');
  });

  it('detects new annotations (in after but not in before)', () => {
    expect(compareSource).toContain('newAnnotations');
    expect(compareSource).toContain('!beforeAnnotIds.has(a.id)');
  });

  it('detects deleted annotations (in before but not in after)', () => {
    expect(compareSource).toContain('deletedAnnotations');
    expect(compareSource).toContain('!afterAnnotIds.has(a.id)');
  });

  it('detects resolved issues (open → resolved transition)', () => {
    expect(compareSource).toContain("beforeStatus === 'open' && afterStatus === 'resolved'");
  });

  it('detects new redactions', () => {
    expect(compareSource).toContain('newRedactions');
    expect(compareSource).toContain('!beforeRedactionIds.has(r.id)');
  });

  it('sets hasDifferences to false when nothing changed', () => {
    expect(compareSource).toContain('hasDifferences');
    expect(compareSource).toContain('newAnnotations.length > 0');
  });

  it('returns hasDifferences: true when any difference exists', () => {
    expect(compareSource).toContain('resolvedIssues.length > 0');
    expect(compareSource).toContain('newRedactions.length > 0');
  });
});

// ---------------------------------------------------------------------------
// formatSnapshotDiffMarkdown
// ---------------------------------------------------------------------------

describe('formatSnapshotDiffMarkdown', () => {
  it('is exported', () => {
    expect(compareSource).toContain('export function formatSnapshotDiffMarkdown(');
  });

  it('accepts before, after, and diff params', () => {
    const fnStart = compareSource.indexOf('export function formatSnapshotDiffMarkdown(');
    const fnSig = compareSource.slice(fnStart, fnStart + 300);
    expect(fnSig).toContain('before');
    expect(fnSig).toContain('after');
    expect(fnSig).toContain('diff');
  });

  it('includes snapshot labels and timestamps', () => {
    expect(compareSource).toContain('before.label');
    expect(compareSource).toContain('after.label');
    expect(compareSource).toContain('before.capturedAt');
  });

  it('renders message when no differences', () => {
    expect(compareSource).toContain('!diff.hasDifferences');
    expect(compareSource).toContain('Geen verschillen');
  });

  it('renders new annotations section', () => {
    expect(compareSource).toContain('## Nieuwe annotaties');
  });

  it('renders deleted annotations section', () => {
    expect(compareSource).toContain('## Verwijderde annotaties');
  });

  it('renders resolved issues section', () => {
    expect(compareSource).toContain('## Opgeloste problemen');
  });

  it('renders new redactions section', () => {
    expect(compareSource).toContain('## Nieuwe redacties');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — snapshot comparison wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — handleCompareSnapshots wiring', () => {
  it('imports compareSnapshots', () => {
    expect(viewerAppSource).toContain('compareSnapshots');
  });

  it('imports formatSnapshotDiffMarkdown', () => {
    expect(viewerAppSource).toContain('formatSnapshotDiffMarkdown');
  });

  it('defines handleCompareSnapshots callback', () => {
    expect(viewerAppSource).toContain('handleCompareSnapshots');
  });

  it('guards against missing snapshots (no crash on invalid index)', () => {
    const fnStart = viewerAppSource.indexOf('handleCompareSnapshots = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!before || !after');
  });

  it('downloads revision-diff.md', () => {
    const fnStart = viewerAppSource.indexOf('handleCompareSnapshots = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('revision-diff.md');
  });

  it('revokes object URL after download', () => {
    const fnStart = viewerAppSource.indexOf('handleCompareSnapshots = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('URL.revokeObjectURL(url)');
  });
});
