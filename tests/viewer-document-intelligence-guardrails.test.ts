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

const compareSource = readFileSync(
  new URL('../src/viewer/revisionCompare.ts', import.meta.url),
  'utf8'
);

const snapshotSource = readFileSync(
  new URL('../src/viewer/revisionSnapshot.ts', import.meta.url),
  'utf8'
);

const timelineSource = readFileSync(
  new URL('../src/viewer/components/TimelinePanel.tsx', import.meta.url),
  'utf8'
);

const issuePanelSource = readFileSync(
  new URL('../src/viewer/components/IssuePanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Guard: prevent exporting empty reports
// ---------------------------------------------------------------------------

describe('Guardrail — prevent exporting empty review summary', () => {
  it('handleExportReviewSummary guards: allAnnotations.length === 0', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations.length === 0');
  });

  it('handleExportReviewSummary guards: documentIssues.length === 0', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentIssues.length === 0');
  });

  it('handleExportReviewSummary guards: documentEventLog.length === 0', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentEventLog.length === 0');
  });

  it('guard uses early return (not silent no-op)', () => {
    const fnStart = viewerAppSource.indexOf('handleExportReviewSummary = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('return;');
  });
});

describe('Guardrail — prevent exporting empty audit report', () => {
  it('handleExportAuditReport guards: documentEventLog.length === 0', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentEventLog.length === 0');
  });

  it('handleExportAuditReport guards: allAnnotations.length === 0', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations.length === 0');
  });
});

// ---------------------------------------------------------------------------
// Guard: prevent snapshot comparison without snapshots
// ---------------------------------------------------------------------------

describe('Guardrail — prevent snapshot comparison without snapshots', () => {
  it('handleCompareSnapshots guards against undefined before snapshot', () => {
    const fnStart = viewerAppSource.indexOf('handleCompareSnapshots = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!before');
  });

  it('handleCompareSnapshots guards against undefined after snapshot', () => {
    const fnStart = viewerAppSource.indexOf('handleCompareSnapshots = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!after');
  });

  it('formatSnapshotDiffMarkdown shows no-diff message when hasDifferences is false', () => {
    expect(compareSource).toContain('!diff.hasDifferences');
    expect(compareSource).toContain('Geen verschillen');
  });
});

// ---------------------------------------------------------------------------
// Guard: prevent event log overflow
// ---------------------------------------------------------------------------

describe('Guardrail — prevent event log overflow', () => {
  it('DOCUMENT_EVENT_LOG_MAX is defined', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX');
  });

  it('appendEvent slices when log exceeds max', () => {
    expect(eventsSource).toContain('next.length > DOCUMENT_EVENT_LOG_MAX');
    expect(eventsSource).toContain('.slice(next.length - DOCUMENT_EVENT_LOG_MAX)');
  });
});

// ---------------------------------------------------------------------------
// Guard: TimelinePanel empty state
// ---------------------------------------------------------------------------

describe('Guardrail — TimelinePanel empty state', () => {
  it('renders fallback message when events array is empty', () => {
    expect(timelineSource).toContain('events.length === 0');
  });

  it('still renders timeline-panel root when empty', () => {
    // Both empty state and non-empty state show data-testid="timeline-panel"
    expect(timelineSource).toContain('data-testid="timeline-panel"');
  });
});

// ---------------------------------------------------------------------------
// Guard: IssuePanel empty state
// ---------------------------------------------------------------------------

describe('Guardrail — IssuePanel empty state', () => {
  it('renders fallback message when filtered issues are empty', () => {
    expect(issuePanelSource).toContain('filteredIssues.length === 0');
  });

  it('still renders issue-panel root when empty', () => {
    expect(issuePanelSource).toContain('data-testid="issue-panel"');
  });
});

// ---------------------------------------------------------------------------
// Guard: snapshot label fallback
// ---------------------------------------------------------------------------

describe('Guardrail — snapshot label fallback', () => {
  it('provides fallback label when label is empty', () => {
    expect(snapshotSource).toContain('label.trim()');
    expect(snapshotSource).toContain('Snapshot ');
  });
});
