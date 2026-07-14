// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

/**
 * Open the native PDF picker from the frontend.
 *
 * Keep this on the async dialog plugin path. Calling a Rust command that uses a
 * blocking native picker from a macOS menu event can stall the app event loop.
 */
export async function pickPdfPath(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    title: 'Open PDF',
    multiple: false,
    directory: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (typeof selected === 'string') return selected;
  if (Array.isArray(selected)) {
    const first = selected[0];
    return typeof first === 'string' ? first : null;
  }
  return null;
}
