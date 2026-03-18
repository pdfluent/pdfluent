// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Page } from '@playwright/test';

/** localStorage key used by useRecentFiles hook. */
export const RECENT_FILES_KEY = 'pdfluent.recent-files';

/** localStorage key used by ViewerApp for reviewer name. */
export const AUTHOR_KEY = 'pdfluent.user.author';

/** localStorage key used by ViewerApp for zoom level. */
export const ZOOM_KEY = 'pdfluent.viewer.zoom';

/** localStorage key used by LeftNavRail for active panel. */
export const NAV_PANEL_KEY = 'pdfluent.nav.panel';

/**
 * Pre-seed recent files into localStorage BEFORE page load.
 * Must be called before page.goto().
 */
export async function seedRecentFiles(page: Page, paths: string[]): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); },
    { key: RECENT_FILES_KEY, value: paths },
  );
}

/**
 * Pre-seed a single localStorage value BEFORE page load.
 * Must be called before page.goto().
 */
export async function seedLocalStorage(page: Page, key: string, value: string): Promise<void> {
  await page.addInitScript(
    ({ k, v }) => { localStorage.setItem(k, v); },
    { k: key, v: value },
  );
}

/**
 * Clear recent files from localStorage at runtime (after page load).
 */
export async function clearRecentFilesRuntime(page: Page): Promise<void> {
  await page.evaluate(
    (key) => { localStorage.removeItem(key); },
    RECENT_FILES_KEY,
  );
}

/**
 * Read a localStorage value at runtime.
 */
export async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}
