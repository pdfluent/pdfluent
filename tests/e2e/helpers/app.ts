// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { Page } from '@playwright/test';
import { tid } from './selectors';

// ViewerApp (V3 shell) is served at the root URL '/'.
// There is no '?v2' switch — that was a comment error. The only URL param is
// '?legacy' which loads the retired V1 shell. Do not use '/?v2' in new tests.
export const VIEWER_URL = '/';

/**
 * Navigate to the viewer and wait for the welcome screen to be visible.
 * Playwright's webServer block ensures Vite is already running.
 * Seeds Dutch locale so mode labels and UI text match test expectations.
 */
export async function gotoViewer(page: Page): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('pdfluent-lang', 'nl'); });
  await page.goto(VIEWER_URL);
  // Wait for React to hydrate and the welcome screen to appear.
  // The active testid is 'welcome-screen' (components/WelcomeScreen.tsx).
  // The old 'viewer-empty-state' was in WelcomeSection.tsx which has zero importers.
  await page.locator(tid('welcome-screen')).waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Wait until the dev-only test hook is registered by ViewerApp.
 * The hook is created in a useEffect that runs after the MockPdfEngine
 * initialises — only available in DEV mode (Vite dev server).
 */
export async function waitForTestHook(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>)['__pdfluent_test__'] !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Simulate loading a document via the dev test hook.
 * The app will call MockDocumentEngine.loadDocument() which returns a
 * 3-page A4 document synchronously — the welcome screen disappears and
 * the document canvas + controls become visible.
 */
export async function loadMockDocument(page: Page, path = 'mock-test.pdf'): Promise<void> {
  await waitForTestHook(page);
  await page.evaluate(
    (p) => (window as unknown as Record<string, unknown & { __pdfluent_test__: { loadDocument: (p: string) => Promise<void> } }>)['__pdfluent_test__'].loadDocument(p),
    path,
  );
  // Document is loaded when the floating page indicator appears.
  await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Navigate to the viewer and immediately load a mock document.
 * Convenience wrapper for document-dependent tests.
 */
export async function gotoViewerWithDoc(page: Page, path = 'mock-test.pdf'): Promise<void> {
  await gotoViewer(page);
  await loadMockDocument(page, path);
}

/** Switch viewer mode by clicking the mode tab (ModeSwitcher has no testids, uses text). */
export async function switchMode(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
}

/** Open the export dialog via the TopBar export button. */
export async function openExportDialog(page: Page): Promise<void> {
  await page.locator(tid('export-btn')).click();
  await page.locator(tid('export-dialog')).waitFor({ state: 'visible', timeout: 3_000 });
}

/** Open the command palette / search panel via the TopBar search button. */
export async function openSearchPanel(page: Page): Promise<void> {
  await page.locator(tid('search-btn')).click();
  await page.locator(tid('command-palette')).waitFor({ state: 'visible', timeout: 3_000 });
}

/** Open the command palette via keyboard shortcut. */
export async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press('Meta+k');
  await page.locator(tid('command-palette')).waitFor({ state: 'visible', timeout: 3_000 });
}
