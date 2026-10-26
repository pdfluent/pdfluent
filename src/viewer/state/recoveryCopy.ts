// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// The recovery copy, webview half (J-84). The backend half is
// src-tauri/src/recovery.rs.
//
// The Settings toggle has been there since the first release with nothing
// behind it. Now, while it is on and the document has unsaved changes, a
// recovery copy is written every RECOVERY_INTERVAL_MS. At the next start a copy
// left by a crash is offered; restoring opens it as unsaved work on the
// original file, so Save still goes where the user expects.
// ---------------------------------------------------------------------------

import type { InvokeFn } from './saveFlow';

export const RECOVERY_INTERVAL_MS = 30_000;

/** Mirrors recovery::RecoveryRecord. */
export interface RecoveryRecord {
  originalPath: string | null;
  /** Seconds since the Unix epoch. */
  savedAt: number;
  appVersion: string;
}

export interface RecoverySchedulerDeps {
  isEnabled: () => boolean;
  isDirty: () => boolean;
  /** Writes one copy; may reject (the failure is logged, the next tick retries). */
  write: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}

export interface Timers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const defaultTimers: Timers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => { globalThis.clearInterval(handle as ReturnType<typeof setInterval>); },
};

/**
 * Write a recovery copy on every tick while enabled and dirty, one at a time.
 * Returns the stop function.
 */
export function startRecoveryCopies(
  deps: RecoverySchedulerDeps,
  intervalMs = RECOVERY_INTERVAL_MS,
  timers: Timers = defaultTimers,
): () => void {
  let writing = false;
  const handle = timers.setInterval(() => {
    if (writing || !deps.isEnabled() || !deps.isDirty()) return;
    writing = true;
    deps.write()
      .catch((error: unknown) => { (deps.onError ?? ((e) => { console.warn('recovery copy failed', e); }))(error); })
      .finally(() => { writing = false; });
  }, intervalMs);
  return () => { timers.clearInterval(handle); };
}

/** A copy a previous launch left behind, and the slot it sits in (pending_recoveries). */
export interface PendingRecovery extends RecoveryRecord {
  slot: string;
}

export interface RestoreDeps {
  invoke: InvokeFn;
  /** Open a file through the app's ordinary open path; rejects on failure. */
  open: (path: string) => Promise<void>;
  /** The restored document is now unsaved work on `originalPath`. */
  onRestored: (originalPath: string | null) => void;
}

/**
 * Restore: copy the recovered document out of the slot, open it, mark it as
 * unsaved work on the original file, and empty the slot (it is copied).
 */
export async function restoreRecoveryCopy(record: RecoveryRecord & { slot?: string }, deps: RestoreDeps): Promise<void> {
  // With several documents unsaved there are several slots; name the one.
  const slotArgs = record.slot === undefined ? undefined : { slot: record.slot };
  const path = await deps.invoke<string>('restore_recovery', slotArgs);
  await deps.open(path);
  await deps.invoke('adopt_recovered_document', { originalPath: record.originalPath });
  deps.onRestored(record.originalPath);
  await deps.invoke('discard_recovery', slotArgs);
}
