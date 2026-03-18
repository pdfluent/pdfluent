// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Bundle Import
//
// Parses and validates a .reviewbundle JSON string and extracts the typed
// sub-structures needed to restore editor state.
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../../core/document';
import {
  REVIEW_BUNDLE_VERSION,
  makeEmptyReviewState,
} from '../collaboration/reviewBundleFormat';
import type {
  BundleMetadata,
  BundleReviewState,
  BundleAuditLog,
} from '../collaboration/reviewBundleFormat';

export interface ReviewBundleImportResult {
  /** True when parsing and validation succeeded. */
  success: boolean;
  /** Parsed metadata (only present on success). */
  metadata?: BundleMetadata;
  /** Parsed review state (only present on success). */
  reviewState?: BundleReviewState;
  /** Parsed audit log (only present on success). */
  auditLog?: BundleAuditLog;
  /** Human-readable error description (only present on failure). */
  error?: string;
}

/**
 * Parse a .reviewbundle JSON string and return a typed result.
 * Returns a failure result (success: false) on any parse or validation error.
 */
export function parseReviewBundleJson(json: string): ReviewBundleImportResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(json) as any;

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Bundle is geen geldig object' };
    }

    if (!parsed.metadata) {
      return { success: false, error: 'Ontbrekende velden: metadata' };
    }

    if (!parsed.reviewState) {
      return { success: false, error: 'Ontbrekende velden: reviewState' };
    }

    if (!parsed.metadata.version) {
      return { success: false, error: 'Ontbrekende versie in metadata' };
    }

    return {
      success: true,
      metadata: parsed.metadata as BundleMetadata,
      reviewState: parsed.reviewState as BundleReviewState,
      auditLog: (parsed.auditLog as BundleAuditLog) ?? { events: [] },
    };
  } catch {
    return { success: false, error: 'Ongeldige JSON in bundle' };
  }
}

/**
 * Return true when the bundle's schema version is compatible with the current app.
 * Major-version mismatches (future: 2.x) would return false.
 */
export function validateBundleVersion(metadata: BundleMetadata): boolean {
  return metadata.version === REVIEW_BUNDLE_VERSION;
}

/**
 * Extract annotations from an imported bundle's review state.
 * Returns an empty array when reviewState has no annotations field.
 */
export function extractAnnotationsFromBundle(reviewState: BundleReviewState): Annotation[] {
  return reviewState.annotations ?? [];
}

/**
 * Reconstruct the review status Map from an imported bundle's serialised entries.
 */
export function extractReviewStatusesFromBundle(
  reviewState: BundleReviewState,
): Map<string, 'open' | 'resolved'> {
  return new Map(reviewState.reviewStatuses ?? []);
}

/**
 * Reconstruct the comment replies Map from an imported bundle's serialised entries.
 */
export function extractCommentRepliesFromBundle(
  reviewState: BundleReviewState,
): Map<string, Reply[]> {
  return new Map(reviewState.commentReplies ?? []);
}

/**
 * Build an ImportResult for an empty/missing bundle (e.g. no file selected).
 * Useful as a safe fallback in UI handlers.
 */
export function makeEmptyImportResult(): ReviewBundleImportResult {
  return {
    success: false,
    error: 'Geen bundle geselecteerd',
  };
}

/**
 * Validate that a ReviewBundleImportResult is structurally complete.
 * Checks that the review state has the expected array fields.
 */
export function isImportResultValid(result: ReviewBundleImportResult): boolean {
  if (!result.success || !result.reviewState) return false;
  return (
    Array.isArray(result.reviewState.annotations) &&
    Array.isArray(result.reviewState.reviewStatuses) &&
    Array.isArray(result.reviewState.commentReplies)
  );
}

/**
 * Attempt to recover a partial import result by filling in missing fields
 * with empty defaults.  Returns the patched result (still marked success: false
 * if metadata was missing).
 */
export function patchIncompleteBundle(
  result: ReviewBundleImportResult,
): ReviewBundleImportResult {
  if (!result.reviewState) {
    return { ...result, reviewState: makeEmptyReviewState() };
  }
  const patched: BundleReviewState = {
    annotations: result.reviewState.annotations ?? [],
    reviewStatuses: result.reviewState.reviewStatuses ?? [],
    commentReplies: result.reviewState.commentReplies ?? [],
  };
  return { ...result, reviewState: patched };
}
