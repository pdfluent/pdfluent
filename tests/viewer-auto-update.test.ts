// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { relaunchApp, isTauriRuntime } from '../src/lib/updater';

// Mock the Tauri plugin modules so importing updater.ts is safe under the test
// runtime and so relaunch() behavior can be asserted. vi.hoisted keeps the mock
// fn available to the hoisted vi.mock factory.
const { relaunchMock } = vi.hoisted(() => ({ relaunchMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: relaunchMock, exit: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));

const updaterSource = readFileSync(
  new URL('../src/lib/updater.ts', import.meta.url),
  'utf8'
);

const updateBannerSource = readFileSync(
  new URL('../src/viewer/components/UpdateBanner.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = [
  '../src/viewer/ViewerApp.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// updater.ts — API surface
// ---------------------------------------------------------------------------

describe('updater — API surface', () => {
  it('exports scheduleStartupUpdateCheck', () => {
    expect(updaterSource).toContain('export function scheduleStartupUpdateCheck');
  });

  it('exports checkAndInstallUpdate', () => {
    expect(updaterSource).toContain('export async function checkAndInstallUpdate');
  });

  it('exports UpdateCallbacks interface', () => {
    expect(updaterSource).toContain('export interface UpdateCallbacks');
  });

  it('onUpdateAvailable callback returns Promise<boolean>', () => {
    expect(updaterSource).toContain('onUpdateAvailable: (version: string) => Promise<boolean>');
  });

  it('schedules check with a 5-second delay', () => {
    expect(updaterSource).toContain('STARTUP_CHECK_DELAY_MS = 5_000');
    expect(updaterSource).toContain('setTimeout');
  });

  it('returns a cleanup function that calls clearTimeout', () => {
    expect(updaterSource).toContain('return () => clearTimeout(timer)');
  });
});

// ---------------------------------------------------------------------------
// UpdateBanner — component structure
// ---------------------------------------------------------------------------

describe('UpdateBanner — component structure', () => {
  it('renders nothing when isVisible is false', () => {
    expect(updateBannerSource).toContain('if (!isVisible) return null');
  });

  it('has data-testid="update-banner"', () => {
    expect(updateBannerSource).toContain('data-testid="update-banner"');
  });

  it('uses update.available i18n key', () => {
    expect(updateBannerSource).toContain("t('update.available')");
  });

  it('uses update.version i18n key with version interpolation', () => {
    expect(updateBannerSource).toContain("t('update.version', { version })");
  });

  it('uses update.install i18n key', () => {
    expect(updateBannerSource).toContain("t('update.install')");
  });

  it('uses update.installing i18n key', () => {
    expect(updateBannerSource).toContain("t('update.installing')");
  });

  it('uses update.dismiss i18n key for aria-label', () => {
    expect(updateBannerSource).toContain("t('update.dismiss')");
  });

  it('install button is disabled when installing', () => {
    expect(updateBannerSource).toContain('disabled={installing}');
  });

  it('calls onInstall on install button click', () => {
    expect(updateBannerSource).toContain('onClick={onInstall}');
  });

  it('calls onDismiss on dismiss button click', () => {
    expect(updateBannerSource).toContain('onClick={onDismiss}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — auto-update wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — auto-update wiring', () => {
  it('imports scheduleStartupUpdateCheck from updater', () => {
    expect(viewerAppSource).toContain('scheduleStartupUpdateCheck');
    expect(viewerAppSource).toContain("from '../lib/updater'");
  });

  it('imports checkAndInstallUpdate from updater', () => {
    expect(viewerAppSource).toContain('checkAndInstallUpdate');
  });

  it('imports UpdateBanner', () => {
    expect(viewerAppSource).toContain('UpdateBanner');
  });

  it('tracks updateAvailable state', () => {
    expect(viewerAppSource).toContain('updateAvailable');
    expect(viewerAppSource).toContain('setUpdateAvailable');
  });

  it('tracks updateVersion state', () => {
    expect(viewerAppSource).toContain('updateVersion');
    expect(viewerAppSource).toContain('setUpdateVersion');
  });

  it('tracks updateInstalling state', () => {
    expect(viewerAppSource).toContain('updateInstalling');
    expect(viewerAppSource).toContain('setUpdateInstalling');
  });

  it('guards startup check behind isTauri', () => {
    expect(viewerAppSource).toContain('if (!isTauri) return');
  });

  it('returns cleanup from startup check useEffect, through the setting gate', () => {
    // The startup check is switchable off (LICENSE.md §4), so ViewerApp goes
    // through scheduleStartupUpdateCheckIfEnabled. Both directions of that gate
    // are asserted in tests/startup-update-check-gate.test.ts.
    expect(viewerAppSource).toContain('return scheduleStartupUpdateCheckIfEnabled(');
  });

  it('startup check does not auto-install (returns false)', () => {
    expect(viewerAppSource).toContain('return false;');
  });

  it('defines handleInstallUpdate callback', () => {
    expect(viewerAppSource).toContain('handleInstallUpdate');
  });

  it('renders UpdateBanner with isVisible prop', () => {
    expect(viewerAppSource).toContain('<UpdateBanner');
    expect(viewerAppSource).toContain('isVisible={updateAvailable}');
  });

  it('passes version to UpdateBanner', () => {
    expect(viewerAppSource).toContain('version={updateVersion}');
  });

  it('passes installing to UpdateBanner', () => {
    expect(viewerAppSource).toContain('installing={updateInstalling}');
  });

  it('onDismiss sets updateAvailable to false', () => {
    expect(viewerAppSource).toContain('setUpdateAvailable(false)');
  });
});

// ---------------------------------------------------------------------------
// useCommands — check-for-updates command
// ---------------------------------------------------------------------------

const commandsSource = readFileSync(
  new URL('../src/viewer/hooks/useCommands.ts', import.meta.url),
  'utf8'
);

describe('useCommands — check-for-updates', () => {
  it('accepts onCheckForUpdates prop', () => {
    expect(commandsSource).toContain('onCheckForUpdates: () => void');
  });

  it('includes check-for-updates command', () => {
    expect(commandsSource).toContain("id: 'check-for-updates'");
  });

  it('uses commands.checkForUpdates i18n key', () => {
    expect(commandsSource).toContain("t('commands.checkForUpdates')");
  });

  it('calls onCheckForUpdates in action', () => {
    expect(commandsSource).toContain('onCheckForUpdates()');
  });

  it('ViewerApp passes onCheckForUpdates to useCommands', () => {
    expect(viewerAppSource).toContain('onCheckForUpdates: handleCheckForUpdates');
  });

  it('ViewerApp defines handleCheckForUpdates', () => {
    expect(viewerAppSource).toContain('handleCheckForUpdates');
    expect(viewerAppSource).toContain('checkAndInstallUpdate(');
  });
});

// ---------------------------------------------------------------------------
// Post-install restart / relaunch UX
// ---------------------------------------------------------------------------

const enLocale = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
);
const libRsSource = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
// The updater + process permissions live in an INLINE capability in
// tauri.conf.json (so the Mac App Store overlay can drop them); the MAS overlay
// omits that capability entirely.
const confSource = readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8');
const masConfSource = readFileSync(new URL('../src-tauri/tauri.mas.conf.json', import.meta.url), 'utf8');
const cargoSource = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');

describe('updater — restart/relaunch API', () => {
  it('exports relaunchApp and isTauriRuntime', () => {
    expect(updaterSource).toContain('export async function relaunchApp');
    expect(updaterSource).toContain('export function isTauriRuntime');
  });

  it('relaunchApp is a no-op outside Tauri and uses the process plugin inside', () => {
    expect(updaterSource).toContain('if (!isTauriRuntime()) return');
    expect(updaterSource).toContain('import("@tauri-apps/plugin-process")');
    expect(updaterSource).toContain('relaunch()');
  });
});

describe('UpdateBanner — restart state', () => {
  it('accepts installed + restartHint + onRestart', () => {
    expect(updateBannerSource).toContain('installed: boolean');
    expect(updateBannerSource).toContain("restartHint: 'unsaved' | 'failed' | null");
    expect(updateBannerSource).toContain('onRestart: () => void');
  });

  it('renders the installed/restart state with a restart button', () => {
    expect(updateBannerSource).toContain("t('update.installed')");
    expect(updateBannerSource).toContain("t('update.restartNow')");
    expect(updateBannerSource).toContain('data-testid="update-restart"');
    expect(updateBannerSource).toContain('onClick={onRestart}');
  });

  it('shows unsaved + manual-restart hints', () => {
    expect(updateBannerSource).toContain("t('update.restartUnsaved')");
    expect(updateBannerSource).toContain("t('update.restartManual')");
  });
});

describe('ViewerApp — restart wiring', () => {
  it('imports relaunchApp and tracks updateInstalled', () => {
    expect(viewerAppSource).toContain('relaunchApp');
    expect(viewerAppSource).toContain('updateInstalled');
    expect(viewerAppSource).toContain('setUpdateInstalled(true)');
  });

  it('marks installed in onUpdateInstalled', () => {
    expect(viewerAppSource).toContain('setUpdateInstalling(false); setUpdateInstalled(true);');
  });

  it('defines handleRestartApp that guards unsaved work', () => {
    expect(viewerAppSource).toContain('handleRestartApp');
    expect(viewerAppSource).toContain('if (isDirty)');
    expect(viewerAppSource).toContain("setUpdateRestartHint('unsaved')");
  });

  it('falls back to a manual-restart hint on relaunch failure', () => {
    expect(viewerAppSource).toContain("setUpdateRestartHint('failed')");
  });

  it('passes restart props to UpdateBanner', () => {
    expect(viewerAppSource).toContain('installed={updateInstalled}');
    expect(viewerAppSource).toContain('onRestart={handleRestartApp}');
    expect(viewerAppSource).toContain('restartHint={updateRestartHint}');
  });
});

describe('i18n — restart keys (en)', () => {
  it('defines the post-install restart strings', () => {
    expect(enLocale.update.installed).toBeTruthy();
    expect(enLocale.update.restartNow).toBeTruthy();
    expect(enLocale.update.restartUnsaved).toBeTruthy();
    expect(enLocale.update.restartManual).toBeTruthy();
  });
});

describe('Tauri process plugin — registration', () => {
  it('declares the tauri-plugin-process dependency', () => {
    expect(cargoSource).toContain('tauri-plugin-process');
  });
  it('registers the process plugin', () => {
    expect(libRsSource).toContain('tauri_plugin_process::init()');
  });
  it('grants the updater + process capability inline (direct-download build)', () => {
    expect(confSource).toContain('updater:default');
    expect(confSource).toContain('process:default');
  });
  it('the Mac App Store overlay drops the updater/process capability', () => {
    // The MAS build compiles the updater + process plugins out, so its
    // capability set must exclude the inline "updater" capability.
    expect(masConfSource).not.toContain('updater:default');
    expect(masConfSource).not.toContain('process:default');
  });
});

describe('relaunchApp — behavior', () => {
  afterEach(() => {
    relaunchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('isTauriRuntime is false without the Tauri global', () => {
    vi.stubGlobal('window', {});
    expect(isTauriRuntime()).toBe(false);
  });

  it('is a no-op outside Tauri (relaunch not called)', async () => {
    vi.stubGlobal('window', {});
    await relaunchApp();
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it('calls plugin-process relaunch inside Tauri', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    relaunchMock.mockResolvedValue(undefined);
    await relaunchApp();
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when relaunch fails so the caller can show manual restart', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    relaunchMock.mockRejectedValue(new Error('process plugin unavailable'));
    await expect(relaunchApp()).rejects.toThrow();
  });
});
