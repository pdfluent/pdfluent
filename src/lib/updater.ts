// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { check } from "@tauri-apps/plugin-updater";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateCheckResult {
  available: boolean;
  version: string | null;
}

export interface UpdateCallbacks {
  /** Called when an update is found. Return `true` to proceed with download. */
  onUpdateAvailable: (version: string) => Promise<boolean>;
  /** Called after the update has been downloaded and installed. */
  onUpdateInstalled: (version: string) => void;
  /** Called when the check or installation fails. */
  onError: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Core update logic
// ---------------------------------------------------------------------------

/**
 * Check whether an update is available without downloading it.
 *
 * Returns the version string when an update exists, or `null` when the app is
 * already up-to-date.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const update = await check();
  if (!update) {
    return { available: false, version: null };
  }

  const version = update.version;
  await update.close();
  return { available: true, version };
}

/**
 * Check for an update and, if the user confirms, download and install it.
 *
 * The caller supplies callbacks so the UI can decide how to present the
 * confirmation dialog and success/error messages.
 */
export async function checkAndInstallUpdate(
  callbacks: UpdateCallbacks,
): Promise<void> {
  try {
    const update = await check();
    if (!update) {
      return;
    }

    const shouldInstall = await callbacks.onUpdateAvailable(update.version);
    if (!shouldInstall) {
      await update.close();
      return;
    }

    await update.downloadAndInstall();
    callbacks.onUpdateInstalled(update.version);
    await update.close();
  } catch (err) {
    callbacks.onError(String(err));
  }
}

// ---------------------------------------------------------------------------
// Startup check
// ---------------------------------------------------------------------------

/** Delay in milliseconds before checking on startup (avoids blocking the UI). */
const STARTUP_CHECK_DELAY_MS = 5_000;

/**
 * Schedule a silent update check shortly after app startup.
 *
 * Unlike the manual check triggered from the toolbar, this only notifies the
 * user when an update *is* available — a "no update" result is silently
 * discarded.
 *
 * Returns a cleanup function that cancels the pending check (useful in React
 * `useEffect` teardown).
 */
export function scheduleStartupUpdateCheck(
  callbacks: UpdateCallbacks,
): () => void {
  const timer = setTimeout(() => {
    void checkAndInstallUpdate(callbacks);
  }, STARTUP_CHECK_DELAY_MS);

  return () => clearTimeout(timer);
}
