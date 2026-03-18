// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const auditSource = readFileSync(
  new URL('../src/viewer/export/auditReport.ts', import.meta.url),
  'utf8'
);

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

// ---------------------------------------------------------------------------
// AuditReportData — interface
// ---------------------------------------------------------------------------

describe('auditReport — AuditReportData interface', () => {
  it('has title field', () => {
    expect(auditSource).toContain('title: string');
  });

  it('has generatedAt field', () => {
    expect(auditSource).toContain('generatedAt: string');
  });

  it('has activityTimeline field', () => {
    expect(auditSource).toContain('activityTimeline: DocumentEvent[]');
  });

  it('has reviewerActions field', () => {
    expect(auditSource).toContain('reviewerActions: Array<');
  });

  it('has redactionsApplied field', () => {
    expect(auditSource).toContain('redactionsApplied: Array<');
  });

  it('has annotationSummary field', () => {
    expect(auditSource).toContain('annotationSummary: Array<');
  });

  it('has metadataChanges field', () => {
    expect(auditSource).toContain('metadataChanges: Array<');
  });
});

// ---------------------------------------------------------------------------
// buildAuditReportData
// ---------------------------------------------------------------------------

describe('buildAuditReportData', () => {
  it('is exported', () => {
    expect(auditSource).toContain('export function buildAuditReportData(');
  });

  it('accepts title, annotations, events, issues', () => {
    const fnStart = auditSource.indexOf('export function buildAuditReportData(');
    const fnSig = auditSource.slice(fnStart, fnStart + 400);
    expect(fnSig).toContain('annotations');
    expect(fnSig).toContain('events');
  });

  it('sorts activity timeline by timestamp ascending', () => {
    expect(auditSource).toContain('a.timestamp.getTime() - b.timestamp.getTime()');
  });

  it('aggregates events per reviewer', () => {
    expect(auditSource).toContain('reviewerMap');
  });

  it('counts events per type per reviewer', () => {
    expect(auditSource).toContain('eventCount');
    expect(auditSource).toContain('eventTypes');
  });

  it('extracts redactions from annotations', () => {
    expect(auditSource).toContain("a.type === 'redaction'");
    expect(auditSource).toContain('redactionsApplied');
  });

  it('builds annotation summary by type', () => {
    expect(auditSource).toContain('typeMap');
    expect(auditSource).toContain('annotationSummary');
  });

  it('extracts metadata changes from events', () => {
    expect(auditSource).toContain("e.type === 'metadata_changed'");
  });

  it('sets generatedAt to new ISO timestamp', () => {
    expect(auditSource).toContain('new Date().toISOString()');
  });
});

// ---------------------------------------------------------------------------
// buildAuditReportMarkdown
// ---------------------------------------------------------------------------

describe('buildAuditReportMarkdown', () => {
  it('is exported', () => {
    expect(auditSource).toContain('export function buildAuditReportMarkdown(');
  });

  it('includes activity timeline section', () => {
    expect(auditSource).toContain("i18n.t('auditReport.activityOverview')");
  });

  it('includes reviewer actions section', () => {
    expect(auditSource).toContain('## Reviewer acties');
  });

  it('includes redactions section', () => {
    expect(auditSource).toContain('## Redacties');
  });

  it('includes annotation summary section', () => {
    expect(auditSource).toContain("i18n.t('auditReport.annotationOverview')");
  });

  it('includes metadata changes section', () => {
    expect(auditSource).toContain('## Metadata wijzigingen');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — audit report wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — handleExportAuditReport', () => {
  it('imports buildAuditReportData', () => {
    expect(viewerAppSource).toContain('buildAuditReportData');
  });

  it('imports buildAuditReportMarkdown', () => {
    expect(viewerAppSource).toContain('buildAuditReportMarkdown');
  });

  it('defines handleExportAuditReport callback', () => {
    expect(viewerAppSource).toContain('handleExportAuditReport');
  });

  it('guards against empty report (no events, no annotations)', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('documentEventLog.length === 0');
    expect(fnBody).toContain('allAnnotations.length === 0');
  });

  it('downloads audit-report.md for markdown format', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('audit-report.');
  });

  it('revokes object URL after download', () => {
    const fnStart = viewerAppSource.indexOf('handleExportAuditReport = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('URL.revokeObjectURL(url)');
  });
});
