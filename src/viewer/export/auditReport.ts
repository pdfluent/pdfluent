// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Audit Report Export
//
// Generates a formal document audit report from the in-session event log,
// annotation state, and review summary. Supports Markdown and plain-text
// output. PDF output is delegated to the Rust pdf_engine backend.
// ---------------------------------------------------------------------------

import type { DocumentEvent } from '../state/documentEvents';
import type { DocumentIssue } from '../documentIssues';
import type { Annotation } from '../../core/document';

export interface AuditReportData {
  /** Document title. */
  title: string;
  /** ISO timestamp when the report was generated. */
  generatedAt: string;
  /** Full activity timeline sorted by timestamp ascending. */
  activityTimeline: DocumentEvent[];
  /** Unique reviewer names extracted from events. */
  reviewerActions: Array<{
    reviewer: string;
    eventCount: number;
    eventTypes: string[];
  }>;
  /** All redaction annotations. */
  redactionsApplied: Array<{
    id: string;
    page: number;
    author: string;
  }>;
  /** Summary of annotations by type. */
  annotationSummary: Array<{
    type: string;
    count: number;
  }>;
  /** Metadata change entries. */
  metadataChanges: Array<{
    field: string;
    timestamp: string;
    user: string;
  }>;
}

/** Build an AuditReportData snapshot from the current editor state. */
export function buildAuditReportData(
  title: string,
  annotations: readonly Annotation[],
  events: readonly DocumentEvent[],
  _issues: readonly DocumentIssue[],
): AuditReportData {
  // Activity timeline — sorted ascending by timestamp
  const activityTimeline = [...events].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Reviewer actions — aggregate per reviewer
  const reviewerMap = new Map<string, { count: number; types: Set<string> }>();
  for (const ev of events) {
    const reviewer = ev.user || '—';
    const existing = reviewerMap.get(reviewer) ?? { count: 0, types: new Set<string>() };
    existing.count += 1;
    existing.types.add(ev.type);
    reviewerMap.set(reviewer, existing);
  }
  const reviewerActions = Array.from(reviewerMap.entries()).map(([reviewer, data]) => ({
    reviewer,
    eventCount: data.count,
    eventTypes: Array.from(data.types),
  }));

  // Redactions
  const redactionsApplied = annotations
    .filter(a => a.type === 'redaction')
    .map(a => ({ id: a.id, page: a.pageIndex, author: a.author ?? '' }));

  // Annotation summary by type
  const typeMap = new Map<string, number>();
  for (const ann of annotations) {
    typeMap.set(ann.type, (typeMap.get(ann.type) ?? 0) + 1);
  }
  const annotationSummary = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

  // Metadata changes
  const metadataChanges = events
    .filter(e => e.type === 'metadata_changed')
    .map(e => ({
      field: e.objectId,
      timestamp: e.timestamp.toISOString(),
      user: e.user,
    }));

  return {
    title,
    generatedAt: new Date().toISOString(),
    activityTimeline,
    reviewerActions,
    redactionsApplied,
    annotationSummary,
    metadataChanges,
  };
}

/** Serialise an AuditReportData to a Markdown string. */
export function buildAuditReportMarkdown(data: AuditReportData): string {
  const lines: string[] = [];

  lines.push(`# Auditrapport — ${data.title}`);
  lines.push(`Gegenereerd op: ${data.generatedAt}`);
  lines.push('');

  lines.push('## Activiteitenoverzicht');
  if (data.activityTimeline.length === 0) {
    lines.push('_Geen activiteiten._');
  } else {
    for (const ev of data.activityTimeline) {
      const ts = ev.timestamp instanceof Date ? ev.timestamp.toISOString() : String(ev.timestamp);
      lines.push(`- ${ts} | ${ev.user || '—'} | ${ev.type} | p.${ev.page >= 0 ? ev.page + 1 : '—'}`);
    }
  }
  lines.push('');

  lines.push('## Reviewer acties');
  if (data.reviewerActions.length === 0) {
    lines.push('_Geen acties._');
  } else {
    for (const r of data.reviewerActions) {
      lines.push(`- **${r.reviewer}**: ${r.eventCount} actie(s) — ${r.eventTypes.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Redacties');
  if (data.redactionsApplied.length === 0) {
    lines.push('_Geen redacties._');
  } else {
    for (const r of data.redactionsApplied) {
      lines.push(`- p.${r.page + 1} — ${r.author || '—'}`);
    }
  }
  lines.push('');

  lines.push('## Annotatieoverzicht');
  if (data.annotationSummary.length === 0) {
    lines.push('_Geen annotaties._');
  } else {
    for (const s of data.annotationSummary) {
      lines.push(`- ${s.type}: ${s.count}`);
    }
  }
  lines.push('');

  lines.push('## Metadata wijzigingen');
  if (data.metadataChanges.length === 0) {
    lines.push('_Geen wijzigingen._');
  } else {
    for (const m of data.metadataChanges) {
      lines.push(`- ${m.field} door ${m.user} op ${m.timestamp}`);
    }
  }

  return lines.join('\n');
}
