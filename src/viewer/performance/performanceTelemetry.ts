// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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

// ---------------------------------------------------------------------------
// Long-task recording via PerformanceObserver
// ---------------------------------------------------------------------------

const _longTasks: Array<{ startTime: number; durationMs: number; attribution?: string }> = [];

if (typeof PerformanceObserver !== 'undefined') {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        _longTasks.push({
          startTime: entry.startTime,
          durationMs: entry.duration,
          attribution: (entry as unknown as { attribution?: Array<{ name: string }> })
            .attribution?.[0]?.name,
        });
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask not supported in all environments (e.g. WebKit)
  }
}

// ---------------------------------------------------------------------------
// Sub-timer hook — records fine-grained timings from render pipeline
// ---------------------------------------------------------------------------

const _devPerfData: Array<{label: string; ms: number; page: number}> = [];

// ---------------------------------------------------------------------------
// window.__PDFLUENT_PERF__ — rich devtools namespace
// ---------------------------------------------------------------------------

/**
 * Rich performance summary callable from devtools:
 *   window.__PDFLUENT_PERF__.summary()   — prints timers + long tasks + cache + render stats
 *   window.__PDFLUENT_PERF__.data        — raw sub-timer entries
 *   window.__PDFLUENT_PERF__.longTasks   — long tasks (>50 ms)
 *   window.__PDFLUENT_PERF__.clear()
 *
 * Render stats are also available separately at:
 *   window.__PDFLUENT_RENDER__ — { state, workerRenderCount, nativeCommandRenderCount,
 *                                  mainThreadRenderCount, fallbackReasons }
 */
export interface PdfluetPerfNamespace {
  /** Print a formatted summary of all sub-timer data to the console. */
  summary(): void;
  /** Raw sub-timer entries. */
  readonly data: ReadonlyArray<{label: string; ms: number; page: number}>;
  /** Long tasks recorded by PerformanceObserver (>50ms main-thread blocks). */
  readonly longTasks: ReadonlyArray<{ startTime: number; durationMs: number; attribution?: string }>;
  /** Clear all sub-timer data and long-task records. */
  clear(): void;
  /** Record a sub-timer entry (same as calling window.__pdfluent_dev_perf). */
  record(label: string, ms: number, page: number): void;
}

// ---------------------------------------------------------------------------
// Console helper — callable from devtools: window.__pdfluent_perf()
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__pdfluent_perf = () => {
    const events = getPerfEvents();
    if (events.length === 0) { console.log('[PDFluent perf] No events recorded yet.'); return; }
    const byLabel: Record<string, number[]> = {};
    for (const e of events) {
      const key = e.label;
      (byLabel[key] ??= []).push(e.durationMs);
    }
    const rows = Object.entries(byLabel).map(([label, ms]) => ({
      label,
      count: ms.length,
      avgMs: (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1),
      maxMs: Math.max(...ms).toFixed(1),
      minMs: Math.min(...ms).toFixed(1),
    }));
    console.table(rows);
  };

  (window as unknown as Record<string, unknown>).__pdfluent_dev_perf_data = _devPerfData;
  (window as unknown as Record<string, unknown>).__pdfluent_dev_perf = (label: string, ms: number, page: number) => {
    _devPerfData.push({ label, ms, page });
  };
  (window as unknown as Record<string, unknown>).__pdfluent_dev_perf_report = () => {
    const byLabel: Record<string, number[]> = {};
    for (const e of _devPerfData) { (byLabel[e.label] ??= []).push(e.ms); }
    console.table(Object.entries(byLabel).map(([label, ms]) => ({
      label, count: ms.length,
      avgMs: (ms.reduce((a,b)=>a+b,0)/ms.length).toFixed(1),
      maxMs: Math.max(...ms).toFixed(1),
    })));
  };

  // Rich namespace — primary devtools entry point
  const perfNs: PdfluetPerfNamespace = {
    summary() {
      console.group('[PDFluent PERF] Summary');

      // Sub-timer breakdown
      if (_devPerfData.length > 0) {
        const byLabel: Record<string, number[]> = {};
        for (const e of _devPerfData) { (byLabel[e.label] ??= []).push(e.ms); }
        const rows = Object.entries(byLabel).map(([label, ms]) => {
          const avg = ms.reduce((a,b)=>a+b,0) / ms.length;
          return {
            label,
            n: ms.length,
            'avg ms': avg.toFixed(1),
            'min ms': Math.min(...ms).toFixed(1),
            'max ms': Math.max(...ms).toFixed(1),
            'p95 ms': computePercentile(ms, 95).toFixed(1),
          };
        });
        console.log('Render sub-timers:');
        console.table(rows);
      } else {
        console.log('No sub-timer data — open a PDF and navigate pages first.');
      }

      // Long tasks
      if (_longTasks.length > 0) {
        console.log(`Long tasks (>50 ms): ${_longTasks.length}`);
        const longTaskRows = _longTasks.map(lt => ({
          'start ms': lt.startTime.toFixed(0),
          'duration ms': lt.durationMs.toFixed(1),
          attribution: lt.attribution ?? '(unknown)',
        }));
        console.table(longTaskRows);
      } else {
        console.log('No long tasks recorded (good!)');
      }

      // Render stats via __PDFLUENT_RENDER__ hook
      const renderHook = (window as unknown as Record<string, unknown>).__PDFLUENT_RENDER__;
      if (renderHook && typeof renderHook === 'object') {
        const w = renderHook as {
          state: string;
          workerRenderCount: number;
          nativeCommandRenderCount: number | null;
          mainThreadRenderCount: number;
          fallbackReasons: string[];
        };
        const total = w.workerRenderCount + w.mainThreadRenderCount;
        const workerPct = total > 0
          ? ((w.workerRenderCount / total) * 100).toFixed(1)
          : 'n/a';
        console.log(`Render: state=${w.state}`);
        console.log(`Renders: ${w.workerRenderCount} worker (${workerPct}%) | ${w.mainThreadRenderCount} main-thread fallback`);
        if (w.nativeCommandRenderCount !== null) {
          console.log(`Native command renders: ${w.nativeCommandRenderCount}`);
        }
        if (w.fallbackReasons.length > 0) {
          console.warn('Fallback reasons:', w.fallbackReasons);
        }
      }

      // Cache stats via __PDFLUENT_CACHE__ hook if available
      const cacheHook = (window as unknown as Record<string, unknown>).__pdfluent_cache_stats;
      if (typeof cacheHook === 'function') {
        const stats = (cacheHook as () => { hits: number; misses: number; entries: number })();
        const hitRate = stats.hits + stats.misses > 0
          ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
          : 'n/a';
        console.log(`Render cache: ${stats.entries} entries | ${stats.hits} hits | ${stats.misses} misses | ${hitRate}% hit rate`);
      }

      // Environment
      console.log(`DPR: ${window.devicePixelRatio.toFixed(2)} | viewport: ${window.innerWidth}×${window.innerHeight}`);
      console.groupEnd();
    },

    get data() { return _devPerfData as ReadonlyArray<{label: string; ms: number; page: number}>; },
    get longTasks() { return _longTasks as ReadonlyArray<{ startTime: number; durationMs: number; attribution?: string }>; },

    clear() {
      _devPerfData.length = 0;
      _longTasks.length = 0;
      console.log('[PDFluent PERF] Cleared.');
    },

    record(label: string, ms: number, page: number) {
      _devPerfData.push({ label, ms, page });
    },
  };

  (window as unknown as Record<string, unknown>).__PDFLUENT_PERF__ = perfNs;
}
