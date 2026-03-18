// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/state/appSettings.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AppSettings interface
// ---------------------------------------------------------------------------

describe('AppSettings — interface shape', () => {
  it('declares defaultReviewerName field', () => {
    expect(source).toContain('defaultReviewerName:');
  });

  it('declares defaultExportFormat field', () => {
    expect(source).toContain('defaultExportFormat:');
  });

  it('declares autosaveEnabled field', () => {
    expect(source).toContain('autosaveEnabled:');
  });

  it('declares themePreference field', () => {
    expect(source).toContain('themePreference:');
  });

  it('declares ocrDefaultLanguage field', () => {
    expect(source).toContain('ocrDefaultLanguage:');
  });
});

// ---------------------------------------------------------------------------
// ExportFormat and ThemePreference types
// ---------------------------------------------------------------------------

describe('AppSettings — exported types', () => {
  it('exports ExportFormat type with json | markdown | html', () => {
    const typeStart = source.indexOf('export type ExportFormat');
    const typeLine = source.slice(typeStart, typeStart + 100);
    expect(typeLine).toContain("'json'");
    expect(typeLine).toContain("'markdown'");
    expect(typeLine).toContain("'html'");
  });

  it('exports ThemePreference type with light | dark | system', () => {
    const typeStart = source.indexOf('export type ThemePreference');
    const typeLine = source.slice(typeStart, typeStart + 100);
    expect(typeLine).toContain("'light'");
    expect(typeLine).toContain("'dark'");
    expect(typeLine).toContain("'system'");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_APP_SETTINGS
// ---------------------------------------------------------------------------

describe('DEFAULT_APP_SETTINGS', () => {
  it('exports DEFAULT_APP_SETTINGS', () => {
    expect(source).toContain('export const DEFAULT_APP_SETTINGS');
  });

  it('defaultExportFormat defaults to markdown', () => {
    const block = source.slice(source.indexOf('DEFAULT_APP_SETTINGS'), source.indexOf('DEFAULT_APP_SETTINGS') + 300);
    expect(block).toContain("defaultExportFormat: 'markdown'");
  });

  it('autosaveEnabled defaults to true', () => {
    const block = source.slice(source.indexOf('DEFAULT_APP_SETTINGS'), source.indexOf('DEFAULT_APP_SETTINGS') + 300);
    expect(block).toContain('autosaveEnabled: true');
  });

  it('themePreference defaults to system', () => {
    const block = source.slice(source.indexOf('DEFAULT_APP_SETTINGS'), source.indexOf('DEFAULT_APP_SETTINGS') + 300);
    expect(block).toContain("themePreference: 'system'");
  });

  it('ocrDefaultLanguage defaults to nld', () => {
    const block = source.slice(source.indexOf('DEFAULT_APP_SETTINGS'), source.indexOf('DEFAULT_APP_SETTINGS') + 300);
    expect(block).toContain("ocrDefaultLanguage: 'nld'");
  });
});

// ---------------------------------------------------------------------------
// SETTINGS_STORAGE_KEY
// ---------------------------------------------------------------------------

describe('SETTINGS_STORAGE_KEY', () => {
  it('exports SETTINGS_STORAGE_KEY constant', () => {
    expect(source).toContain('export const SETTINGS_STORAGE_KEY');
  });

  it('storage key is pdfluent.app.settings', () => {
    expect(source).toContain("'pdfluent.app.settings'");
  });
});

// ---------------------------------------------------------------------------
// loadAppSettings
// ---------------------------------------------------------------------------

describe('loadAppSettings', () => {
  it('exports loadAppSettings function', () => {
    expect(source).toContain('export function loadAppSettings()');
  });

  it('reads from localStorage using SETTINGS_STORAGE_KEY', () => {
    const fnStart = source.indexOf('export function loadAppSettings');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.getItem(SETTINGS_STORAGE_KEY)');
  });

  it('merges stored values with DEFAULT_APP_SETTINGS', () => {
    const fnStart = source.indexOf('export function loadAppSettings');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('DEFAULT_APP_SETTINGS');
    expect(body).toContain('JSON.parse(stored)');
  });

  it('returns defaults on parse failure (catch block)', () => {
    const fnStart = source.indexOf('export function loadAppSettings');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
    expect(body).toContain('DEFAULT_APP_SETTINGS');
  });
});

// ---------------------------------------------------------------------------
// saveAppSettings
// ---------------------------------------------------------------------------

describe('saveAppSettings', () => {
  it('exports saveAppSettings function', () => {
    expect(source).toContain('export function saveAppSettings(settings: AppSettings)');
  });

  it('writes to localStorage using SETTINGS_STORAGE_KEY', () => {
    const fnStart = source.indexOf('export function saveAppSettings');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.setItem(SETTINGS_STORAGE_KEY');
    expect(body).toContain('JSON.stringify(settings)');
  });
});

// ---------------------------------------------------------------------------
// updateAppSetting
// ---------------------------------------------------------------------------

describe('updateAppSetting', () => {
  it('exports updateAppSetting with generic key parameter', () => {
    expect(source).toContain('export function updateAppSetting<K extends keyof AppSettings>');
  });

  it('calls loadAppSettings and saveAppSettings internally', () => {
    const fnStart = source.indexOf('export function updateAppSetting');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('loadAppSettings()');
    expect(body).toContain('saveAppSettings(next)');
  });

  it('returns the updated settings object', () => {
    const fnStart = source.indexOf('export function updateAppSetting');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('return next');
  });
});

// ---------------------------------------------------------------------------
// resetAppSettings
// ---------------------------------------------------------------------------

describe('resetAppSettings', () => {
  it('exports resetAppSettings function', () => {
    expect(source).toContain('export function resetAppSettings()');
  });

  it('calls saveAppSettings with defaults', () => {
    const fnStart = source.indexOf('export function resetAppSettings');
    const body = source.slice(fnStart, fnStart + 200);
    expect(body).toContain('DEFAULT_APP_SETTINGS');
    expect(body).toContain('saveAppSettings(');
  });
});
