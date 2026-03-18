// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Revision Comparison
//
// Compares two RevisionSnapshots and returns a structured diff highlighting
// what changed between the two states.
// ---------------------------------------------------------------------------

import type { RevisionSnapshot } from './revisionSnapshot';
import i18n from '../i18n';

export interface SnapshotDiff {
  /** Annotations present in `after` but not in `before` (new comments). */
  newAnnotations: Array<{ id: string; type: string; pageIndex: number; author: string }>;
  /** Annotations present in `before` but not in `after` (deleted). */
  deletedAnnotations: Array<{ id: string; type: string; pageIndex: number; author: string }>;
  /** Annotations whose status changed from open → resolved. */
  resolvedIssues: Array<{ id: string; pageIndex: number; author: string }>;
  /** Redactions present in `after` but not in `before`. */
  newRedactions: Array<{ id: string; pageIndex: number; author: string }>;
  /** Metadata field changes detected via reviewStatus map differences. */
  metadataChanged: boolean;
  /** True if there are any differences at all. */
  hasDifferences: boolean;
}

/**
 * Compare two RevisionSnapshots and return a SnapshotDiff.
 * Returns an empty diff with hasDifferences = false when both are identical.
 */
export function compareSnapshots(
  before: RevisionSnapshot,
  after: RevisionSnapshot,
): SnapshotDiff {
  const beforeAnnotIds = new Set(before.annotations.map(a => a.id));
  const afterAnnotIds = new Set(after.annotations.map(a => a.id));

  // New annotations — in after but not in before
  const newAnnotations = after.annotations
    .filter(a => !beforeAnnotIds.has(a.id))
    .map(a => ({ id: a.id, type: a.type, pageIndex: a.pageIndex, author: a.author }));

  // Deleted annotations — in before but not in after
  const deletedAnnotations = before.annotations
    .filter(a => !afterAnnotIds.has(a.id))
    .map(a => ({ id: a.id, type: a.type, pageIndex: a.pageIndex, author: a.author }));

  // Resolved issues — annotations that changed status from open → resolved
  const beforeStatusMap = new Map(before.reviewStatuses);
  const afterStatusMap = new Map(after.reviewStatuses);

  const resolvedIssues: Array<{ id: string; pageIndex: number; author: string }> = [];
  for (const [id, afterStatus] of afterStatusMap) {
    const beforeStatus = beforeStatusMap.get(id) ?? 'open';
    if (beforeStatus === 'open' && afterStatus === 'resolved') {
      const ann = after.annotations.find(a => a.id === id);
      resolvedIssues.push({
        id,
        pageIndex: ann?.pageIndex ?? -1,
        author: ann?.author ?? '',
      });
    }
  }

  // New redactions
  const beforeRedactionIds = new Set(before.redactions.map(r => r.id));
  const newRedactions = after.redactions
    .filter(r => !beforeRedactionIds.has(r.id))
    .map(r => ({ id: r.id, pageIndex: r.pageIndex, author: r.author }));

  // Metadata changed — heuristic: compare reviewStatuses map sizes
  const metadataChanged = before.reviewStatuses.length !== after.reviewStatuses.length;

  const hasDifferences =
    newAnnotations.length > 0 ||
    deletedAnnotations.length > 0 ||
    resolvedIssues.length > 0 ||
    newRedactions.length > 0 ||
    metadataChanged;

  return {
    newAnnotations,
    deletedAnnotations,
    resolvedIssues,
    newRedactions,
    metadataChanged,
    hasDifferences,
  };
}

/** Format a SnapshotDiff as a human-readable Markdown summary. */
export function formatSnapshotDiffMarkdown(
  before: RevisionSnapshot,
  after: RevisionSnapshot,
  diff: SnapshotDiff,
): string {
  const lines: string[] = [];

  lines.push(`# Revisieverlijking`);
  lines.push(`Van: ${before.label} (${before.capturedAt})`);
  lines.push(`Naar: ${after.label} (${after.capturedAt})`);
  lines.push('');

  if (!diff.hasDifferences) {
    lines.push('_Geen verschillen gevonden._');
    return lines.join('\n');
  }

  if (diff.newAnnotations.length > 0) {
    lines.push('## Nieuwe annotaties');
    for (const a of diff.newAnnotations) {
      lines.push(`- [${a.type}] p.${a.pageIndex + 1} — ${a.author || '—'}`);
    }
    lines.push('');
  }

  if (diff.deletedAnnotations.length > 0) {
    lines.push(i18n.t('revisions.deletedAnnotations'));
    for (const a of diff.deletedAnnotations) {
      lines.push(`- [${a.type}] p.${a.pageIndex + 1} — ${a.author || '—'}`);
    }
    lines.push('');
  }

  if (diff.resolvedIssues.length > 0) {
    lines.push('## Opgeloste problemen');
    for (const r of diff.resolvedIssues) {
      lines.push(`- p.${r.pageIndex >= 0 ? r.pageIndex + 1 : '—'} — ${r.author || '—'}`);
    }
    lines.push('');
  }

  if (diff.newRedactions.length > 0) {
    lines.push('## Nieuwe redacties');
    for (const r of diff.newRedactions) {
      lines.push(`- p.${r.pageIndex + 1} — ${r.author || '—'}`);
    }
    lines.push('');
  }

  if (diff.metadataChanged) {
    lines.push(i18n.t('revisions.metadataChanged'));
    lines.push(i18n.t('revisions.metadataChangedDescription'));
    lines.push('');
  }

  return lines.join('\n');
}
