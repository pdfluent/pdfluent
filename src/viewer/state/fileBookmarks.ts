// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// macOS App Sandbox: security-scoped bookmarks for recent files.
//
// Files the user opens via the dialog / drag-drop / Finder are granted to the
// process for the session (powerbox), but that grant is lost on relaunch — so a
// recent file reopened by stored path would be denied. The Rust backend mints a
// security-scoped bookmark while the file is accessible and resolves it before
// reopening, re-acquiring access in the new session.
//
// The bookmark BLOB never crosses this bridge: it is created, stored (in the app
// container) and resolved entirely in Rust. The frontend only ever passes the
// file PATH. These helpers are thin, path-only wrappers and are safe no-ops
// outside the Tauri/macOS runtime.

import { isTauriRuntime } from '../../lib/tauri-detection';

const isTauri = isTauriRuntime();

/**
 * Ask the backend to mint + persist a security-scoped bookmark for a file the
 * user just opened, so it survives in Recent across a sandboxed relaunch.
 * No-op off macOS/Tauri. Never throws.
 */
export async function rememberFileAccess(path: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    await invoke('remember_file_access', { path });
  } catch { /* keep going without a bookmark */ }
}

/**
 * Ask the backend to resolve the stored bookmark for a recent file and begin
 * security-scoped access before reopening it by path. Returns true if access is
 * active. No-op (returns true) off macOS/Tauri so non-sandboxed opens proceed.
 */
export async function prepareRecentOpen(path: string): Promise<boolean> {
  if (!isTauri) return true;
  try {
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    return await invoke<boolean>('prepare_recent_open', { path });
  } catch {
    return false;
  }
}

/**
 * Ask the backend to stop security-scoped access for a path (on document close
 * or change), balancing prepareRecentOpen. No-op off macOS/Tauri. Never throws.
 */
export async function releaseFileAccess(path: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    await invoke('release_file_access', { path });
  } catch { /* nothing was holding access */ }
}
