// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * How much work the open path and a text commit start, counted rather than
 * timed.
 *
 * A millisecond budget on a shared runner is a coin flip; the amount of work
 * is not. These cases pin the three decisions that took the work out of the
 * critical path, in the source that makes them:
 *
 *   1. the scanned-page probe (one backend call per page — 209 on a 209-page
 *      document) waits for the first paint instead of racing it;
 *   2. get_page_text_spans, the command that probe calls, is async, so those
 *      calls are not run on the Tauri main thread that also delivers the
 *      render reply the user is waiting for;
 *   3. a text commit names the page it changed, so the thumbnail strip and the
 *      page canvases refresh one page instead of all of them.
 *
 * Each of the three regressed silently before: nothing on screen looks
 * different when work moves back onto the critical path, it is just slower.
 *
 * These are wiring assertions, deliberately. The logic behind each decision is
 * tested for real elsewhere — `whenFirstPainted` in tests/perf-marks.test.ts,
 * `changedPages`/`pageRevision` in tests/document-revision.test.ts — and this
 * file only answers the question those cases cannot: is it actually called.
 * The repository has no DOM test environment, so rendering the hooks is not
 * available here; when one is added these should become render assertions with
 * a counting engine.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('open path work', () => {
  it('holds the scanned-page probe until the first page is painted', () => {
    const source = read('src/viewer/hooks/useAnnotations.ts');
    expect(source).toContain('await whenFirstPainted(pdfDoc.id)');
    // Each batch yields to idle time, so the walk cannot become one burst
    // that blocks the renders behind it.
    expect(source).toContain('runWhenIdle');
    // And it stops when the document is replaced, rather than probing pages of
    // a document nobody is looking at any more.
    expect(source).toContain('probeCancelled');
  });

  it('serves page text spans off the main thread', () => {
    const source = read('src-tauri/src/lib.rs');
    expect(source).toMatch(/async fn get_page_text_spans\(/);
  });

  it('lets a text commit name the page it changed', () => {
    const hook = read('src/viewer/hooks/useTextInteraction.ts');
    expect(hook).toContain('onDocumentMutated?.([pageIndex])');

    const app = read('src/viewer/ViewerApp.tsx');
    // The page-scoped path must actually be taken; a handler that always
    // bumps the document would keep the old behaviour while reading as fixed.
    expect(app).toContain('pages && pages.length > 0 ? bumpPages(r, pages) : bumpAll(r)');
    // And the render key must be the page's own revision, not the document's.
    expect(app).toContain('renderRevision={pageRevision(revision, i)}');
  });

  it('refreshes only the changed thumbnails', () => {
    const source = read('src/viewer/hooks/useThumbnails.ts');
    // The full regeneration is keyed on the document-wide counter only.
    expect(source).toContain('[engine, document, effectiveCount, revision.all]');
    // A page-scoped change goes through changedPages, and only the URLs it
    // names are revoked — revoking the rest is what made the strip flash.
    expect(source).toContain('const changed = changedPages(previous, revision);');
    expect(source).toContain('if (stale) URL.revokeObjectURL(stale);');
  });
});
