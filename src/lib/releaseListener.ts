// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Drop a Tauri event listener from a React cleanup.
 *
 * Tauri's unlisten is async, and when the runtime no longer knows the listener
 * it rejects with "undefined is not an object (evaluating
 * 'listeners[eventId].handlerId')". Nothing is left to remove at that point,
 * but the rejection reached the crash reporter and put "Something went wrong"
 * over the editor in the middle of an ordinary tool switch (J-66, J-78).
 */
export function releaseListener(stop: (() => unknown) | undefined | null): void {
  if (!stop) return;
  try {
    void Promise.resolve(stop()).catch(() => undefined);
  } catch {
    // The listener was already gone.
  }
}
