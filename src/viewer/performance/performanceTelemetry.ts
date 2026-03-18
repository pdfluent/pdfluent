// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Performance Telemetry — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 9
 *
 * Lightweight in-memory performance measurement system for the viewer.
 * Tracks operation durations, page render times, and user action latencies.
 *
 * Design:
 *   - All measurements are in milliseconds
 *   - Ring buffer of MAX_PERF_EVENTS events (oldest evicted on overflow)
 *   - Supports named timers with start/stop semantics
 *   - Aggregation helpers: avg, p50, p95, p99, max
 *   - window.__pdfluent_test__.perfTelemetry test hook (like editTelemetry)
 *   - Zero external dependencies
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PerfEventCategory =
  | 'page-render'
  | 'document-open'
  | 'document-save'
  | 'text-edit-commit'
  | 'layout-edit-commit'
  | 'annotation-save'
  | 'search'
  | 'export'
  | 'ocr'
  | 'redaction';

export interface PerfEvent {
  /** Event category. */
  readonly category: PerfEventCategory;
  /** Human-readable label for the specific operation. */
  readonly label: string;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  /** Optional page index (for page-specific events). */
  readonly pageIndex?: number;
}

export interface PerfSummary {
  readonly category: PerfEventCategory;
  readonly count: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly minMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum events kept before oldest entries are evicted. */
export const MAX_PERF_EVENTS = 1000;

/** Warning threshold: operations taking longer than this (ms) are flagged. */
export const SLOW_OPERATION_THRESHOLD_MS = 3000;

/** Page render budget: pages should render in under this many ms. */
export const PAGE_RENDER_BUDGET_MS = 250;

// ---------------------------------------------------------------------------
// In-memory ring buffer
// ---------------------------------------------------------------------------

let _events: PerfEvent[] = [];

function _syncTestHook(): void {
  if (typeof window !== 'undefined') {
    // @ts-expect-error — test hook
    window.__pdfluent_test__ ??= {};
    // @ts-expect-error — test hook
    window.__pdfluent_test__.perfTelemetry = _events;
  }
}

/**
 * Record a completed performance event.
 */
export function recordPerfEvent(
  event: Omit<PerfEvent, 'timestamp'>,
): void {
  const full: PerfEvent = { ...event, timestamp: new Date().toISOString() };
  _events.push(full);
  if (_events.length > MAX_PERF_EVENTS) {
    _events = _events.slice(_events.length - MAX_PERF_EVENTS);
  }
  _syncTestHook();
}

/**
 * Clear all recorded events.
 */
export function clearPerfTelemetry(): void {
  _events = [];
  _syncTestHook();
}

/**
 * Return all recorded events (readonly snapshot).
 */
export function getPerfEvents(): readonly PerfEvent[] {
  return _events;
}

/**
 * Return events filtered by category.
 */
export function getPerfEventsByCategory(category: PerfEventCategory): readonly PerfEvent[] {
  return _events.filter(e => e.category === category);
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Compute sorted percentile from an array of values (0–100).
 */
export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

/**
 * Compute a performance summary for a given category.
 * Returns null if no events exist for the category.
 */
export function getPerfSummary(category: PerfEventCategory): PerfSummary | null {
  const events = _events.filter(e => e.category === category);
  if (events.length === 0) return null;

  const durations = events.map(e => e.durationMs);
  return {
    category,
    count: events.length,
    avgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    p50Ms: computePercentile(durations, 50),
    p95Ms: computePercentile(durations, 95),
    p99Ms: computePercentile(durations, 99),
    maxMs: Math.max(...durations),
    minMs: Math.min(...durations),
  };
}

/**
 * Return all categories for which events have been recorded.
 */
export function getRecordedCategories(): PerfEventCategory[] {
  return [...new Set(_events.map(e => e.category))];
}

/**
 * Return events whose duration exceeds SLOW_OPERATION_THRESHOLD_MS.
 */
export function getSlowEvents(thresholdMs = SLOW_OPERATION_THRESHOLD_MS): readonly PerfEvent[] {
  return _events.filter(e => e.durationMs >= thresholdMs);
}

/**
 * Return true when the most recent page-render events are within budget.
 * Checks the last `sampleSize` page-render events.
 */
export function isPageRenderWithinBudget(
  sampleSize = 10,
  budgetMs = PAGE_RENDER_BUDGET_MS,
): boolean {
  const pageRenders = _events
    .filter(e => e.category === 'page-render')
    .slice(-sampleSize);
  if (pageRenders.length === 0) return true;
  return pageRenders.every(e => e.durationMs <= budgetMs);
}

// ---------------------------------------------------------------------------
// Timer helpers (convenience wrappers)
// ---------------------------------------------------------------------------

export interface PerfTimer {
  /** Stop the timer and record the event. Returns duration in ms. */
  stop(label?: string, pageIndex?: number): number;
}

/**
 * Start a named performance timer.
 * Call .stop() to record the event with the measured duration.
 */
export function startPerfTimer(category: PerfEventCategory, label: string): PerfTimer {
  const startMs = typeof performance !== 'undefined'
    ? performance.now()
    : Date.now();

  return {
    stop(overrideLabel?: string, pageIndex?: number): number {
      const endMs = typeof performance !== 'undefined'
        ? performance.now()
        : Date.now();
      const durationMs = Math.max(0, endMs - startMs);
      recordPerfEvent({
        category,
        label: overrideLabel ?? label,
        durationMs,
        pageIndex,
      });
      return durationMs;
    },
  };
}
