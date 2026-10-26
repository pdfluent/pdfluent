// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { loadAppSettings, type ThemePreference } from './appSettings';

/** True when the OS asks for a dark colour scheme. False where matchMedia is missing. */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** "system" follows the OS; an explicit choice always wins over it. */
export function resolveDark(pref: ThemePreference, systemDark: boolean): boolean {
  return pref === 'system' ? systemDark : pref === 'dark';
}

/**
 * Mirror the resolved theme on <html> so the page background is right before
 * React mounts (no light flash on a dark restart). The editor shell reads the
 * same preference for its own `.theme-dark` class.
 */
export function applyThemeToRoot(dark: boolean, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('theme-dark', dark);
  // `.dark` is what the shadcn token block (--background, --foreground,
  // --muted-foreground, ...) and Tailwind's `dark:` variants key on. Nothing set
  // it, so choosing dark in Settings on a light OS left every Tailwind surface
  // light while the shell went dark: dark text on a dark bar.
  root.classList.toggle('dark', dark);
  root.classList.toggle('theme-light', !dark);
}

/** Read the stored preference and apply it. Call before the first render. */
export function applyStoredTheme(root?: HTMLElement): boolean {
  const dark = resolveDark(loadAppSettings().themePreference, systemPrefersDark());
  applyThemeToRoot(dark, root);
  return dark;
}
