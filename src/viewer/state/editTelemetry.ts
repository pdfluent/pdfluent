// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Edit Telemetry — Phase 5 Batch 8
 *
 * Lightweight in-process telemetry for text mutation events.
 * Records edit attempts, outcomes, and rejection reasons for:
 *   - Development debugging without console noise
 *   - Integration test assertions via window.__pdfluent_test__.editTelemetry
 *   - Future analytics (opt-in, anonymized) — data stays local for now
 *
 * Telemetry is never sent over the network. It lives in memory only
 * and is reset on page reload or when clearEditTelemetry() is called.
 *
 * The window.__pdfluent_test__ namespace is populated in development and
 * test builds; in production it is omitted (tree-shaken by build tool).
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type EditOutcome =
  | 'mutation-pending'      // successfully queued for backend write
  | 'mutation-committed'    // backend confirmed write
  | 'mutation-rejected'     // backend rejected (encoding, overflow, etc.)
  | 'validation-failed'     // validateReplacement rejected before IPC call
  | 'support-blocked'       // getMutationSupport says non-writable
  | 'cancelled'             // user cancelled the edit
  | 'no-change';            // text was identical to original

export interface EditTelemetryEvent {
  /** ISO timestamp. */
  readonly timestamp: string;
  /** Which page index the edit occurred on. */
  readonly pageIndex: number;
  /** Outcome classification. */
  readonly outcome: EditOutcome;
  /** Character count of the original text. */
  readonly originalLength: number;
  /** Character count of the replacement text (0 if cancelled/no-change). */
  readonly replacementLength: number;
  /** Machine-readable reason code from validation or backend. */
  readonly reasonCode: string | null;
  /** Support class of the target at time of commit attempt. */
  readonly supportClass: string | null;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

let _events: EditTelemetryEvent[] = [];

/** Maximum events retained before oldest are dropped. */
const MAX_EVENTS = 500;

// ---------------------------------------------------------------------------
// Record / clear
// ---------------------------------------------------------------------------

/**
 * Record an edit telemetry event.
 * Drops the oldest event when the buffer is full.
 */
export function recordEditEvent(event: Omit<EditTelemetryEvent, 'timestamp'>): void {
  const entry: EditTelemetryEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  if (_events.length >= MAX_EVENTS) {
    _events.shift();
  }
  _events.push(entry);
  _syncTestHook();
}

/**
 * Clear all recorded telemetry events.
 */
export function clearEditTelemetry(): void {
  _events = [];
  _syncTestHook();
}

/**
 * Return a shallow copy of all recorded events.
 */
export function getEditTelemetry(): readonly EditTelemetryEvent[] {
  return [..._events];
}

/**
 * Return only events matching the given outcome.
 */
export function getEditTelemetryByOutcome(outcome: EditOutcome): readonly EditTelemetryEvent[] {
  return _events.filter(e => e.outcome === outcome);
}

/**
 * Return the most recent N events (default: all).
 */
export function getRecentEditTelemetry(n = MAX_EVENTS): readonly EditTelemetryEvent[] {
  return _events.slice(-n);
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

export interface EditTelemetrySummary {
  readonly total: number;
  readonly byOutcome: Record<EditOutcome, number>;
  readonly rejectionRate: number;
}

/**
 * Compute a summary of all recorded telemetry events.
 */
export function getEditTelemetrySummary(): EditTelemetrySummary {
  const byOutcome: Record<EditOutcome, number> = {
    'mutation-pending': 0,
    'mutation-committed': 0,
    'mutation-rejected': 0,
    'validation-failed': 0,
    'support-blocked': 0,
    'cancelled': 0,
    'no-change': 0,
  };

  for (const event of _events) {
    byOutcome[event.outcome] = (byOutcome[event.outcome] ?? 0) + 1;
  }

  const attempted = byOutcome['mutation-pending'] + byOutcome['mutation-committed'] +
    byOutcome['mutation-rejected'] + byOutcome['validation-failed'];
  const rejected = byOutcome['mutation-rejected'] + byOutcome['validation-failed'];
  const rejectionRate = attempted > 0 ? rejected / attempted : 0;

  return { total: _events.length, byOutcome, rejectionRate };
}

// ---------------------------------------------------------------------------
// Test hook (development / test builds only)
// ---------------------------------------------------------------------------

function _syncTestHook(): void {
  if (typeof window === 'undefined') return;
  if (!window.__pdfluent_test__) return;
  window.__pdfluent_test__.editTelemetry = {
    get events() { return getEditTelemetry(); },
    get summary() { return getEditTelemetrySummary(); },
    clear: clearEditTelemetry,
  };
}
