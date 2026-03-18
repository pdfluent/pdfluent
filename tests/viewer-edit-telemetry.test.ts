// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Edit Telemetry — Phase 5 Batch 8
 *
 * Verifies the in-process edit telemetry system:
 * - recordEditEvent stores events with ISO timestamps
 * - clearEditTelemetry resets state
 * - getEditTelemetryByOutcome filters correctly
 * - getRecentEditTelemetry respects n parameter
 * - getEditTelemetrySummary computes totals and rejection rate correctly
 * - Buffer cap: oldest events are dropped at MAX_EVENTS
 * - All EditOutcome values are accepted without crash
 * - No network calls — all state is in-memory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordEditEvent,
  clearEditTelemetry,
  getEditTelemetry,
  getEditTelemetryByOutcome,
  getRecentEditTelemetry,
  getEditTelemetrySummary,
} from '../src/viewer/state/editTelemetry';
import type { EditOutcome } from '../src/viewer/state/editTelemetry';

// ---------------------------------------------------------------------------
// Setup: clear telemetry before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearEditTelemetry();
});

// ---------------------------------------------------------------------------
// Basic recording
// ---------------------------------------------------------------------------

describe('editTelemetry — recording', () => {
  it('starts empty', () => {
    expect(getEditTelemetry()).toHaveLength(0);
  });

  it('records a single event', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 11, replacementLength: 5, reasonCode: null, supportClass: 'writable_digital_text' });
    expect(getEditTelemetry()).toHaveLength(1);
  });

  it('recorded event has correct fields', () => {
    recordEditEvent({ pageIndex: 2, outcome: 'validation-failed', originalLength: 10, replacementLength: 15, reasonCode: 'replacement-too-long', supportClass: 'writable_digital_text' });
    const events = getEditTelemetry();
    expect(events[0].pageIndex).toBe(2);
    expect(events[0].outcome).toBe('validation-failed');
    expect(events[0].originalLength).toBe(10);
    expect(events[0].replacementLength).toBe(15);
    expect(events[0].reasonCode).toBe('replacement-too-long');
  });

  it('event has ISO timestamp', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'cancelled', originalLength: 5, replacementLength: 0, reasonCode: null, supportClass: null });
    const ts = getEditTelemetry()[0].timestamp;
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('records multiple events in order', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: 'writable_digital_text' });
    recordEditEvent({ pageIndex: 1, outcome: 'support-blocked', originalLength: 8, replacementLength: 0, reasonCode: null, supportClass: 'ocr_read_only' });
    const events = getEditTelemetry();
    expect(events[0].outcome).toBe('mutation-pending');
    expect(events[1].outcome).toBe('support-blocked');
  });
});

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

describe('editTelemetry — clear', () => {
  it('clearEditTelemetry empties the store', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'no-change', originalLength: 5, replacementLength: 5, reasonCode: null, supportClass: null });
    clearEditTelemetry();
    expect(getEditTelemetry()).toHaveLength(0);
  });

  it('recording after clear works normally', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'cancelled', originalLength: 3, replacementLength: 0, reasonCode: null, supportClass: null });
    clearEditTelemetry();
    recordEditEvent({ pageIndex: 1, outcome: 'mutation-committed', originalLength: 7, replacementLength: 5, reasonCode: null, supportClass: null });
    expect(getEditTelemetry()).toHaveLength(1);
    expect(getEditTelemetry()[0].outcome).toBe('mutation-committed');
  });
});

// ---------------------------------------------------------------------------
// Filter by outcome
// ---------------------------------------------------------------------------

