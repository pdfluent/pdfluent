// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Bundle Comparison
//
// Produces a structured diff between two BundleReviewState objects.
// Used to preview changes before importing or merging a bundle.
// ---------------------------------------------------------------------------

import type { BundleReviewState } from './reviewBundleFormat';

export type AnnotationDiffKind = 'added' | 'removed' | 'unchanged';

export interface AnnotationDiff {
  /** The annotation id being described. */
  id: string;
  /** Whether this annotation is new, removed, or unchanged between bundles. */
  kind: AnnotationDiffKind;
}

export interface StatusChange {
  /** ID of the annotation whose status changed. */
  annotationId: string;
  /** Status in the base bundle. */
  from: 'open' | 'resolved';
  /** Status in the incoming bundle. */
  to: 'open' | 'resolved';
}

export interface BundleCompareDiff {
  /** Per-annotation diff entries. */
  annotationDiffs: AnnotationDiff[];
  /** Status transitions detected between bundles. */
  statusChanges: StatusChange[];
  /** Map of annotationId → number of replies added in incoming bundle. */
  addedReplyCounts: Map<string, number>;
  /** Count of annotations present in incoming but not in base. */
  addedAnnotations: number;
  /** Count of annotations present in base but not in incoming. */
  removedAnnotations: number;
  /** Total number of status transitions. */
  statusChangesCount: number;
  /** Total replies added across all annotations. */
  totalRepliesAdded: number;
}

/**
 * Produce a structured diff between two BundleReviewState objects.
 * Does not modify either state; purely observational.
 */
export function compareReviewBundles(
  base: BundleReviewState,
  incoming: BundleReviewState,
): BundleCompareDiff {
  // --- Annotations ---
  const baseIds = new Set(base.annotations.map(a => a.id));
  const incomingIds = new Set(incoming.annotations.map(a => a.id));

  const annotationDiffs: AnnotationDiff[] = [];
  for (const id of baseIds) {
    annotationDiffs.push({ id, kind: incomingIds.has(id) ? 'unchanged' : 'removed' });
  }
  for (const id of incomingIds) {
    if (!baseIds.has(id)) {
      annotationDiffs.push({ id, kind: 'added' });
    }
  }

  const addedAnnotations = annotationDiffs.filter(d => d.kind === 'added').length;
  const removedAnnotations = annotationDiffs.filter(d => d.kind === 'removed').length;

  // --- Status changes ---
  const baseStatusMap = new Map<string, 'open' | 'resolved'>(base.reviewStatuses);
  const incomingStatusMap = new Map<string, 'open' | 'resolved'>(incoming.reviewStatuses);

  const statusChanges: StatusChange[] = [];
  for (const [id, incomingStatus] of incomingStatusMap) {
    const baseStatus = baseStatusMap.get(id) ?? 'open';
    if (baseStatus !== incomingStatus) {
      statusChanges.push({ annotationId: id, from: baseStatus, to: incomingStatus });
    }
  }

  // --- Reply additions ---
  const baseRepliesMap = new Map<string, unknown[]>(base.commentReplies);
  const incomingRepliesMap = new Map<string, unknown[]>(incoming.commentReplies);
  const addedReplyCounts = new Map<string, number>();

  for (const [annotId, incomingReplies] of incomingRepliesMap) {
    const baseCount = (baseRepliesMap.get(annotId) ?? []).length;
    const diff = incomingReplies.length - baseCount;
    if (diff > 0) {
      addedReplyCounts.set(annotId, diff);
    }
  }

  const totalRepliesAdded = [...addedReplyCounts.values()].reduce((s, n) => s + n, 0);

  return {
    annotationDiffs,
    statusChanges,
    addedReplyCounts,
    addedAnnotations,
    removedAnnotations,
    statusChangesCount: statusChanges.length,
    totalRepliesAdded,
  };
}

/**
 * Return true when the two bundles have no meaningful differences.
 */
export function isBundleIdentical(diff: BundleCompareDiff): boolean {
  return (
    diff.addedAnnotations === 0 &&
    diff.removedAnnotations === 0 &&
    diff.statusChangesCount === 0 &&
    diff.totalRepliesAdded === 0
  );
}

/**
 * Count annotation diff entries matching a specific kind.
 */
export function countAnnotationsByKind(
  diffs: AnnotationDiff[],
  kind: AnnotationDiffKind,
): number {
  return diffs.filter(d => d.kind === kind).length;
}

/**
 * Return a human-readable Dutch summary of a BundleCompareDiff.
 */
export function describeBundleDiff(diff: BundleCompareDiff): string {
  if (isBundleIdentical(diff)) return 'Bundels zijn identiek';
  const parts: string[] = [];
  if (diff.addedAnnotations > 0) {
    parts.push(`${diff.addedAnnotations} annotatie(s) toegevoegd`);
  }
  if (diff.removedAnnotations > 0) {
    parts.push(`${diff.removedAnnotations} annotatie(s) verwijderd`);
  }
  if (diff.statusChangesCount > 0) {
    parts.push(`${diff.statusChangesCount} status(sen) gewijzigd`);
  }
  if (diff.totalRepliesAdded > 0) {
    parts.push(`${diff.totalRepliesAdded} reactie(s) toegevoegd`);
  }
  return parts.join(', ');
}
