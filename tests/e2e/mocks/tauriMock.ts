// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Tauri mock strategy — Playwright E2E
 *
 * The app uses a runtime adapter pattern (RuntimeAdapterFactory) that
 * automatically selects the right engine based on the environment:
 *
 *   • In Tauri (native):  TauriRuntimeAdapter (priority 100) → TauriDocumentEngine
 *   • In browser (Vite):  BrowserTestRuntimeAdapter (priority 50) → MockPdfEngine
 *
 * When Playwright drives the app via the Vite dev server, `window.__TAURI__`
 * is NOT present. The TauriRuntimeAdapter.isAvailable() returns false.
 * The BrowserTestRuntimeAdapter is selected automatically.
 *
 * No manual window.__TAURI_INTERNALS__ injection is needed.
 * MockPdfEngine returns a 3-page A4 document for any loadDocument() call.
 *
 * The only hook needed for E2E tests is the dev-only test helper:
 *
 *   window.__pdfluent_test__.loadDocument('test.pdf')
 *
 * This is registered by ViewerApp in a useEffect (DEV mode only) once the
 * engine has initialised. See helpers/app.ts :: loadMockDocument().
 */

// This file intentionally has no runtime exports — it documents the
// mock architecture for future contributors.
export const TAURI_MOCK_STRATEGY = 'browser-test-adapter-auto-selected' as const;
