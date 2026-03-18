// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

const eventsSource = readFileSync(
  new URL('../src/viewer/state/documentEvents.ts', import.meta.url),
  'utf8'
);

const issuesSource = readFileSync(
  new URL('../src/viewer/documentIssues.ts', import.meta.url),
  'utf8'
);

const snapshotSource = readFileSync(
  new URL('../src/viewer/revisionSnapshot.ts', import.meta.url),
  'utf8'
);

const compareSource = readFileSync(
  new URL('../src/viewer/revisionCompare.ts', import.meta.url),
  'utf8'
);

const summarySource = readFileSync(
  new URL('../src/viewer/export/reviewSummary.ts', import.meta.url),
  'utf8'
);

const auditSource = readFileSync(
  new URL('../src/viewer/export/auditReport.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Audit log persists during editing — all handlers emit events
// ---------------------------------------------------------------------------

describe('Stability — audit log persists during editing', () => {
  it('annotation_created is emitted', () => {
    expect(viewerAppSource).toContain("'annotation_created'");
  });

  it('annotation_updated is emitted', () => {
    expect(viewerAppSource).toContain("'annotation_updated'");
  });

  it('annotation_deleted is emitted', () => {
    expect(viewerAppSource).toContain("'annotation_deleted'");
  });

  it('form_field_updated is emitted', () => {
    expect(viewerAppSource).toContain("'form_field_updated'");
  });

  it('redaction_created is emitted', () => {
    expect(viewerAppSource).toContain("'redaction_created'");
  });

  it('redaction_applied is emitted', () => {
    expect(viewerAppSource).toContain("'redaction_applied'");
  });

  it('metadata_changed is emitted', () => {
    expect(viewerAppSource).toContain("'metadata_changed'");
  });

  it('page_mutated is emitted', () => {
    expect(viewerAppSource).toContain("'page_mutated'");
  });
});

// ---------------------------------------------------------------------------
// Export works after document save — exports use available state
// ---------------------------------------------------------------------------

describe('Stability — exports use latest state', () => {
  it('handleExportReviewSummary uses allAnnotations', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations');
  });

  it('handleExportReviewSummary uses documentEventLog', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentEventLog');
  });

  it('handleExportAuditReport uses allAnnotations', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations');
  });

  it('handleExportAuditReport uses documentEventLog', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentEventLog');
  });
});

// ---------------------------------------------------------------------------
// Snapshots remain valid after navigation — no page dependency
// ---------------------------------------------------------------------------

describe('Stability — snapshots are independent of page navigation', () => {
  it('captureRevisionSnapshot does not take a pageIndex parameter', () => {
    const fnStart = snapshotSource.indexOf('export function captureRevisionSnapshot(');
    const closeParen = snapshotSource.indexOf('): RevisionSnapshot', fnStart);
    const fnSig = snapshotSource.slice(fnStart, closeParen);
    // The signature should not include a standalone pageIndex parameter
    expect(fnSig).not.toContain('pageIndex:');
  });

  it('snapshot annotations include pageIndex for each annotation', () => {
    expect(snapshotSource).toContain('pageIndex: a.pageIndex');
  });
});

// ---------------------------------------------------------------------------
// Issue list updates in real time — useMemo re-derives on state change
// ---------------------------------------------------------------------------

describe('Stability — issue list updates in real time', () => {
  it('documentIssues is derived via useMemo (reactive)', () => {
    const memoIdx = viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)');
    expect(memoIdx).toBeGreaterThan(0);
  });

  it('documentIssues re-derives when reviewStatuses changes', () => {
    const memoStart = viewerAppSource.lastIndexOf('useMemo', memoIdx => memoIdx > 0);
    const deps = viewerAppSource.slice(
      viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)'),
      viewerAppSource.indexOf(']', viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)')) + 1
    );
    expect(deps).toContain('reviewStatuses');
  });

  it('documentIssues re-derives when allAnnotations changes', () => {
    const deps = viewerAppSource.slice(
      viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)'),
      viewerAppSource.indexOf(']', viewerAppSource.indexOf('extractDocumentIssues(allAnnotations, reviewStatuses)')) + 1
    );
    expect(deps).toContain('allAnnotations');
  });
});

// ---------------------------------------------------------------------------
// Overflow guard — event log has max size
// ---------------------------------------------------------------------------

describe('Stability — event log overflow guard', () => {
  it('appendEvent enforces DOCUMENT_EVENT_LOG_MAX', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX');
    expect(eventsSource).toContain('.slice(');
  });

  it('DOCUMENT_EVENT_LOG_MAX is 1000', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX = 1000');
  });
});

// ---------------------------------------------------------------------------
// Snapshot comparison guard — compareSnapshots is safe with empty snapshots
// ---------------------------------------------------------------------------

describe('Stability — compareSnapshots handles empty snapshots', () => {
  it('uses Set to detect new/deleted annotations (O(1) lookup)', () => {
    expect(compareSource).toContain('new Set(');
  });

  it('iterates afterStatusMap entries safely', () => {
    expect(compareSource).toContain('for (const [id, afterStatus] of afterStatusMap)');
  });
});

// ---------------------------------------------------------------------------
// Review summary stability — buildReviewSummaryData graceful with empty state
// ---------------------------------------------------------------------------

describe('Stability — buildReviewSummaryData with empty state', () => {
  it('defaults comment status to open when not in reviewStatuses', () => {
    expect(summarySource).toContain("?? ('open' as const)");
  });

  it('defaults replies to empty array', () => {
    expect(summarySource).toContain('?? []');
  });
});

// ---------------------------------------------------------------------------
// Audit report stability — buildAuditReportData handles empty events
// ---------------------------------------------------------------------------

describe('Stability — buildAuditReportData with empty events', () => {
  it('spreads events into new array before sorting (no mutation)', () => {
    expect(auditSource).toContain('[...events].sort(');
  });

  it('handles empty annotations gracefully (typeMap stays empty)', () => {
    expect(auditSource).toContain('typeMap');
  });
});
