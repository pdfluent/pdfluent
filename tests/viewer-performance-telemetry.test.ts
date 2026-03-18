// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Performance Telemetry Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 9
 *
 * Verified:
 * - recordPerfEvent: appends events, ring buffer caps at MAX_PERF_EVENTS
 * - clearPerfTelemetry: empties the buffer
 * - getPerfEvents: returns readonly snapshot
 * - getPerfEventsByCategory: filters correctly
 * - computePercentile: p50/p95/p99 for known distributions
 * - getPerfSummary: correct aggregates, null for missing category
 * - getRecordedCategories: returns unique categories
 * - getSlowEvents: threshold filtering
 * - isPageRenderWithinBudget: budget check
 * - startPerfTimer: records duration on stop
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordPerfEvent,
  clearPerfTelemetry,
  getPerfEvents,
  getPerfEventsByCategory,
  computePercentile,
  getPerfSummary,
  getRecordedCategories,
  getSlowEvents,
  isPageRenderWithinBudget,
  startPerfTimer,
  MAX_PERF_EVENTS,
  SLOW_OPERATION_THRESHOLD_MS,
  PAGE_RENDER_BUDGET_MS,
} from '../src/viewer/performance/performanceTelemetry';
import type { PerfEventCategory } from '../src/viewer/performance/performanceTelemetry';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearPerfTelemetry();
});

// ---------------------------------------------------------------------------
// recordPerfEvent
// ---------------------------------------------------------------------------

describe('performanceTelemetry — recordPerfEvent', () => {
  it('records a single event', () => {
    recordPerfEvent({ category: 'page-render', label: 'page 1', durationMs: 100 });
    expect(getPerfEvents()).toHaveLength(1);
  });

  it('event has ISO timestamp', () => {
    recordPerfEvent({ category: 'page-render', label: 'page 1', durationMs: 100 });
    const event = getPerfEvents()[0]!;
    expect(() => new Date(event.timestamp)).not.toThrow();
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores all event fields', () => {
    recordPerfEvent({ category: 'document-open', label: 'test.pdf', durationMs: 250, pageIndex: 0 });
    const event = getPerfEvents()[0]!;
    expect(event.category).toBe('document-open');
    expect(event.label).toBe('test.pdf');
    expect(event.durationMs).toBe(250);
    expect(event.pageIndex).toBe(0);
  });

  it('ring buffer evicts oldest at MAX_PERF_EVENTS + 1', () => {
    for (let i = 0; i < MAX_PERF_EVENTS + 1; i++) {
      recordPerfEvent({ category: 'search', label: `search ${i}`, durationMs: i });
    }
    const events = getPerfEvents();
    expect(events).toHaveLength(MAX_PERF_EVENTS);
    expect(events[0]!.durationMs).toBe(1); // first was evicted
  });
});

// ---------------------------------------------------------------------------
// clearPerfTelemetry
// ---------------------------------------------------------------------------

