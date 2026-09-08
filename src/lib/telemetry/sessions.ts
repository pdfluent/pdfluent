// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Crash-free sessions, on the opt-in path only.
//
// The backend counts start/clean-quit pairs in a local file and never sends
// them (src-tauri/src/session_log.rs). This module reads that count and turns
// it into ONE line of plain text, which is appended to the message of a crash
// or feedback report. That means the figure travels only when a person opens
// the review dialog, reads the exact text, and presses send — the same consent
// that governs the crash message itself, with nothing hidden in a field they
// cannot see.
//
// Deliberately not a new payload field: the server contract maps one-to-one
// onto the database schema, and a number the user cannot read in the dialog is
// telemetry by another name.
// ---------------------------------------------------------------------------

import { describeError, invokeCommand, logToApp } from '../commandBridge';
import { isTauriRuntime } from '../updater';

/** What the `session_reliability` command reports. */
export interface SessionReliability {
  /** Sessions that started and are no longer running. */
  finished: number;
  /** Of those, the ones that ended with a clean quit. */
  cleanQuits: number;
  /** `cleanQuits / finished` to one decimal; null until one session has ended. */
  crashFreePercent: number | null;
}

/** snake_case shape returned by the Tauri command (serde). */
interface RawSessionReliability {
  finished: number;
  clean_quits: number;
  crash_free_percent: number | null;
}

/**
 * Ask the backend for the local session counts. Returns null when there is no
 * backend (a browser, a test runner) or the command is unavailable: a crash
 * report must never fail because a statistic could not be read.
 */
export async function readSessionReliability(): Promise<SessionReliability | null> {
  // A browser or a test runner has no backend and no sessions to count. Asking
  // anyway would put "command session_reliability failed" on screen in the
  // browser-test build, which is a worse lie than the missing number.
  if (!isTauriRuntime()) return null;

  try {
    const raw = await invokeCommand<RawSessionReliability>('session_reliability');
    return {
      finished: raw.finished,
      cleanQuits: raw.clean_quits,
      crashFreePercent: raw.crash_free_percent,
    };
  } catch (error) {
    // The bridge has already told the user and written the log line. Swallowing
    // it here is about what happens NEXT: this is read while a crash report is
    // being assembled, and a report that cannot be sent because a statistic was
    // unavailable helps nobody. The line is logged and the report goes without it.
    void logToApp(`session reliability unavailable: ${describeError(error)}`);
    return null;
  }
}

/**
 * One line, or nothing. Nothing when no session has finished yet: a first run
 * has no history, and "0% crash-free" would be a false statement about a
 * product that has not crashed once.
 */
export function describeReliability(stats: SessionReliability | null): string | null {
  if (!stats || stats.finished === 0 || stats.crashFreePercent === null) return null;
  return (
    `sessions: ${stats.finished} finished, ${stats.cleanQuits} ended cleanly ` +
    `(${stats.crashFreePercent}% crash-free)`
  );
}

/**
 * Append the line to a report message. Idempotent, because the dialog builds a
 * preview and then builds the payload again on submit, and a person should not
 * read the same sentence twice in their own report.
 */
export function withReliabilityNote(
  message: string,
  stats: SessionReliability | null,
): string {
  const note = describeReliability(stats);
  if (!note) return message;
  if (message.includes(note)) return message;
  return `${message}\n\n${note}`;
}
