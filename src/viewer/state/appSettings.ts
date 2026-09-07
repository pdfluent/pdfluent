// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Application Settings
//
// Persistent application-level preferences.  Settings are written to and read
// from localStorage (keyed by SETTINGS_STORAGE_KEY).  A Tauri-store-backed
// alternative can be layered on top without changing the public API.
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'markdown' | 'html';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppSettings {
  /** Default reviewer / author name pre-filled in annotation dialogs. */
  defaultReviewerName: string;
  /** Preferred format when exporting review summaries or audit reports. */
  defaultExportFormat: ExportFormat;
  /** Whether autosave is active for this user. */
  autosaveEnabled: boolean;
  /** UI colour-scheme preference. */
  themePreference: ThemePreference;
  /** Default ISO-639-2/T language code used when starting OCR (e.g. "nld"). */
  ocrDefaultLanguage: string;
  /**
   * Whether the app checks for a newer version shortly after start. Default
   * ON. Turning it off stops the automatic check only — the manual
   * "Check for updates" command keeps working, so the user can still ask.
   * Read once, at startup: that is when the check would run.
   */
  automaticUpdateCheckEnabled: boolean;
  /**
   * Telemetry consent (opt-in, default OFF). When false the app never sends a
   * crash or feedback report — it works 100% offline regardless. See the
   * crash-reporting plan §1.
   */
  crashReportingEnabled: boolean;
  /**
   * Send future reports without showing the review dialog. Only meaningful
   * when crashReportingEnabled is true; itself opt-in and reversible here.
   */
  crashReportAutoSend: boolean;
  /**
   * Whether we've already asked for consent once, so we don't nag on every
   * crash. Set the first time the review dialog is shown.
   */
  crashReportConsentAsked: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultReviewerName: '',
  defaultExportFormat: 'markdown',
  autosaveEnabled: true,
  themePreference: 'system',
  ocrDefaultLanguage: 'nld',
  automaticUpdateCheckEnabled: true,
  crashReportingEnabled: false,
  crashReportAutoSend: false,
  crashReportConsentAsked: false,
};

/** localStorage key under which settings are persisted. */
export const SETTINGS_STORAGE_KEY = 'pdfluent.app.settings';

/**
 * Load settings from localStorage, merging with defaults so that any newly
 * introduced settings keys are always present even for existing users.
 *
 * The merge order matters on upgrade: a stored blob written by an older
 * version has no key for a setting added later, so the default fills in and
 * the setting does not silently flip to `false`. A stored `false` still wins
 * over a `true` default, because the spread of `parsed` comes last.
 */
export function loadAppSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * Persist settings to localStorage.
 * Silently swallows write errors (e.g. private-browsing quota).
 */
export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore write errors */ }
}

/**
 * Return a new settings object with a single key updated, and persist it.
 * Convenience wrapper so callers never need to spread manually.
 */
export function updateAppSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): AppSettings {
  const current = loadAppSettings();
  const next: AppSettings = { ...current, [key]: value };
  saveAppSettings(next);
  return next;
}

/**
 * Reset all settings to factory defaults and persist.
 */
export function resetAppSettings(): AppSettings {
  const defaults = { ...DEFAULT_APP_SETTINGS };
  saveAppSettings(defaults);
  return defaults;
}