describe('editTelemetry — getEditTelemetryByOutcome', () => {
  it('returns only events with matching outcome', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    recordEditEvent({ pageIndex: 1, outcome: 'support-blocked', originalLength: 8, replacementLength: 0, reasonCode: null, supportClass: null });
    recordEditEvent({ pageIndex: 2, outcome: 'mutation-pending', originalLength: 6, replacementLength: 4, reasonCode: null, supportClass: null });
    const pending = getEditTelemetryByOutcome('mutation-pending');
    expect(pending).toHaveLength(2);
    expect(pending.every(e => e.outcome === 'mutation-pending')).toBe(true);
  });

  it('returns empty array when no events match', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'cancelled', originalLength: 3, replacementLength: 0, reasonCode: null, supportClass: null });
    expect(getEditTelemetryByOutcome('mutation-committed')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Recent events
// ---------------------------------------------------------------------------

describe('editTelemetry — getRecentEditTelemetry', () => {
  it('returns last N events', () => {
    for (let i = 0; i < 5; i++) {
      recordEditEvent({ pageIndex: i, outcome: 'no-change', originalLength: i, replacementLength: i, reasonCode: null, supportClass: null });
    }
    const recent = getRecentEditTelemetry(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].pageIndex).toBe(2);
    expect(recent[2].pageIndex).toBe(4);
  });

  it('returns all events when n exceeds total', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'cancelled', originalLength: 1, replacementLength: 0, reasonCode: null, supportClass: null });
    expect(getRecentEditTelemetry(100)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

describe('editTelemetry — getEditTelemetrySummary', () => {
  it('total is 0 when empty', () => {
    expect(getEditTelemetrySummary().total).toBe(0);
  });

  it('total matches recorded events', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-committed', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    expect(getEditTelemetrySummary().total).toBe(2);
  });

  it('byOutcome counts are correct', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    recordEditEvent({ pageIndex: 0, outcome: 'validation-failed', originalLength: 5, replacementLength: 10, reasonCode: 'replacement-too-long', supportClass: null });
    recordEditEvent({ pageIndex: 0, outcome: 'validation-failed', originalLength: 5, replacementLength: 8, reasonCode: 'replacement-too-long', supportClass: null });
    const summary = getEditTelemetrySummary();
    expect(summary.byOutcome['mutation-pending']).toBe(1);
    expect(summary.byOutcome['validation-failed']).toBe(2);
    expect(summary.byOutcome['cancelled']).toBe(0);
  });

  it('rejectionRate is 0 when no attempts', () => {
    expect(getEditTelemetrySummary().rejectionRate).toBe(0);
  });

  it('rejectionRate is 0.5 when half are rejected', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    recordEditEvent({ pageIndex: 0, outcome: 'validation-failed', originalLength: 5, replacementLength: 10, reasonCode: 'replacement-too-long', supportClass: null });
    const summary = getEditTelemetrySummary();
    expect(summary.rejectionRate).toBe(0.5);
  });

  it('rejectionRate is 1.0 when all are rejected', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-rejected', originalLength: 5, replacementLength: 3, reasonCode: 'encoding-not-supported', supportClass: null });
    recordEditEvent({ pageIndex: 0, outcome: 'validation-failed', originalLength: 5, replacementLength: 10, reasonCode: 'replacement-too-long', supportClass: null });
    expect(getEditTelemetrySummary().rejectionRate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// All outcome values accepted without crash
// ---------------------------------------------------------------------------

describe('editTelemetry — all outcome values', () => {
  const allOutcomes: EditOutcome[] = [
    'mutation-pending', 'mutation-committed', 'mutation-rejected',
    'validation-failed', 'support-blocked', 'cancelled', 'no-change',
  ];

  it('accepts all outcome values without throwing', () => {
    for (const outcome of allOutcomes) {
      expect(() =>
        recordEditEvent({ pageIndex: 0, outcome, originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null }),
      ).not.toThrow();
    }
    expect(getEditTelemetry()).toHaveLength(allOutcomes.length);
  });

  it('summary byOutcome has a key for every outcome', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 1, replacementLength: 1, reasonCode: null, supportClass: null });
    const summary = getEditTelemetrySummary();
    for (const outcome of allOutcomes) {
      expect(outcome in summary.byOutcome).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Buffer cap
// ---------------------------------------------------------------------------

describe('editTelemetry — buffer cap at 500 events', () => {
  it('does not exceed 500 events', () => {
    for (let i = 0; i < 510; i++) {
      recordEditEvent({ pageIndex: 0, outcome: 'no-change', originalLength: 1, replacementLength: 1, reasonCode: null, supportClass: null });
    }
    expect(getEditTelemetry().length).toBeLessThanOrEqual(500);
  });

  it('newest events are kept when buffer is full', () => {
    for (let i = 0; i < 500; i++) {
      recordEditEvent({ pageIndex: i, outcome: 'no-change', originalLength: 1, replacementLength: 1, reasonCode: null, supportClass: null });
    }
    // Add one more to trigger a drop
    recordEditEvent({ pageIndex: 9999, outcome: 'mutation-committed', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: null });
    const events = getEditTelemetry();
    expect(events[events.length - 1].pageIndex).toBe(9999);
    expect(events[0].pageIndex).toBeGreaterThan(0); // oldest dropped
  });
});

// ---------------------------------------------------------------------------
// getEditTelemetry returns a copy (immutable from caller's perspective)
// ---------------------------------------------------------------------------

describe('editTelemetry — immutability', () => {
  it('mutating returned array does not affect internal state', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'cancelled', originalLength: 3, replacementLength: 0, reasonCode: null, supportClass: null });
    const copy = getEditTelemetry() as EditTelemetryEvent[];
    copy.push({
      timestamp: new Date().toISOString(),
      pageIndex: 99,
      outcome: 'no-change',
      originalLength: 0,
      replacementLength: 0,
      reasonCode: null,
      supportClass: null,
    });
    expect(getEditTelemetry()).toHaveLength(1); // internal unchanged
  });
});
