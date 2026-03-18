// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

  it('returns cleanup from startup check useEffect', () => {
    expect(viewerAppSource).toContain('return scheduleStartupUpdateCheck(');
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
