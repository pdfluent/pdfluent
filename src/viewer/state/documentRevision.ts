// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Which pages changed, not "something changed".
//
// The viewer had one counter. Editing one word on page 3 of a 200-page
// document bumped it, and everything downstream took that as "the document is
// different now": every thumbnail was revoked and regenerated from scratch
// (the flash people report), every mounted page canvas re-rendered because the
// counter is part of its bitmap cache key, and the ±5 page prefetch started
// over. Two hundred backend renders and two hundred thumbnail renders for one
// changed word, all of them competing with the repaint the user is waiting
// for.
//
// A revision here is a document-wide counter plus a per-page counter. A text
// commit bumps one page; page order, deletion, rotation, flatten, sign — the
// operations that really do change every page — bump the document. Consumers
// ask for `pageRevision(revision, i)`, which changes when either moved and
// never decreases, so a cache key built from it stays correct in both cases.
// ---------------------------------------------------------------------------

export interface DocumentRevision {
  /** Bumped by changes that affect the whole document. */
  readonly all: number;
  /** Per-page counters, for changes that affect one page. */
  readonly pages: ReadonlyMap<number, number>;
}

export const EMPTY_REVISION: DocumentRevision = { all: 0, pages: new Map() };

/** Spacing between document-wide revisions. Large enough that no realistic
 *  number of per-page edits can make one page's revision collide with the
 *  value it would have had at the next document-wide bump. */
const PAGE_SPACE = 1_000_000;

/** A change that affects every page: reorder, delete, append, rotate, flatten,
 *  sign, XFA commit. Per-page counters reset — they describe the old pages. */
export function bumpAll(revision: DocumentRevision): DocumentRevision {
  return { all: revision.all + 1, pages: new Map() };
}

/** A change confined to the named pages, such as a text commit. */
export function bumpPages(
  revision: DocumentRevision,
  pageIndices: Iterable<number>,
): DocumentRevision {
  const pages = new Map(revision.pages);
  let changed = false;
  for (const index of pageIndices) {
    if (!Number.isInteger(index) || index < 0) continue;
    pages.set(index, (pages.get(index) ?? 0) + 1);
    changed = true;
  }
  // A commit that names no page is a document-wide change that forgot to say
  // so. Treating it as "nothing changed" would leave stale pixels on screen.
  if (!changed) return bumpAll(revision);
  return { all: revision.all, pages };
}

/** The number a page's render cache and effects key on. Monotone per page. */
export function pageRevision(revision: DocumentRevision, pageIndex: number): number {
  return revision.all * PAGE_SPACE + (revision.pages.get(pageIndex) ?? 0);
}

/** The pages whose revision differs between two states. `null` means "every
 *  page": the document-wide counter moved and no page can be trusted. */
export function changedPages(
  before: DocumentRevision,
  after: DocumentRevision,
): ReadonlySet<number> | null {
  if (before.all !== after.all) return null;
  const changed = new Set<number>();
  for (const [index, value] of after.pages) {
    if (before.pages.get(index) !== value) changed.add(index);
  }
  for (const index of before.pages.keys()) {
    if (!after.pages.has(index)) changed.add(index);
  }
  return changed;
}
