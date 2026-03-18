// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Revision Snapshot
//
// Captures a point-in-time snapshot of the document review state for later
// comparison. Snapshots are stored in memory (not persisted to disk).
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../core/document';
import type { DocumentIssue } from './documentIssues';

export interface SnapshotAnnotation {
  readonly id: string;
  readonly type: string;
  readonly pageIndex: number;
  readonly contents: string;
  readonly author: string;
  readonly status: 'open' | 'resolved';
  readonly replies: readonly Reply[];
}

export interface SnapshotMetadata {
  readonly title: string;
  readonly author: string;
}

export interface RevisionSnapshot {
  /** Unique snapshot identifier. */
  readonly id: string;
  /** ISO timestamp when the snapshot was captured. */
  readonly capturedAt: string;
  /** Label provided by the user (e.g. "Before review round 2"). */
  readonly label: string;
  /** Annotation state at capture time. */
  readonly annotations: readonly SnapshotAnnotation[];
  /** Review status map serialised as entries. */
  readonly reviewStatuses: readonly [string, 'open' | 'resolved'][];
  /** Comment reply threads serialised as entries. */
  readonly commentReplies: readonly [string, readonly Reply[]][];
  /** Pending redaction annotations at capture time. */
  readonly redactions: readonly SnapshotAnnotation[];
  /** Document issues at capture time. */
  readonly issues: readonly DocumentIssue[];
}

/** Capture a new RevisionSnapshot from the current editor state. */
export function captureRevisionSnapshot(
  label: string,
  annotations: readonly Annotation[],
  reviewStatuses: ReadonlyMap<string, 'open' | 'resolved'>,
  commentReplies: ReadonlyMap<string, Reply[]>,
  issues: readonly DocumentIssue[],
): RevisionSnapshot {
  const snapshotAnnotations: SnapshotAnnotation[] = annotations
    .filter(a => a.type !== 'redaction')
    .map(a => ({
      id: a.id,
      type: a.type,
      pageIndex: a.pageIndex,
      contents: a.contents ?? '',
      author: a.author ?? '',
      status: reviewStatuses.get(a.id) ?? 'open',
      replies: commentReplies.get(a.id) ?? [],
    }));

  const redactions: SnapshotAnnotation[] = annotations
    .filter(a => a.type === 'redaction')
    .map(a => ({
      id: a.id,
      type: a.type,
      pageIndex: a.pageIndex,
      contents: '',
      author: a.author ?? '',
      status: 'open' as const,
      replies: [],
    }));

  return {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    capturedAt: new Date().toISOString(),
    label: label.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
    annotations: snapshotAnnotations,
    reviewStatuses: Array.from(reviewStatuses.entries()),
    commentReplies: Array.from(commentReplies.entries()),
    redactions,
    issues: [...issues],
  };
}
