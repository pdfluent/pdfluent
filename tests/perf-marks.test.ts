// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The open and edit budgets in the plan (§3) are end-to-end: process start to
 * the first painted page, and commit to the repainted page. Both end events
 * live in the webview, and both were measured by nobody — "open a 200-page
 * PDF" was timed against a backend log line that happens before any pixel is
 * drawn.
 *
 * These cases pin the handshake that produces those two events. They go red on
 * the three ways it can quietly stop working: a repaint that is reported before
 * the mutation was acknowledged (so the number describes a paint of the old
 * content), a repaint attributed to a commit that changed nothing, and a
 * `first_paint` emitted a second time for the same document (which would make
 * every reopen look instant).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  perfMark,
  perfMeasure,
  readPerfMarks,
  clearPerfMarks,
  notifyCanvasPainted,
  beginCommit,
  noteMutationAck,
  abandonCommitIfUnarmed,
  hasPendingRepaint,
  hasArmedRepaint,
  resetPerfMarkState,
  whenFirstPainted,
} from '../src/viewer/performance/perfMarks';
import { clearPerfTelemetry, getPerfEvents } from '../src/viewer/performance/performanceTelemetry';

const names = (): string[] => readPerfMarks().map(entry => entry.name);

describe('perf marks', () => {
  beforeEach(() => {
    clearPerfMarks();
    resetPerfMarkState();
    clearPerfTelemetry();
  });

  it('records marks under one prefix and reads them back in order', () => {
    perfMark('load_start');
    perfMark('doc_ready');
    expect(names()).toEqual(['load_start', 'doc_ready']);
  });

  it('measures between two marks and returns null when one is missing', () => {
    perfMark('load_start');
    perfMark('doc_ready');
    expect(perfMeasure('open', 'load_start', 'doc_ready')).not.toBeNull();
    expect(perfMeasure('bogus', 'load_start', 'repaint_done')).toBeNull();
  });

  it('emits first_paint once per document, not once per painted page', () => {
    notifyCanvasPainted('doc_1', 0);
    notifyCanvasPainted('doc_1', 1);
    notifyCanvasPainted('doc_1', 2);
    expect(names().filter(n => n === 'first_paint')).toHaveLength(1);

    notifyCanvasPainted('doc_2', 0);
    expect(names().filter(n => n === 'first_paint')).toHaveLength(2);
  });

  it('does not call a paint before the mutation was acknowledged a repaint', () => {
    perfMark('load_start');
    notifyCanvasPainted('doc_1', 3); // first paint of the document

    beginCommit(3);
    expect(hasPendingRepaint()).toBe(true);
    expect(hasArmedRepaint()).toBe(false);

    // A render that was already in flight when the commit started. It shows
    // the text as it was, so it is not the repaint the budget is about.
    notifyCanvasPainted('doc_1', 3);
    expect(names()).not.toContain('repaint_done');

    noteMutationAck(3);
    notifyCanvasPainted('doc_1', 3);
    expect(names()).toContain('repaint_done');
  });

  it('attributes the repaint to the edited page only', () => {
    notifyCanvasPainted('doc_1', 0);
    beginCommit(4);
    noteMutationAck(4);

    notifyCanvasPainted('doc_1', 5);
    expect(names()).not.toContain('repaint_done');

    notifyCanvasPainted('doc_1', 4);
    expect(names()).toContain('repaint_done');
  });

  it('drops the intent when the commit changed nothing, and keeps it when it did', () => {
    beginCommit(1);
    abandonCommitIfUnarmed();
    expect(hasPendingRepaint()).toBe(false);

    beginCommit(1);
    noteMutationAck(1);
    abandonCommitIfUnarmed(); // runs in the commit's finally block
    expect(hasArmedRepaint()).toBe(true);
  });

  it('files the two end-to-end durations in the telemetry ring buffer', () => {
    perfMark('load_start');
    notifyCanvasPainted('doc_1', 0);

    beginCommit(0);
    noteMutationAck(0);
    notifyCanvasPainted('doc_1', 0);

    const labels = getPerfEvents().map(event => event.label);
    expect(labels).toContain('load_start→first_paint');
    expect(labels).toContain('commit_start→repaint_done');
  });
});

describe('work that waits for the first paint', () => {
  beforeEach(() => {
    clearPerfMarks();
    resetPerfMarkState();
  });

  it('does not resolve before a page of that document has been painted', async () => {
    let resolved = false;
    const waiting = whenFirstPainted('doc_1', 10_000).then(() => { resolved = true; });

    await new Promise(resolve => setTimeout(resolve, 5));
    expect(resolved).toBe(false);

    notifyCanvasPainted('doc_1', 0);
    await waiting;
    expect(resolved).toBe(true);
  });

  it('resolves immediately when the document has already painted', async () => {
    notifyCanvasPainted('doc_1', 0);
    await expect(whenFirstPainted('doc_1', 10_000)).resolves.toBeUndefined();
  });

  it('gives up after the timeout, so a page that never paints does not cancel the work', async () => {
    // A first page that fails to render must not also silently lose the
    // scanned-page probe behind it — that would turn a render bug into a
    // missing feature nobody can see.
    await expect(whenFirstPainted('never_paints', 20)).resolves.toBeUndefined();
  });

  it('a paint of one document does not release work waiting on another', async () => {
    let resolved = false;
    void whenFirstPainted('doc_2', 10_000).then(() => { resolved = true; });
    notifyCanvasPainted('doc_1', 0);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(resolved).toBe(false);
  });
});
