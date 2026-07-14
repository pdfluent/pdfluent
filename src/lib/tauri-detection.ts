// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

/**
 * Detect the Tauri desktop runtime without requiring `window.__TAURI__`.
 *
 * PDFluent disables `withGlobalTauri` for security, so the public global API is
 * intentionally absent. The internal IPC marker remains available in Tauri and
 * is enough for capability gating.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const candidate = window as TauriWindow;
  return Boolean(candidate.__TAURI_INTERNALS__ || candidate.__TAURI__);
}
