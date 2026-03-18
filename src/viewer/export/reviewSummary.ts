// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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

  lines.push(`# Review samenvatting — ${data.title}`);
  lines.push(`Gegenereerd op: ${data.generatedAt}`);
  lines.push('');

  lines.push('## Commentaren');
  if (data.comments.length === 0) {
    lines.push('_Geen commentaren._');
  } else {
    for (const c of data.comments) {
      lines.push(`### [${c.status.toUpperCase()}] p.${c.page + 1} — ${c.author || '—'}`);
      lines.push(c.contents || '_leeg_');
      if (c.replies.length > 0) {
        lines.push('');
        lines.push('**Reacties:**');
        for (const r of c.replies) {
          lines.push(`- **${r.author}**: ${r.contents}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('## Redacties');
  if (data.redactions.length === 0) {
    lines.push('_Geen redacties._');
  } else {
    for (const r of data.redactions) {
      lines.push(`- p.${r.page + 1} — ${r.author || '—'}`);
    }
  }
  lines.push('');

  lines.push('## Problemen');
  if (data.issues.length === 0) {
    lines.push('_Geen problemen._');
  } else {
    for (const issue of data.issues) {
      lines.push(`- [${issue.status.toUpperCase()}] p.${issue.page + 1} ${issue.description} (${issue.author || '—'})`);
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

/** Serialise a ReviewSummaryData to an HTML string. */
export function buildReviewSummaryHtml(data: ReviewSummaryData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines: string[] = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="nl"><head><meta charset="utf-8">');
  lines.push(`<title>Review — ${esc(data.title)}</title>`);
  lines.push('</head><body>');
  lines.push(`<h1>Review samenvatting — ${esc(data.title)}</h1>`);
  lines.push(`<p>Gegenereerd op: ${esc(data.generatedAt)}</p>`);

  lines.push('<h2>Commentaren</h2>');
  if (data.comments.length === 0) {
    lines.push('<p><em>Geen commentaren.</em></p>');
  } else {
    lines.push('<ul>');
    for (const c of data.comments) {
      lines.push(`<li><strong>[${esc(c.status)}]</strong> p.${c.page + 1} — ${esc(c.author)}: ${esc(c.contents)}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push('<h2>Redacties</h2>');
  if (data.redactions.length === 0) {
    lines.push('<p><em>Geen redacties.</em></p>');
  } else {
    lines.push('<ul>');
    for (const r of data.redactions) {
      lines.push(`<li>p.${r.page + 1} — ${esc(r.author)}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push('<h2>Problemen</h2>');
  if (data.issues.length === 0) {
    lines.push('<p><em>Geen problemen.</em></p>');
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
