// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Performance Limits
//
// Centralised constants and guard helpers for runtime caps that prevent
// memory and render-performance degradation on large documents.
//
// Rules:
//   - SNAPSHOT_MAX  — maximum in-memory revision snapshots before oldest eviction
//   - ANNOTATION_RENDER_THROTTLE_MS — minimum ms between annotation overlay repaints
//   - EVENT_LOG_MAX (re-exported from documentEvents)
// ---------------------------------------------------------------------------

import { DOCUMENT_EVENT_LOG_MAX } from './documentEvents';
export const EVENT_LOG_MAX = DOCUMENT_EVENT_LOG_MAX;

/** Maximum number of revision snapshots kept in memory. */
export const SNAPSHOT_MAX = 20;

/**
 * Minimum interval (ms) between annotation overlay renders.
 * Used by the AnnotationOverlay to throttle rapid repaints during scroll.
 */
export const ANNOTATION_RENDER_THROTTLE_MS = 100;

/**
 * Guard function: enforce SNAPSHOT_MAX on the snapshots array.
 * Returns a new array with the oldest entries evicted when the cap is exceeded.
 */
export function enforceSnapshotMax<T>(snapshots: readonly T[]): T[] {
  if (snapshots.length <= SNAPSHOT_MAX) return [...snapshots];
  return [...snapshots.slice(snapshots.length - SNAPSHOT_MAX)];
}

/**
 * Guard function: returns true when the event log is at or above capacity.
 * Callers can use this for metrics / warnings before appending.
 */
export function isEventLogAtCapacity(logLength: number): boolean {
  return logLength >= EVENT_LOG_MAX;
}

/**
 * Guard function: returns true when annotation count exceeds a safe render
 * threshold that might cause visible jank on the canvas layer.
 */
export const ANNOTATION_RENDER_WARNING_THRESHOLD = 500;
export function isAnnotationCountHighRisk(count: number): boolean {
  return count >= ANNOTATION_RENDER_WARNING_THRESHOLD;
}
