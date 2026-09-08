// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// The frontend half of the startup and edit timeline.
//
// Two budgets in the plan were written as if they had been measured, and
// neither had been: "open a 200-page PDF" was timed against the backend line
// "document parsed OK" — which happens before a single pixel is drawn — and
// "keystroke → repaint" was never instrumented at all. Both end events live
// here, in the webview, so this is where they are recorded.
//
// Every mark goes two places: `performance.mark`, so devtools and a Playwright
// spec can read it, and the Rust `perf_mark` command, so it lands in the same
// durable log as the backend marks on the same clock. A support bundle from a
// slow machine then carries the whole timeline, not half of it.
//
// Naming note: the ticket says "keystroke → repaint". No keystroke reaches
// Rust — the overlay is a contentEditable and the document is only mutated on
// Enter or blur. The expensive event is that commit, so `commit_start` is the
// commit, not the keypress. Nothing here should ever be reported as typing
// latency.
// ---------------------------------------------------------------------------

import { invokeCommand } from '../../lib/commandBridge';
import { isTauriRuntime } from '../../lib/tauri-detection';
import { recordPerfEvent } from './performanceTelemetry';

/** The marks this module knows. Adding one here is what makes it readable in
 *  `scripts/perf/measure-open.sh`, which lists the timeline in this order. */
export type PerfMarkName =
  | 'load_start'
  | 'doc_ready'
  | 'first_paint'
  | 'engine_ready'
  | 'commit_start'
  | 'mutation_ack'
  | 'repaint_done';

const PREFIX = 'pdfluent:';

export interface PerfMarkEntry {
  readonly name: PerfMarkName | string;
  /** Milliseconds since the page's time origin. */
  readonly t: number;
}

/**
 * Record one mark. Safe to call in a non-browser test environment and outside
 * Tauri; both are no-ops rather than throws.
 */
export function perfMark(name: PerfMarkName, detail?: Record<string, unknown>): void {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    try {
      performance.mark(`${PREFIX}${name}`, detail ? { detail } : undefined);
    } catch (error) {
      // A mark is diagnostics. It must never be the reason an edit fails.
      console.warn('[perf] performance.mark refused', name, error);
    }
  }
  if (!isTauriRuntime()) return;
  const suffix = detail
    ? Object.entries(detail)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ')
    : undefined;
  void invokeCommand('perf_mark', { name, detail: suffix }).catch(error => {
    console.warn('[perf] mark not recorded in the app log', name, error);
  });
}

/** Duration between two recorded marks, or null when either is missing. */
export function perfMeasure(name: string, start: PerfMarkName, end: PerfMarkName): number | null {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return null;
  try {
    const measure = performance.measure(`${PREFIX}${name}`, `${PREFIX}${start}`, `${PREFIX}${end}`);
    return measure.duration;
  } catch (error) {
    // Missing start or end mark: the sequence did not happen, which is a real
    // answer ("no first paint") and not something to invent a number for.
    console.warn('[perf] measure skipped', name, error);
    return null;
  }
}

/** Every mark this module recorded, oldest first. */
export function readPerfMarks(): PerfMarkEntry[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return [];
  }
  return performance
    .getEntriesByType('mark')
    .filter(entry => entry.name.startsWith(PREFIX))
    .map(entry => ({ name: entry.name.slice(PREFIX.length), t: entry.startTime }))
    .sort((a, b) => a.t - b.t);
}

/** Drop every mark this module recorded. Used between runs in the perf spec. */
export function clearPerfMarks(): void {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
  for (const entry of performance.getEntriesByType('mark')) {
    if (entry.name.startsWith(PREFIX) && typeof performance.clearMarks === 'function') {
      performance.clearMarks(entry.name);
    }
  }
}

// ---------------------------------------------------------------------------
// first_paint / repaint_done handshake
//
// Both end events are "a canvas actually showed these pixels", and the code
// that draws (`useRenderedCanvas`) knows nothing about why it is drawing. So
// the intent is parked here — set by the loader and by the commit — and the
// renderer consumes it. Module state rather than props: the alternative was
// threading a callback through three component layers for a diagnostic.
// ---------------------------------------------------------------------------

const FIRST_PAINT_SEEN = new Set<string>();

/** A repaint a commit is waiting for. `armed` turns true when the backend has
 *  acknowledged the mutation: before that, any paint of the page is the old
 *  content and counting it would report a repaint that never showed the edit. */
interface PendingRepaint {
  readonly pageIndex: number;
  armed: boolean;
}

let pendingRepaint: PendingRepaint | null = null;

