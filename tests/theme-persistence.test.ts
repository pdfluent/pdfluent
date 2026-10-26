// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #721: the saved theme preference must be applied at start, before first paint.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAppSettings, DEFAULT_APP_SETTINGS } from '../src/viewer/state/appSettings';
import { applyStoredTheme, resolveDark } from '../src/viewer/state/theme';

function fakeRoot(): HTMLElement {
  const set = new Set<string>();
  return {
    classList: {
      toggle: (c: string, on: boolean) => { if (on) set.add(c); else set.delete(c); return on; },
      contains: (c: string) => set.has(c),
    },
  } as unknown as HTMLElement;
}

function stubEnv(systemDark: boolean): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: systemDark }) });
}

describe('theme persistence (#721)', () => {
  beforeEach(() => { stubEnv(false); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a saved "dark" is applied on the next start', () => {
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, themePreference: 'dark' });
    const root = fakeRoot();
    expect(applyStoredTheme(root)).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('theme-light')).toBe(false);
  });

  it('dark also sets .dark, which the shadcn tokens and Tailwind dark: variants key on', () => {
    // Dark chosen in Settings on a light OS used to set only .theme-dark: the
    // update banner then painted #1a1a1a text on a #17181c bar (1.02:1).
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, themePreference: 'dark' });
    const root = fakeRoot();
    applyStoredTheme(root);
    expect(root.classList.contains('dark')).toBe(true);
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, themePreference: 'light' });
    const light = fakeRoot();
    applyStoredTheme(light);
    expect(light.classList.contains('dark')).toBe(false);
  });

  it('a saved "light" wins over a dark OS', () => {
    stubEnv(true);
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, themePreference: 'light' });
    const root = fakeRoot();
    expect(applyStoredTheme(root)).toBe(false);
    expect(root.classList.contains('theme-light')).toBe(true);
  });

  it('"system" follows the OS, and nothing stored means system', () => {
    stubEnv(true);
    const root = fakeRoot();
    expect(applyStoredTheme(root)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
    expect(resolveDark('system', true)).toBe(true);
  });

  it('start-up wiring: main applies the stored theme before render; the shell takes it from the app', () => {
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    expect(main.indexOf('applyStoredTheme();')).toBeGreaterThan(-1);
    expect(main.indexOf('applyStoredTheme();')).toBeLessThan(main.indexOf('createRoot('));
    const shell = readFileSync(new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url), 'utf8');
    expect(shell).not.toMatch(/useState\(false\);?\s*\n.*setThemeDark|\[themeDark, setThemeDark\]/);
  });
});
