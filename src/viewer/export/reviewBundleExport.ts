// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Bundle Export
//
// Assembles a ReviewBundle from live editor state and serialises it to JSON.
// The resulting string can be saved to disk via Tauri's dialog or downloaded
// in the browser as a .reviewbundle file.
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../../core/document';
import type { DocumentEvent } from '../state/documentEvents';
import {
  makeBundleMetadata,
  serializeReviewBundle,
  REVIEW_BUNDLE_EXTENSION,
} from '../collaboration/reviewBundleFormat';
import type { ReviewBundle, BundleReviewState, BundleAuditLog } from '../collaboration/reviewBundleFormat';
import { buildTimestampSuffix, sanitiseTitle } from './exportUtils';

/** Complete, serialisable payload built from the current editor state. */
export type ReviewBundleExportPayload = ReviewBundle;

/**
 * Build a ReviewBundle from the current editor state.
 *
 * @param title         Document title (falls back to "Document").
 * @param annotations   All annotations loaded from the PDF.
 * @param reviewStatuses Map of annotation id → open | resolved.
 * @param commentReplies Map of annotation id → Reply[].
 * @param eventLog      In-memory document event log.
 * @param exportedBy    Name of the reviewer exporting the bundle.
 */
export function buildReviewBundlePayload(
  title: string,
  annotations: readonly Annotation[],
  reviewStatuses: ReadonlyMap<string, 'open' | 'resolved'>,
  commentReplies: ReadonlyMap<string, Reply[]>,
  eventLog: readonly DocumentEvent[],
  exportedBy: string,
): ReviewBundleExportPayload {
  const metadata = makeBundleMetadata(title, exportedBy);

  const reviewState: BundleReviewState = {
    annotations: [...annotations],
    reviewStatuses: Array.from(reviewStatuses.entries()),
    commentReplies: Array.from(commentReplies.entries()),
  };

  const auditLog: BundleAuditLog = {
    events: [...eventLog],
  };

  return { metadata, reviewState, auditLog };
}

/**
 * Serialise a ReviewBundleExportPayload to a JSON string.
 * Delegates to serializeReviewBundle for consistent formatting.
 */
export function serializeBundlePayload(payload: ReviewBundleExportPayload): string {
  return serializeReviewBundle(payload);
}

/**
 * Build a file name for the exported bundle.
 *
 * Pattern: `{sanitisedTitle}_review_{YYYYMMDD_HHmmss}.reviewbundle`
 * Example: `jaarverslag_review_20260317_102042.reviewbundle`
 */
export function buildBundleFilename(
  title: string,
  date: Date = new Date(),
): string {
  const safe = sanitiseTitle(title);
  const ts = buildTimestampSuffix(date);
  return `${safe}_review_${ts}${REVIEW_BUNDLE_EXTENSION}`;
}

/**
 * Guard: returns false when the bundle would be empty (nothing to export).
 * A bundle is considered non-empty when it has annotations OR event log entries.
 */
export function isBundleExportable(
  annotations: readonly Annotation[],
  eventLog: readonly DocumentEvent[],
): boolean {
  return annotations.length > 0 || eventLog.length > 0;
}
