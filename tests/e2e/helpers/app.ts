// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Page } from '@playwright/test';
import { tid } from './selectors';

/** The ViewerApp is served at /?v2 via main.tsx's URL-param switch. */
export const VIEWER_URL = '/?v2';

/**
 * Navigate to the viewer and wait for the welcome screen to be visible.
 * Playwright's webServer block ensures Vite is already running.
 */
export async function gotoViewer(page: Page): Promise<void> {
  await page.goto(VIEWER_URL);
  // Wait for React to hydrate and the empty-state wrapper to appear.
  await page.locator(tid('viewer-empty-state')).waitFor({ state: 'visible', timeout: 15_000 });
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
