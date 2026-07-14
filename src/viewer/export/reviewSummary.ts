// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Summary Export
//
// Generates a structured summary of the document review session.
// Supports JSON, Markdown, and HTML output formats.
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../../core/document';
import type { DocumentIssue } from '../documentIssues';
import type { DocumentEvent } from '../state/documentEvents';
import i18n from '../../i18n';

export interface ReviewSummaryData {
  /** Document title or file name. */
  title: string;
  /** ISO timestamp when the summary was generated. */
  generatedAt: string;
  /** All text annotations (comments) with their replies and review status. */
  comments: Array<{
    id: string;
    author: string;
    page: number;
    contents: string;
    status: 'open' | 'resolved';
    replies: Reply[];
  }>;
  /** All redaction annotations. */
  redactions: Array<{
    id: string;
    page: number;
    author: string;
  }>;
  /** Extracted document issues. */
  issues: DocumentIssue[];
  /** Document activity events. */
  events: DocumentEvent[];
  /** Metadata changes extracted from events. */
  metadataChanges: Array<{
    field: string;
    timestamp: string;
    user: string;
  }>;
}

/** Build a ReviewSummaryData snapshot from the current editor state. */
export function buildReviewSummaryData(
  title: string,
  annotations: readonly Annotation[],
  reviewStatuses: ReadonlyMap<string, 'open' | 'resolved'>,
  commentReplies: ReadonlyMap<string, Reply[]>,
  issues: readonly DocumentIssue[],
  events: readonly DocumentEvent[],
): ReviewSummaryData {
  const comments = annotations
    .filter(a => a.type === 'text')
    .map(a => ({
      id: a.id,
      author: a.author ?? '',
      page: a.pageIndex,
      contents: a.contents ?? '',
      status: reviewStatuses.get(a.id) ?? ('open' as const),
      replies: commentReplies.get(a.id) ?? [],
    }));

  const redactions = annotations
    .filter(a => a.type === 'redaction')
    .map(a => ({
      id: a.id,
      page: a.pageIndex,
      author: a.author ?? '',
    }));

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
    comments,
    redactions,
    issues: [...issues],
    events: [...events],
    metadataChanges,
  };
}

/** Serialise a ReviewSummaryData to a JSON string. */
export function buildReviewSummaryJson(data: ReviewSummaryData): string {
  return JSON.stringify(data, null, 2);
}

/** Serialise a ReviewSummaryData to a Markdown string. */
export function buildReviewSummaryMarkdown(data: ReviewSummaryData): string {
  const lines: string[] = [];

  lines.push(`# ${i18n.t('reviewSummary.title')} — ${data.title}`);
  lines.push(`${i18n.t('reviewSummary.generatedAt')}: ${data.generatedAt}`);
  lines.push('');

  lines.push(`## ${i18n.t('reviewSummary.comments')}`);
  if (data.comments.length === 0) {
    lines.push(`_${i18n.t('reviewSummary.noComments')}_`);
  } else {
    for (const c of data.comments) {
      lines.push(`### [${c.status.toUpperCase()}] p.${c.page + 1} — ${c.author || '—'}`);
      lines.push(c.contents || `_${i18n.t('reviewSummary.empty')}_`);
      if (c.replies.length > 0) {
        lines.push('');
        lines.push(`**${i18n.t('reviewSummary.replies')}**`);
        for (const r of c.replies) {
          lines.push(`- **${r.author}**: ${r.contents}`);
        }
      }
      lines.push('');
    }
  }

  lines.push(`## ${i18n.t('reviewSummary.redactions')}`);
  if (data.redactions.length === 0) {
    lines.push(`_${i18n.t('reviewSummary.noRedactions')}_`);
  } else {
    for (const r of data.redactions) {
      lines.push(`- p.${r.page + 1} — ${r.author || '—'}`);
    }
  }
  lines.push('');

  lines.push(i18n.t('auditReport.issues'));
  if (data.issues.length === 0) {
    lines.push(`_${i18n.t('reviewSummary.noIssues')}_`);
  } else {
    for (const issue of data.issues) {
      lines.push(`- [${issue.status.toUpperCase()}] p.${issue.page + 1} ${issue.description} (${issue.author || '—'})`);
    }
  }
  lines.push('');

  lines.push(`## ${i18n.t('reviewSummary.metadataChanges')}`);
  if (data.metadataChanges.length === 0) {
    lines.push(`_${i18n.t('reviewSummary.noMetadataChanges')}_`);
  } else {
    for (const m of data.metadataChanges) {
      lines.push(`- ${m.field} ${i18n.t('reviewSummary.changedBy')} ${m.user} ${i18n.t('reviewSummary.on')} ${m.timestamp}`);
    }
  }

  return lines.join('\n');
}

/** Serialise a ReviewSummaryData to an HTML string. */
export function buildReviewSummaryHtml(data: ReviewSummaryData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines: string[] = [];
  lines.push('<!DOCTYPE html>');
  lines.push(`<html lang="${esc(i18n.language)}"><head><meta charset="utf-8">`);
  lines.push(`<title>${esc(i18n.t('reviewSummary.title'))} — ${esc(data.title)}</title>`);
  lines.push('</head><body>');
  lines.push(`<h1>${esc(i18n.t('reviewSummary.title'))} — ${esc(data.title)}</h1>`);
  lines.push(`<p>${esc(i18n.t('reviewSummary.generatedAt'))}: ${esc(data.generatedAt)}</p>`);

  lines.push(`<h2>${esc(i18n.t('reviewSummary.comments'))}</h2>`);
  if (data.comments.length === 0) {
    lines.push(`<p><em>${esc(i18n.t('reviewSummary.noComments'))}</em></p>`);
  } else {
    lines.push('<ul>');
    for (const c of data.comments) {
      lines.push(`<li><strong>[${esc(c.status)}]</strong> p.${c.page + 1} — ${esc(c.author)}: ${esc(c.contents)}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push(`<h2>${esc(i18n.t('reviewSummary.redactions'))}</h2>`);
  if (data.redactions.length === 0) {
    lines.push(`<p><em>${esc(i18n.t('reviewSummary.noRedactions'))}</em></p>`);
  } else {
    lines.push('<ul>');
    for (const r of data.redactions) {
      lines.push(`<li>p.${r.page + 1} — ${esc(r.author)}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push(`<h2>${i18n.t('auditReport.issuesHeading')}</h2>`);
  if (data.issues.length === 0) {
    lines.push(`<p><em>${esc(i18n.t('reviewSummary.noIssues'))}</em></p>`);
  } else {
    lines.push('<ul>');
    for (const issue of data.issues) {
      lines.push(`<li>[${esc(issue.status)}] p.${issue.page + 1} ${esc(issue.description)}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push('</body></html>');
  return lines.join('\n');
}
