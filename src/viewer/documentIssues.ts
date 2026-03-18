// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Document Issues
//
// Derives a structured issue list from the document's annotation state.
// Issues are extracted from unresolved comments, pending redactions, and
// flagged annotations. Each issue provides a page reference, author,
// status, and description — suitable for an issue tracker panel.
// ---------------------------------------------------------------------------

import type { Annotation } from '../core/document';

export type IssueStatus = 'open' | 'resolved';

export type IssueSource = 'comment' | 'redaction' | 'annotation';

export interface DocumentIssue {
  /** Unique issue id — derived from the source annotation id. */
  readonly id: string;
  /** Human-readable description of the issue. */
  readonly description: string;
  /** 0-based page index where the issue is located. */
  readonly page: number;
  /** Reviewer / author who raised the issue. */
  readonly author: string;
  /** Current resolution status. */
  readonly status: IssueStatus;
  /** Which system produced this issue. */
  readonly source: IssueSource;
  /** ID of the originating annotation or redaction. */
  readonly annotationId: string;
}

/**
 * Extract document issues from annotations and review state.
 *
 * Sources:
 * - Unresolved text annotations → comment issues
 * - Redaction annotations → redaction issues (always open until applied)
 * - Flagged non-text annotations (highlight / underline / strikeout / rectangle) → annotation issues
 */
export function extractDocumentIssues(
  annotations: readonly Annotation[],
  reviewStatuses: ReadonlyMap<string, IssueStatus>,
): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  for (const ann of annotations) {
    if (ann.type === 'text') {
      const status = reviewStatuses.get(ann.id) ?? 'open';
      issues.push({
        id: `issue-${ann.id}`,
        description: ann.contents?.trim() || '(geen inhoud)',
        page: ann.pageIndex,
        author: ann.author ?? '',
        status,
        source: 'comment',
        annotationId: ann.id,
      });
    } else if (ann.type === 'redaction') {
      issues.push({
        id: `issue-${ann.id}`,
        description: 'Redactie in behandeling',
        page: ann.pageIndex,
        author: ann.author ?? '',
        status: 'open',
        source: 'redaction',
        annotationId: ann.id,
      });
    } else if (
      ann.type === 'highlight' ||
      ann.type === 'underline' ||
      ann.type === 'strikeout' ||
      ann.type === 'square'
    ) {
      const status = reviewStatuses.get(ann.id) ?? 'open';
      issues.push({
        id: `issue-${ann.id}`,
        description: `Markering (${ann.type})`,
        page: ann.pageIndex,
        author: ann.author ?? '',
        status,
        source: 'annotation',
        annotationId: ann.id,
      });
    }
  }

  // Sort by page ascending, then by open first
  return issues.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return 0;
  });
}

/** Count the number of open issues in the list. */
export function countOpenIssues(issues: readonly DocumentIssue[]): number {
  return issues.filter(i => i.status === 'open').length;
}

/** Count the number of resolved issues in the list. */
export function countResolvedIssues(issues: readonly DocumentIssue[]): number {
  return issues.filter(i => i.status === 'resolved').length;
}
