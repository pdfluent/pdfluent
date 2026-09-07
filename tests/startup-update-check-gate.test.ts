// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The automatic update check must be switchable off, because LICENSE.md §4
// says it is. This test asserts BOTH directions: nothing is scheduled when the
// setting is off, and something is when it is on. Asserting only the off case
// would pass on code that never schedules anything at all.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { checkMock } = vi.hoisted(() => ({ checkMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(), exit: vi.fn() }));

import {
  scheduleStartupUpdateCheckIfEnabled,
  checkAndInstallUpdate,
} from '../src/lib/updater';
import {
  DEFAULT_APP_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadAppSettings,
} from '../src/viewer/state/appSettings';

const noopCallbacks = {
  onUpdateAvailable: async () => false,
  onUpdateInstalled: () => { /* not asserted here */ },
  onError: () => { /* not asserted here */ },
};

/** Minimal localStorage stand-in — appSettings reads the bare global. */
function installStorage(stored: string | null): void {
  const map = new Map<string, string>();
  if (stored !== null) map.set(SETTINGS_STORAGE_KEY, stored);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  checkMock.mockReset();
  checkMock.mockResolvedValue(null); // "already up to date"
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('automatic startup update check — the setting decides', () => {
  it('schedules nothing when automaticUpdateCheckEnabled is false', async () => {
    installStorage(JSON.stringify({ automaticUpdateCheckEnabled: false }));

    const cancel = scheduleStartupUpdateCheckIfEnabled(noopCallbacks);

    expect(cancel).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('schedules the check when automaticUpdateCheckEnabled is true', async () => {
    installStorage(JSON.stringify({ automaticUpdateCheckEnabled: true }));

    const cancel = scheduleStartupUpdateCheckIfEnabled(noopCallbacks);

    expect(typeof cancel).toBe('function');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(checkMock).toHaveBeenCalledTimes(1);
    cancel?.();
  });

  it('the returned cleanup cancels a pending check', async () => {
    installStorage(JSON.stringify({ automaticUpdateCheckEnabled: true }));

    const cancel = scheduleStartupUpdateCheckIfEnabled(noopCallbacks);
    cancel?.();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('does not gate the manual check — that stays available when the setting is off', async () => {
    installStorage(JSON.stringify({ automaticUpdateCheckEnabled: false }));

    await checkAndInstallUpdate(noopCallbacks);

    expect(checkMock).toHaveBeenCalledTimes(1);
  });
});

describe('automaticUpdateCheckEnabled — persistence and upgrade', () => {
  it('defaults to on', () => {
    expect(DEFAULT_APP_SETTINGS.automaticUpdateCheckEnabled).toBe(true);
  });

  it('survives an upgrade: a stored blob written before the setting existed keeps the default', () => {
    // Exactly what an existing install carries today — no update key at all.
    installStorage(JSON.stringify({
      defaultReviewerName: 'Jasper',
      crashReportingEnabled: true,
    }));

    const settings = loadAppSettings();

    expect(settings.automaticUpdateCheckEnabled).toBe(true);
    expect(settings.crashReportingEnabled).toBe(true); // stored values still win
    expect(settings.defaultReviewerName).toBe('Jasper');
  });

  it('a stored false is not overwritten by the true default', () => {
    installStorage(JSON.stringify({ automaticUpdateCheckEnabled: false }));
    expect(loadAppSettings().automaticUpdateCheckEnabled).toBe(false);
  });

  it('falls back to the default when the stored blob is unreadable', () => {
    installStorage('{ not json');
    expect(loadAppSettings().automaticUpdateCheckEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wiring: the gate has to be the one ViewerApp actually calls, and the toggle
// has to be reachable. Source assertions, because there is no DOM test runtime
// in this project (environment: "node", no jsdom).
// ---------------------------------------------------------------------------

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url), 'utf8');
const panelSource = readFileSync(
  new URL('../src/viewer/components/SettingsPanel.tsx', import.meta.url), 'utf8');
const commandsSource = readFileSync(
  new URL('../src/viewer/hooks/useCommands.ts', import.meta.url), 'utf8');

describe('wiring — the startup check goes through the gate', () => {
  it('ViewerApp schedules via scheduleStartupUpdateCheckIfEnabled', () => {
    expect(viewerAppSource).toContain('return scheduleStartupUpdateCheckIfEnabled(');
  });

  it('ViewerApp never calls the ungated scheduler directly', () => {
    expect(viewerAppSource).not.toMatch(/scheduleStartupUpdateCheck\(/);
  });

  it('the manual check still calls checkAndInstallUpdate', () => {
    expect(viewerAppSource).toContain('checkAndInstallUpdate(');
    expect(commandsSource).toContain("id: 'check-for-updates'");
  });
});

describe('wiring — the toggle is reachable', () => {
  it('SettingsPanel renders the toggle bound to the setting', () => {
    expect(panelSource).toContain('data-testid="settings-auto-update-toggle"');
    expect(panelSource).toContain('checked={settings.automaticUpdateCheckEnabled}');
    expect(panelSource).toContain("handleChange('automaticUpdateCheckEnabled', e.target.checked)");
  });

  it('SettingsPanel labels it from i18n', () => {
    expect(panelSource).toContain("t('settings.automaticUpdateCheck')");
    expect(panelSource).toContain("t('settings.automaticUpdateCheckHint')");
  });

  it('ViewerApp mounts SettingsPanel and persists changes', () => {
    expect(viewerAppSource).toContain('<SettingsPanel');
    expect(viewerAppSource).toContain('onSettingsChange={handleSettingsChange}');
    expect(viewerAppSource).toContain('saveAppSettings(next)');
  });

  it('a command opens it', () => {
    expect(commandsSource).toContain("id: 'open-settings'");
    expect(commandsSource).toContain('setSettingsOpen(true)');
  });
});

describe('i18n — the toggle strings exist in the maintained locales', () => {
  // en and nl are the two hand-maintained locales; the other 25 lag by design
  // and fall back to en (fallbackLng: 'en', see src/i18n/README.md).
  for (const lang of ['en', 'nl']) {
    it(`${lang} defines the update-check strings`, () => {
      const locale = JSON.parse(readFileSync(
        new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
      ) as { settings: Record<string, string> };
      expect(locale.settings.updates).toBeTruthy();
      expect(locale.settings.automaticUpdateCheck).toBeTruthy();
      expect(locale.settings.automaticUpdateCheckHint).toBeTruthy();
    });
  }

  it('en fallback covers every other supported locale', () => {
    const indexSource = readFileSync(
      new URL('../src/i18n/index.ts', import.meta.url), 'utf8');
    expect(indexSource).toContain("fallbackLng: 'en'");
  });
});
