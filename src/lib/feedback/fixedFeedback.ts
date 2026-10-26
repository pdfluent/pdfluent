// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// "Your report is fixed", without e-mail and without a single extra request.
//
// The update feed (latest.json) that the update check downloads anyway carries
// `fixed_feedback`: the report IDs whose issues closed with `fixed-in:<this
// version>` (scripts/release/fixed-feedback.mjs). Everybody downloads the same
// list; only this machine knows which of those IDs it sent. IDs are 40 random
// bits, so the list says nothing about who reported what.
//
// Two moments:
//   - an update is offered: "this update fixes your report FB-…";
//   - after updating, on the first start of the new version: the same notice,
//     once, as thanks. The match is remembered at offer time because a check
//     on the newest version returns no feed to read.

import { markFixedNoticeShown, readLocalReports, type KeyValueStore } from './localReports';

export const FEEDBACK_ID_RE = /^FB-[0-9A-HJKMNP-TV-Z]{8}$/;
export const PENDING_FIXED_KEY = 'pdfluent.feedback.fixed-pending';

/** The valid IDs in a feed's `fixed_feedback`, or [] when the field is missing or malformed. */
export function fixedFeedbackFromFeed(rawJson: unknown): string[] {
  if (!rawJson || typeof rawJson !== 'object') return [];
  const list = (rawJson as { fixed_feedback?: unknown }).fixed_feedback;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x): x is string => typeof x === 'string' && FEEDBACK_ID_RE.test(x)))];
}

/** IDs this installation sent that the feed says are fixed, not yet announced for that version. */
export function myFixedReports(rawJson: unknown, version: string, store?: KeyValueStore | null): string[] {
  const fixed = new Set(fixedFeedbackFromFeed(rawJson));
  if (fixed.size === 0) return [];
  return readLocalReports(store)
    .filter((r) => fixed.has(r.id) && r.fixedNoticeShownFor !== version)
    .map((r) => r.id);
}

export interface PendingFixed {
  version: string;
  ids: string[];
}

function storeOrNull(store?: KeyValueStore | null): KeyValueStore | null {
  if (store !== undefined) return store;
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    return null;
  }
}

/** Remember, at offer time, what to say after the update installed. */
export function rememberPendingFixed(pending: PendingFixed, store?: KeyValueStore | null): void {
  const s = storeOrNull(store);
  if (!s || pending.ids.length === 0) return;
  try {
    s.setItem(PENDING_FIXED_KEY, JSON.stringify(pending));
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    /* the offer-time notice was still shown */
  }
}

/** Compare dotted numeric versions; non-numeric parts compare as 0. */
export function versionAtLeast(current: string, wanted: string): boolean {
  const a = current.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const b = wanted.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/**
 * On start: the fixed reports to thank for, once, if this version is the one
 * (or newer than the one) that fixed them. Consumes the pending record.
 */
export function takeFixedNoticeForStart(currentVersion: string, store?: KeyValueStore | null): PendingFixed | null {
  const s = storeOrNull(store);
  if (!s) return null;
  let pending: PendingFixed | null = null;
  try {
    const raw = s.getItem(PENDING_FIXED_KEY);
    pending = raw ? (JSON.parse(raw) as PendingFixed) : null;
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    pending = null;
  }
  if (!pending || !Array.isArray(pending.ids) || typeof pending.version !== 'string') return null;
  if (!versionAtLeast(currentVersion, pending.version)) return null;
  try {
    s.setItem(PENDING_FIXED_KEY, '');
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    /* shown at most once more */
  }
  markFixedNoticeShown(pending.ids, pending.version, s);
  return pending;
}
