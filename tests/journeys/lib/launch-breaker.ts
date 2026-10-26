// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Stops the suite from spending its time on an app that does not start.
//
// The Windows job used to stop after ten red journeys (vitest `bail`). That
// protected the runner from a dead app, but it also ended the run at 16 of 63
// journeys as soon as five unrelated journeys failed on their own merits
// (vitest counts a failed journey twice), so 47 journeys were never tried.
// What a dead app looks like is different: the launch itself fails, journey
// after journey. So the suite counts launches that failed in a row and, past
// the limit, fails the remaining journeys at once with the reason. A journey
// that fails after the app started never counts, and one good launch resets
// the count.
//
// Each journey file runs in its own process, so the count lives in a file in
// the results folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Launches that may fail in a row before the rest of the suite stops trying. */
export const LAUNCH_FAILURES_BEFORE_STOP = 4;

const LEDGER = 'launch-ledger.json';

interface Ledger { consecutiveFailures: number; lastError: string }

function ledgerPath(dir: string): string {
  return path.join(dir, LEDGER);
}

function read(dir: string): Ledger {
  try {
    const raw = JSON.parse(readFileSync(ledgerPath(dir), 'utf8')) as Partial<Ledger>;
    return { consecutiveFailures: Number(raw.consecutiveFailures) || 0, lastError: String(raw.lastError ?? '') };
  } catch {
    return { consecutiveFailures: 0, lastError: '' };
  }
}

function write(dir: string, ledger: Ledger): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(ledgerPath(dir), `${JSON.stringify(ledger)}\n`);
}

/** Forget earlier launches: the start of a run. */
export function resetLaunchLedger(dir: string | undefined): void {
  if (dir) write(dir, { consecutiveFailures: 0, lastError: '' });
}

/** Note that a launch worked, or failed with `error`. */
export function recordLaunch(dir: string | undefined, error?: string): void {
  if (!dir) return;
  const now = read(dir);
  if (error === undefined) write(dir, { consecutiveFailures: 0, lastError: '' });
  else write(dir, { consecutiveFailures: now.consecutiveFailures + 1, lastError: error.slice(0, 500) });
}

/** Why the suite has stopped launching the app, or null while it may still try. */
export function launchesStopped(dir: string | undefined): string | null {
  if (!dir || !existsSync(ledgerPath(dir))) return null;
  const { consecutiveFailures, lastError } = read(dir);
  if (consecutiveFailures < LAUNCH_FAILURES_BEFORE_STOP) return null;
  return `the app failed to start ${consecutiveFailures} times in a row, so the rest of the suite does not try again ` +
    `(last error: ${lastError})`;
}
