// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * One counter for the whole document is why editing one word on page 3 of a
 * 200-page file regenerated 200 thumbnails and re-rendered every mounted page.
 * These cases pin the property that removes that work: a page-scoped bump
 * leaves every other page's revision byte-identical, and a document-wide bump
 * still changes all of them.
 *
 * The interesting failure is the lazy fix — summing the counters, or comparing
 * the whole object — which looks right and quietly makes every page dirty
 * again. The last two cases are the ones that catch it.
 */

import { describe, it, expect } from 'vitest';
import {
  EMPTY_REVISION,
  bumpAll,
  bumpPages,
  pageRevision,
  changedPages,
} from '../src/viewer/state/documentRevision';

describe('document revision', () => {
  it('a page bump changes that page and nothing else', () => {
    const before = EMPTY_REVISION;
    const after = bumpPages(before, [3]);

    expect(pageRevision(after, 3)).not.toBe(pageRevision(before, 3));
    for (const page of [0, 1, 2, 4, 5, 199]) {
      expect(pageRevision(after, page)).toBe(pageRevision(before, page));
    }
    expect(after.all).toBe(before.all);
  });

  it('a document bump changes every page', () => {
    const before = bumpPages(EMPTY_REVISION, [3]);
    const after = bumpAll(before);
    for (const page of [0, 3, 4, 199]) {
      expect(pageRevision(after, page)).not.toBe(pageRevision(before, page));
    }
  });

  it('never lets a revision go backwards', () => {
    let revision = EMPTY_REVISION;
    const seen: number[] = [pageRevision(revision, 7)];
    for (let i = 0; i < 50; i++) {
      revision = i % 7 === 6 ? bumpAll(revision) : bumpPages(revision, [7]);
      seen.push(pageRevision(revision, 7));
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
    }
  });

  it('a page bump cannot reach the value a document bump would give it', () => {
    // The spacing between document revisions is what keeps the two counters
    // from colliding. Without it, enough edits on one page would eventually
    // produce the revision that page will have after the next reorder, and a
    // cached bitmap of the old content would be served as current.
    let revision = EMPTY_REVISION;
    for (let i = 0; i < 10_000; i++) revision = bumpPages(revision, [0]);
    expect(pageRevision(revision, 0)).toBeLessThan(pageRevision(bumpAll(EMPTY_REVISION), 0));
  });

  it('reports exactly which pages a caller must refresh', () => {
    const before = bumpPages(EMPTY_REVISION, [1, 2]);
    expect(changedPages(before, bumpPages(before, [2]))).toEqual(new Set([2]));
    // A document-wide bump means "no page can be trusted", which is not the
    // same answer as "these pages changed".
    expect(changedPages(before, bumpAll(before))).toBeNull();
  });

  it('treats a mutation that names no page as document-wide rather than as nothing', () => {
    const before = EMPTY_REVISION;
    const after = bumpPages(before, []);
    expect(changedPages(before, after)).toBeNull();
  });
});