describe('performanceTelemetry — clearPerfTelemetry', () => {
  it('clears all events', () => {
    recordPerfEvent({ category: 'export', label: 'test', durationMs: 500 });
    clearPerfTelemetry();
    expect(getPerfEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getPerfEventsByCategory
// ---------------------------------------------------------------------------

describe('performanceTelemetry — getPerfEventsByCategory', () => {
  it('returns only events of the requested category', () => {
    recordPerfEvent({ category: 'page-render', label: 'p1', durationMs: 50 });
    recordPerfEvent({ category: 'document-open', label: 'doc', durationMs: 300 });
    recordPerfEvent({ category: 'page-render', label: 'p2', durationMs: 60 });

    const renders = getPerfEventsByCategory('page-render');
    expect(renders).toHaveLength(2);
    renders.forEach(e => expect(e.category).toBe('page-render'));
  });

  it('returns empty array when no events for category', () => {
    expect(getPerfEventsByCategory('ocr')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computePercentile
// ---------------------------------------------------------------------------

describe('performanceTelemetry — computePercentile', () => {
  it('returns 0 for empty array', () => {
    expect(computePercentile([], 50)).toBe(0);
  });

  it('computes median correctly for odd-length array', () => {
    expect(computePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('computes p95 for 100-element uniform distribution', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(computePercentile(values, 95)).toBe(95);
  });

  it('handles unsorted input', () => {
    const values = [5, 1, 3, 2, 4];
    expect(computePercentile(values, 50)).toBe(3);
  });

  it('p100 returns maximum value', () => {
    expect(computePercentile([10, 20, 30], 100)).toBe(30);
  });

  it('p0 returns minimum value', () => {
    // p0: ceil(0/100 * 3) - 1 = -1 → Math.max(0, -1) = 0 → sorted[0]
    expect(computePercentile([10, 20, 30], 0)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getPerfSummary
// ---------------------------------------------------------------------------

describe('performanceTelemetry — getPerfSummary', () => {
  it('returns null when no events for category', () => {
    expect(getPerfSummary('ocr')).toBeNull();
  });

  it('returns correct count and avg', () => {
    recordPerfEvent({ category: 'page-render', label: 'p1', durationMs: 100 });
    recordPerfEvent({ category: 'page-render', label: 'p2', durationMs: 200 });
    recordPerfEvent({ category: 'page-render', label: 'p3', durationMs: 300 });

    const summary = getPerfSummary('page-render')!;
    expect(summary.count).toBe(3);
    expect(summary.avgMs).toBeCloseTo(200);
    expect(summary.minMs).toBe(100);
    expect(summary.maxMs).toBe(300);
  });

  it('p50 is median', () => {
    for (let i = 1; i <= 10; i++) {
      recordPerfEvent({ category: 'text-edit-commit', label: `edit ${i}`, durationMs: i * 100 });
    }
    const summary = getPerfSummary('text-edit-commit')!;
    expect(summary.p50Ms).toBe(500); // median of 100..1000
  });

  it('p95 is above most values', () => {
    for (let i = 1; i <= 100; i++) {
      recordPerfEvent({ category: 'search', label: `s${i}`, durationMs: i });
    }
    const summary = getPerfSummary('search')!;
    expect(summary.p95Ms).toBe(95);
    expect(summary.p99Ms).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// getRecordedCategories
// ---------------------------------------------------------------------------

describe('performanceTelemetry — getRecordedCategories', () => {
  it('returns empty array when no events recorded', () => {
    expect(getRecordedCategories()).toHaveLength(0);
  });

  it('returns unique categories', () => {
    recordPerfEvent({ category: 'page-render', label: 'p1', durationMs: 50 });
    recordPerfEvent({ category: 'page-render', label: 'p2', durationMs: 60 });
    recordPerfEvent({ category: 'document-open', label: 'doc', durationMs: 300 });

    const cats = getRecordedCategories();
    expect(cats).toHaveLength(2);
    expect(cats).toContain('page-render');
    expect(cats).toContain('document-open');
  });
});

// ---------------------------------------------------------------------------
// getSlowEvents
// ---------------------------------------------------------------------------

describe('performanceTelemetry — getSlowEvents', () => {
  it('returns events at or above threshold', () => {
    recordPerfEvent({ category: 'export', label: 'fast', durationMs: 100 });
    recordPerfEvent({ category: 'export', label: 'slow', durationMs: SLOW_OPERATION_THRESHOLD_MS });
    recordPerfEvent({ category: 'ocr', label: 'very slow', durationMs: SLOW_OPERATION_THRESHOLD_MS + 1000 });

    const slow = getSlowEvents();
    expect(slow).toHaveLength(2);
  });

  it('returns empty when all events are fast', () => {
    recordPerfEvent({ category: 'search', label: 'quick', durationMs: 10 });
    expect(getSlowEvents()).toHaveLength(0);
  });

  it('respects custom threshold', () => {
    recordPerfEvent({ category: 'page-render', label: 'p1', durationMs: 200 });
    recordPerfEvent({ category: 'page-render', label: 'p2', durationMs: 400 });
    const slow = getSlowEvents(300);
    expect(slow).toHaveLength(1);
    expect(slow[0]!.durationMs).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// isPageRenderWithinBudget
// ---------------------------------------------------------------------------

describe('performanceTelemetry — isPageRenderWithinBudget', () => {
  it('returns true when no page-render events', () => {
    expect(isPageRenderWithinBudget()).toBe(true);
  });

  it('returns true when all renders are within budget', () => {
    for (let i = 0; i < 5; i++) {
      recordPerfEvent({ category: 'page-render', label: `p${i}`, durationMs: PAGE_RENDER_BUDGET_MS - 1 });
    }
    expect(isPageRenderWithinBudget()).toBe(true);
  });

  it('returns false when any render exceeds budget', () => {
    recordPerfEvent({ category: 'page-render', label: 'fast', durationMs: 100 });
    recordPerfEvent({ category: 'page-render', label: 'slow', durationMs: PAGE_RENDER_BUDGET_MS + 1 });
    expect(isPageRenderWithinBudget()).toBe(false);
  });

  it('only checks the last N renders (sampleSize)', () => {
    // Add a slow early render
    recordPerfEvent({ category: 'page-render', label: 'old slow', durationMs: PAGE_RENDER_BUDGET_MS + 1000 });
    // Then 10 fast renders
    for (let i = 0; i < 10; i++) {
      recordPerfEvent({ category: 'page-render', label: `fast${i}`, durationMs: 50 });
    }
    // With sampleSize=10, the old slow event is excluded
    expect(isPageRenderWithinBudget(10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// startPerfTimer
// ---------------------------------------------------------------------------

describe('performanceTelemetry — startPerfTimer', () => {
  it('records an event on stop', () => {
    const timer = startPerfTimer('document-save', 'save test.pdf');
    timer.stop();
    expect(getPerfEventsByCategory('document-save')).toHaveLength(1);
  });

  it('returns a non-negative duration', () => {
    const timer = startPerfTimer('annotation-save', 'annot');
    const duration = timer.stop();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('uses override label when provided to stop()', () => {
    const timer = startPerfTimer('export', 'default label');
    timer.stop('override label');
    const events = getPerfEventsByCategory('export');
    expect(events[0]!.label).toBe('override label');
  });

  it('stores pageIndex when provided', () => {
    const timer = startPerfTimer('page-render', 'render');
    timer.stop(undefined, 5);
    const events = getPerfEventsByCategory('page-render');
    expect(events[0]!.pageIndex).toBe(5);
  });
});
