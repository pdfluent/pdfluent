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

import { DEFAULT_ZOOM, isDefaultZoom, type DefaultZoom } from '../zoom/fitZoom';

export type ExportFormat = 'json' | 'markdown' | 'html';
export type ThemePreference = 'light' | 'dark' | 'system';
/** Whether a form's own scripts may run: ask each time, always, or never. */
export type FormScriptsMode = 'ask' | 'always' | 'never';

export interface AppSettings {
  /** Default reviewer / author name pre-filled in annotation dialogs. */
  defaultReviewerName: string;
  /** Preferred format when exporting review summaries or audit reports. */
  defaultExportFormat: ExportFormat;
  /** Whether autosave is active for this user. */
  autosaveEnabled: boolean;
  /** UI colour-scheme preference. */
  themePreference: ThemePreference;
  /**
   * The zoom a document opens at (Settings > View). "Last used" is the zoom the
   * reader last set by hand; the other three follow the window. Applies until
   * the reader zooms that document by hand.
   */
  defaultZoom: DefaultZoom;
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
  /**
   * Form scripts (XFA JavaScript / FormCalc, AcroForm calculate / format /
   * validate actions) run only with the user's permission. 'ask' is the
   * default: the form opens with its stored values and a bar asks. 'always'
   * is the stored "Always run scripts" choice; 'never' blocks them without
   * asking. See scriptConsent.ts.
   */
  formScriptsMode: FormScriptsMode;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultReviewerName: '',
  defaultExportFormat: 'markdown',
  autosaveEnabled: true,
  themePreference: 'system',
  defaultZoom: DEFAULT_ZOOM,
  ocrDefaultLanguage: 'nld',
  automaticUpdateCheckEnabled: true,
  crashReportingEnabled: false,
  crashReportAutoSend: false,
  crashReportConsentAsked: false,
  formScriptsMode: 'ask',
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
    const merged = { ...DEFAULT_APP_SETTINGS, ...parsed };
    // A stored value this version does not know (hand-edited, or from a newer
    // build) must not reach the zoom code.
    if (!isDefaultZoom(merged.defaultZoom)) merged.defaultZoom = DEFAULT_ZOOM;

    // A hand-edited or future value falls back to the safe default: ask.
    if (!['ask', 'always', 'never'].includes(merged.formScriptsMode)) {
      merged.formScriptsMode = 'ask';
    }
    return merged;
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
