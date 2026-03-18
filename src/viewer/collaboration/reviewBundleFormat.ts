// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Review Bundle Format
//
// Defines the portable .reviewbundle collaboration format.
// A bundle is a serialised JSON envelope containing:
//   - metadata.json   — title, version, exporter, timestamps, document hash
//   - review_state.json — annotations, review statuses, comment reply threads
//   - audit_log.json  — document event log entries
//
// The corresponding document.pdf is referenced but handled separately so the
// format stays pure-JSON and can be validated without a PDF parser.
// ---------------------------------------------------------------------------

import type { Annotation, Reply } from '../../core/document';
import type { DocumentEvent } from '../state/documentEvents';

/** File extension for collaboration bundles. */
export const REVIEW_BUNDLE_EXTENSION = '.reviewbundle';

/** Schema version — increment on breaking changes to the bundle structure. */
export const REVIEW_BUNDLE_VERSION = '1.0';

/** Canonical file names inside a bundle archive / envelope. */
export const BUNDLE_FILES = {
  DOCUMENT: 'document.pdf',
  REVIEW_STATE: 'review_state.json',
  AUDIT_LOG: 'audit_log.json',
  METADATA: 'metadata.json',
} as const;

// ---------------------------------------------------------------------------
// Bundle sub-structures
// ---------------------------------------------------------------------------

export interface BundleMetadata {
  /** Bundle schema version (REVIEW_BUNDLE_VERSION). */
  version: string;
  /** Document title at the time of export. */
  title: string;
  /**
   * SHA-256 (or similar) hash of the PDF bytes.
   * Used to detect document-content mismatches during import.
   */
  documentHash: string;
  /** ISO timestamp of first bundle creation. */
  createdAt: string;
  /** Author / reviewer who exported this bundle. */
  exportedBy: string;
  /** ISO timestamp of this specific export. */
  exportedAt: string;
}

/** Serialisable snapshot of the review workflow state. */
export interface BundleReviewState {
  /** All annotations at export time (all types). */
  annotations: Annotation[];
  /** Review status map serialised as entries: [annotationId, 'open'|'resolved']. */
  reviewStatuses: [string, 'open' | 'resolved'][];
  /** Comment reply threads serialised as entries: [annotationId, Reply[]]. */
  commentReplies: [string, Reply[]][];
}

/** Serialisable document event log. */
export interface BundleAuditLog {
  events: DocumentEvent[];
}

/** Top-level structure of a complete review bundle. */
export interface ReviewBundle {
  metadata: BundleMetadata;
  reviewState: BundleReviewState;
  auditLog: BundleAuditLog;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a BundleMetadata object.
 * `documentHash` is left empty here — callers compute it separately if needed.
 */
export function makeBundleMetadata(
  title: string,
  exportedBy: string,
): BundleMetadata {
  const now = new Date().toISOString();
  return {
    version: REVIEW_BUNDLE_VERSION,
    title: title.trim() || 'Document',
    documentHash: '',
    createdAt: now,
    exportedBy: exportedBy.trim() || 'Anonymous',
    exportedAt: now,
  };
}

/**
 * Build an empty BundleReviewState (no annotations, no statuses, no replies).
 * Useful as a baseline for import validation.
 */
export function makeEmptyReviewState(): BundleReviewState {
  return {
    annotations: [],
    reviewStatuses: [],
    commentReplies: [],
  };
}

/**
 * Serialise a ReviewBundle to a JSON string.
 * Pretty-printed for human readability and version-control friendliness.
 */
export function serializeReviewBundle(bundle: ReviewBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Build a minimal bundle manifest listing the canonical file names.
 * Can be written as a top-level index inside a bundle archive.
 */
export function serializeBundleManifest(bundle: ReviewBundle): string {
  return JSON.stringify({
    version: bundle.metadata.version,
    files: Object.values(BUNDLE_FILES),
    exportedAt: bundle.metadata.exportedAt,
    exportedBy: bundle.metadata.exportedBy,
    title: bundle.metadata.title,
  }, null, 2);
}
