// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { check } from "@tauri-apps/plugin-updater";
import { loadAppSettings } from "../viewer/state/appSettings";

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

/**
 * Schedule the automatic startup check, unless the user turned it off.
 *
 * Returns `undefined` when the setting is off — nothing was scheduled, so
 * there is nothing to cancel. This is the only gate on the automatic check;
 * the manual "Check for updates" command calls `checkAndInstallUpdate`
 * directly and is deliberately not affected by the setting.
 *
 * The setting is read here rather than passed in so that every caller gets
 * the same answer, and so a caller cannot schedule the check by forgetting
 * to look.
 */
export function scheduleStartupUpdateCheckIfEnabled(
  callbacks: UpdateCallbacks,
): (() => void) | undefined {
  if (!loadAppSettings().automaticUpdateCheckEnabled) return undefined;
  return scheduleStartupUpdateCheck(callbacks);
}

// ---------------------------------------------------------------------------
// Restart / relaunch (finishing an installed update)
// ---------------------------------------------------------------------------

/** True only inside the Tauri desktop runtime (false in a browser / vitest). */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Relaunch the app to finish applying an installed update. No-op outside the
 * Tauri runtime (browser/tests). Throws if the process-plugin relaunch fails so
 * the caller can fall back to manual-restart instructions.
 */
export async function relaunchApp(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
