// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const snapshotSource = readFileSync(
  new URL('../src/viewer/revisionSnapshot.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// revisionSnapshot — SnapshotAnnotation
// ---------------------------------------------------------------------------

describe('revisionSnapshot — SnapshotAnnotation interface', () => {
  it('has id field', () => {
    expect(snapshotSource).toContain('readonly id: string');
  });

  it('has type field', () => {
    expect(snapshotSource).toContain('readonly type: string');
  });

  it('has pageIndex field', () => {
    expect(snapshotSource).toContain('readonly pageIndex: number');
  });

  it('has contents field', () => {
    expect(snapshotSource).toContain('readonly contents: string');
  });

  it('has author field', () => {
    expect(snapshotSource).toContain('readonly author: string');
  });

  it('has status field', () => {
    expect(snapshotSource).toContain("readonly status: 'open' | 'resolved'");
  });

  it('has replies field', () => {
    expect(snapshotSource).toContain('readonly replies:');
  });
});

// ---------------------------------------------------------------------------
// revisionSnapshot — RevisionSnapshot
// ---------------------------------------------------------------------------

describe('revisionSnapshot — RevisionSnapshot interface', () => {
  it('has id field', () => {
    expect(snapshotSource).toContain('readonly id: string');
  });

  it('has capturedAt field', () => {
    expect(snapshotSource).toContain('readonly capturedAt: string');
  });

  it('has label field', () => {
    expect(snapshotSource).toContain('readonly label: string');
  });

  it('has annotations field', () => {
    expect(snapshotSource).toContain('readonly annotations: readonly SnapshotAnnotation[]');
  });

  it('has reviewStatuses field', () => {
    expect(snapshotSource).toContain('readonly reviewStatuses:');
  });

  it('has commentReplies field', () => {
    expect(snapshotSource).toContain('readonly commentReplies:');
  });

  it('has redactions field', () => {
    expect(snapshotSource).toContain('readonly redactions: readonly SnapshotAnnotation[]');
  });

  it('has issues field', () => {
    expect(snapshotSource).toContain('readonly issues: readonly DocumentIssue[]');
  });
});

// ---------------------------------------------------------------------------
// captureRevisionSnapshot
// ---------------------------------------------------------------------------

describe('captureRevisionSnapshot', () => {
  it('is exported', () => {
    expect(snapshotSource).toContain('export function captureRevisionSnapshot(');
  });

  it('accepts label, annotations, reviewStatuses, commentReplies, issues', () => {
    const fnStart = snapshotSource.indexOf('export function captureRevisionSnapshot(');
    const fnSig = snapshotSource.slice(fnStart, fnStart + 400);
    expect(fnSig).toContain('label');
    expect(fnSig).toContain('annotations');
    expect(fnSig).toContain('reviewStatuses');
    expect(fnSig).toContain('commentReplies');
    expect(fnSig).toContain('issues');
  });

  it('generates a unique id with snap- prefix', () => {
    expect(snapshotSource).toContain('`snap-');
  });

  it('sets capturedAt to ISO timestamp', () => {
    expect(snapshotSource).toContain('new Date().toISOString()');
  });

  it('separates non-redaction annotations from redactions', () => {
    expect(snapshotSource).toContain("a.type !== 'redaction'");
    expect(snapshotSource).toContain("a.type === 'redaction'");
  });

  it('attaches reviewStatuses to each annotation', () => {
    expect(snapshotSource).toContain('reviewStatuses.get(a.id)');
  });

  it('attaches replies to each annotation', () => {
    expect(snapshotSource).toContain('commentReplies.get(a.id)');
  });

  it('serialises reviewStatuses map as entries array', () => {
    expect(snapshotSource).toContain('Array.from(reviewStatuses.entries())');
  });

  it('serialises commentReplies map as entries array', () => {
    expect(snapshotSource).toContain('Array.from(commentReplies.entries())');
  });

  it('trims label and provides fallback', () => {
    expect(snapshotSource).toContain('label.trim()');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — snapshot wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — revision snapshot wiring', () => {
  it('imports captureRevisionSnapshot', () => {
    expect(viewerAppSource).toContain('captureRevisionSnapshot');
  });

  it('imports RevisionSnapshot type', () => {
    expect(viewerAppSource).toContain('RevisionSnapshot');
  });

  it('has revisionSnapshots state', () => {
    expect(viewerAppSource).toContain('revisionSnapshots');
    expect(viewerAppSource).toContain('setRevisionSnapshots');
  });

  it('defines handleCaptureSnapshot callback', () => {
    expect(viewerAppSource).toContain('handleCaptureSnapshot');
  });

  it('handleCaptureSnapshot calls captureRevisionSnapshot', () => {
    const fnStart = viewerAppSource.indexOf('handleCaptureSnapshot = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('captureRevisionSnapshot(');
  });

  it('handleCaptureSnapshot appends snapshot to revisionSnapshots', () => {
    const fnStart = viewerAppSource.indexOf('handleCaptureSnapshot = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setRevisionSnapshots(');
    expect(fnBody).toContain('[...prev, snapshot]');
  });
});
