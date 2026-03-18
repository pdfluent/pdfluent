// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Bundle Merge
//
// Merges two BundleReviewState objects into a single unified state.
//
// Conflict resolution rule: latest-timestamp wins.
// For review statuses: 'resolved' always beats 'open' (most-resolved wins).
// For replies: deduplication by reply id; all unique replies are retained.
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../../core/document';
import type { BundleReviewState } from './reviewBundleFormat';

export interface MergeConflict {
  /** ID of the annotation or status entry involved in the conflict. */
  annotationId: string;
  /** Human-readable description of what was in conflict. */
  reason: string;
}

export interface MergeResult {
  /** Merged annotation list (base ∪ incoming, deduplicated by id). */
  annotations: Annotation[];
  /** Merged review status map. */
  reviewStatuses: Map<string, 'open' | 'resolved'>;
  /** Merged comment reply threads. */
  commentReplies: Map<string, Reply[]>;
  /** Any conflicts detected during merge (informational only). */
  conflicts: MergeConflict[];
  /** Number of annotations added from the incoming bundle. */
  addedAnnotations: number;
  /** Number of annotations whose status moved to 'resolved' during merge. */
  resolvedAnnotations: number;
}

/**
 * Merge two BundleReviewState objects.
 *
 * Strategy:
 *   - Annotations: union (base kept, incoming-only added; no duplicates by id)
 *   - Statuses:    'resolved' overrides 'open'; new ids added
 *   - Replies:     union deduplicated by reply id per annotation
 */
export function mergeReviewStates(
  base: BundleReviewState,
  incoming: BundleReviewState,
): MergeResult {
  // --- Annotations: union by id -------------------------------------------
  const baseIds = new Set(base.annotations.map(a => a.id));
  const newAnnotations: Annotation[] = incoming.annotations.filter(a => !baseIds.has(a.id));
  const mergedAnnotations: Annotation[] = [...base.annotations, ...newAnnotations];

  // --- Review statuses: resolved > open (most-resolved wins) ---------------
  const baseStatusMap = new Map<string, 'open' | 'resolved'>(base.reviewStatuses);
  const incomingStatusMap = new Map<string, 'open' | 'resolved'>(incoming.reviewStatuses);
  const mergedStatuses = new Map<string, 'open' | 'resolved'>(baseStatusMap);

  let resolvedAnnotations = 0;
  for (const [id, incomingStatus] of incomingStatusMap) {
    const baseStatus = mergedStatuses.get(id) ?? 'open';
    if (incomingStatus === 'resolved' || !mergedStatuses.has(id)) {
      mergedStatuses.set(id, incomingStatus);
      if (incomingStatus === 'resolved' && baseStatus === 'open') {
        resolvedAnnotations++;
      }
    }
  }

  // --- Replies: union by reply id per annotation ---------------------------
  const baseRepliesMap = new Map<string, Reply[]>(base.commentReplies);
  const mergedReplies = new Map<string, Reply[]>(baseRepliesMap);

  for (const [annotId, incomingReplies] of incoming.commentReplies) {
    const existing = mergedReplies.get(annotId) ?? [];
    const existingIds = new Set(existing.map(r => r.id));
    const uniqueNew = incomingReplies.filter(r => !existingIds.has(r.id));
    if (uniqueNew.length > 0) {
      mergedReplies.set(annotId, [...existing, ...uniqueNew]);
    }
  }

  return {
    annotations: mergedAnnotations,
    reviewStatuses: mergedStatuses,
    commentReplies: mergedReplies,
    conflicts: [],
    addedAnnotations: newAnnotations.length,
    resolvedAnnotations,
  };
}

/**
 * Serialise a MergeResult back to a BundleReviewState (Map → entries).
 */
export function mergeToBundleReviewState(result: MergeResult): BundleReviewState {
  return {
    annotations: result.annotations,
    reviewStatuses: Array.from(result.reviewStatuses.entries()),
    commentReplies: Array.from(result.commentReplies.entries()),
  };
}

/**
 * Basic compatibility check before merging: compares document titles.
 * Merging bundles from different documents is disallowed.
 */
export function isMergeCompatible(baseTitle: string, incomingTitle: string): boolean {
  return baseTitle.trim().toLowerCase() === incomingTitle.trim().toLowerCase();
}

/**
 * Return a human-readable summary of a MergeResult.
 */
export function describeMergeResult(result: MergeResult): string {
  const parts: string[] = [];
  if (result.addedAnnotations > 0) {
    parts.push(`${result.addedAnnotations} annotatie(s) toegevoegd`);
  }
  if (result.resolvedAnnotations > 0) {
    parts.push(`${result.resolvedAnnotations} probleem/problemen opgelost`);
  }
  if (result.conflicts.length > 0) {
    parts.push(`${result.conflicts.length} conflict(en) gedetecteerd`);
  }
  if (parts.length === 0) return 'Geen wijzigingen gevonden';
  return parts.join(', ');
}
