// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Autosave Manager
//
// Logic for determining when a background save should fire and how to derive
// the recovery-file path.  Actual Tauri invoke calls live in ViewerApp so
// this module stays testable without a Tauri environment.
// ---------------------------------------------------------------------------

export interface AutosaveConfig {
  /** Master on/off switch — mirrors AppSettings.autosaveEnabled. */
  enabled: boolean;
  /** Minimum number of milliseconds the document must have been dirty before autosave fires. */
  dirtyDebounceMs: number;
  /** Minimum number of milliseconds of user inactivity before autosave fires. */
  inactivityMs: number;
}

export const DEFAULT_AUTOSAVE_CONFIG: AutosaveConfig = {
  enabled: true,
  dirtyDebounceMs: 30_000,  // 30 seconds
  inactivityMs: 10_000,      // 10 seconds
};

export interface AutosaveState {
  /** Wall-clock time of the last successful autosave, or null if none has occurred. */
  lastSavedAt: Date | null;
  /** Full path of the most recent autosave recovery file, or null if none exists. */
  pendingRecoveryPath: string | null;
  /** True while an autosave write is in progress. */
  isWriting: boolean;
}

export const INITIAL_AUTOSAVE_STATE: AutosaveState = {
  lastSavedAt: null,
  pendingRecoveryPath: null,
  isWriting: false,
};

/**
 * Derive the autosave recovery-file path from the original document path.
 * The suffix `.autosave.pdf` is appended after stripping any trailing `.pdf`.
 *
 * Example: `/home/user/report.pdf` → `/home/user/report.autosave.pdf`
 */
export function makeRecoveryPath(originalPath: string): string {
  const base = originalPath.replace(/\.pdf$/i, '');
  return `${base}.autosave.pdf`;
}

/**
 * Derive the autosave key used to store recovery metadata in localStorage.
 * Stable across sessions so recovery detection works after a crash.
 */
export function makeAutosaveStorageKey(originalPath: string): string {
  return `pdfluent.autosave.${originalPath}`;
}

/**
 * Return true when autosave should trigger given the current document and
 * activity state.  All three conditions must hold:
 *   1. autosave is enabled
 *   2. the document is dirty (unsaved changes exist)
 *   3. either the dirty duration exceeds dirtyDebounceMs OR the user has
 *      been inactive for at least inactivityMs
 */
export function shouldTriggerAutosave(
  isDirty: boolean,
  lastActivityMs: number,
  dirtyDurationMs: number,
  config: AutosaveConfig,
): boolean {
  if (!config.enabled) return false;
  if (!isDirty) return false;
  return dirtyDurationMs > config.dirtyDebounceMs || lastActivityMs > config.inactivityMs;
}

/**
 * Persist a recovery record to localStorage so it survives a crash.
 * Called by ViewerApp after each successful autosave write.
 */
export function persistRecoveryRecord(originalPath: string, recoveryPath: string, timestamp: Date): void {
  try {
    const key = makeAutosaveStorageKey(originalPath);
    localStorage.setItem(key, JSON.stringify({
      recoveryPath,
      timestamp: timestamp.toISOString(),
      originalPath,
    }));
  } catch { /* ignore write errors */ }
}

/**
 * Read a recovery record from localStorage.
 * Returns null when no record exists or when parsing fails.
 */
export function readRecoveryRecord(originalPath: string): { recoveryPath: string; timestamp: string; originalPath: string } | null {
  try {
    const key = makeAutosaveStorageKey(originalPath);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as { recoveryPath: string; timestamp: string; originalPath: string };
  } catch {
    return null;
  }
}

/**
 * Remove a recovery record from localStorage after successful recovery or discard.
 */
export function clearRecoveryRecord(originalPath: string): void {
  try {
    localStorage.removeItem(makeAutosaveStorageKey(originalPath));
  } catch { /* ignore */ }
}