/**
 * Run `fn` after the frame that actually put the pixels on screen. A single
 * rAF fires before that frame is composited, so the mark would be early by a
 * frame; two is the documented trick and the error is then bounded by one
 * frame instead of open-ended.
 */
function afterNextPaint(fn: () => void): void {
  if (typeof requestAnimationFrame !== 'function') { fn(); return; }
  requestAnimationFrame(() => { requestAnimationFrame(fn); });
}

/**
 * Called by the renderer after every successful draw. Emits `first_paint` once
 * per loaded document, and `repaint_done` for the first draw of the edited page
 * after its mutation was acknowledged.
 */
export function notifyCanvasPainted(documentId: string, pageIndex: number): void {
  if (!FIRST_PAINT_SEEN.has(documentId)) {
    FIRST_PAINT_SEEN.add(documentId);
    for (const waiter of FIRST_PAINT_WAITERS.get(documentId) ?? []) waiter();
    FIRST_PAINT_WAITERS.delete(documentId);
    afterNextPaint(() => {
      perfMark('first_paint', { pageIndex });
      const ms = perfMeasure('open', 'load_start', 'first_paint');
      if (ms !== null) {
        recordPerfEvent({ category: 'document-open', label: 'load_start→first_paint', durationMs: ms, pageIndex });
      }
    });
  }
  const pending = pendingRepaint;
  if (pending && pending.armed && pending.pageIndex === pageIndex) {
    pendingRepaint = null;
    afterNextPaint(() => {
      perfMark('repaint_done', { pageIndex });
      const ms = perfMeasure('commit', 'commit_start', 'repaint_done');
      if (ms !== null) {
        recordPerfEvent({ category: 'text-edit-commit', label: 'commit_start→repaint_done', durationMs: ms, pageIndex });
      }
    });
  }
}

/** Called by the commit before it mutates, so the repaint that follows can be
 *  recognised as the one it caused. */
export function beginCommit(pageIndex: number): void {
  pendingRepaint = { pageIndex, armed: false };
  perfMark('commit_start', { pageIndex });
}

/** The backend acknowledged the mutation; from here the next paint of that page
 *  is the repaint the budget is about. */
export function noteMutationAck(pageIndex: number): void {
  perfMark('mutation_ack', { pageIndex });
  if (pendingRepaint && pendingRepaint.pageIndex === pageIndex) {
    pendingRepaint.armed = true;
  }
}

/**
 * A commit that mutated nothing, or threw, gets no repaint. Drop the intent so
 * a later unrelated render of that page is not reported as its repaint. An
 * armed intent is kept: there the mutation did land and its repaint is still
 * on its way.
 */
export function abandonCommitIfUnarmed(): void {
  if (pendingRepaint && !pendingRepaint.armed) pendingRepaint = null;
}

/** True while a commit is waiting for its repaint. Test seam. */
export function hasPendingRepaint(): boolean {
  return pendingRepaint !== null;
}

/** True once the mutation behind a pending repaint was acknowledged. Test seam. */
export function hasArmedRepaint(): boolean {
  return pendingRepaint?.armed === true;
}

/** True once a page of this document has actually been painted. */
export function hasPainted(documentId: string): boolean {
  return FIRST_PAINT_SEEN.has(documentId);
}

const FIRST_PAINT_WAITERS = new Map<string, Array<() => void>>();

/**
 * Resolve once the document has put a page on screen, or after `timeoutMs`.
 *
 * Work that is not needed for the first page — the scanned-page probe walks
 * every page of the document — used to start in the same React commit as the
 * first render and compete with it for the backend. Waiting here is what turns
 * that into work that happens after the user can see something.
 *
 * The timeout is not a formality: a document whose first page fails to render
 * must not silently lose the probe as well.
 */
export function whenFirstPainted(documentId: string, timeoutMs = 5000): Promise<void> {
  if (FIRST_PAINT_SEEN.has(documentId)) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = (): void => { if (!done) { done = true; resolve(); } };
    const waiters = FIRST_PAINT_WAITERS.get(documentId) ?? [];
    waiters.push(finish);
    FIRST_PAINT_WAITERS.set(documentId, waiters);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Run `fn` when the main thread is next idle. Used to spread page-by-page work
 * that nobody is waiting for over the gaps between renders instead of into one
 * burst.
 */
export function runWhenIdle(fn: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') { idle(fn, { timeout: 2000 }); return; }
  setTimeout(fn, 0);
}

/** Forget which documents have painted. Test seam only. */
export function resetPerfMarkState(): void {
  FIRST_PAINT_SEEN.clear();
  FIRST_PAINT_WAITERS.clear();
  pendingRepaint = null;
}
