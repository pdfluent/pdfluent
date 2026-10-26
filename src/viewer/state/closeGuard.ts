// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// The webview's half of the close / quit guard (J-81).
//
// The backend holds the window's close button, Alt-F4 and Quit while there are
// unsaved changes and sends `app-close-requested` (src-tauri/src/close_guard.rs).
// This decides what happens next: nothing to lose closes at once; otherwise the
// unsaved-changes dialog opens with "close the app" as its waiting action, so
// Save closes only after a successful save, Don't save closes, and Cancel
// leaves the app open. `beforeunload`, the only guard until 1.0.1, is never
// consulted by Tauri.
// ---------------------------------------------------------------------------

import type { PendingActionSlot } from './saveFlow';

/** Backend event name; mirrors close_guard::CLOSE_REQUESTED_EVENT. */
export const CLOSE_REQUESTED_EVENT = 'app-close-requested';

/** Payload of the event; mirrors close_guard::CloseRequest. */
export interface CloseRequestPayload {
  kind: 'window' | 'quit';
  /** The backend's document has unsaved changes. */
  documentModified: boolean;
}

export interface CloseRequestDeps {
  /** Unsaved changes right now (read at request time, not at subscribe time). */
  isDirty: () => boolean;
  /** The slot the unsaved-changes dialog runs after Save or Don't save. */
  pending: PendingActionSlot;
  openUnsavedDialog: () => void;
  /** Tell the backend the user decided; it closes the app. */
  confirmClose: () => void;
  /**
   * Several documents are open (J-90) and some have unsaved changes: ask about
   * each of them in turn. Resolves true when every one was saved or given up,
   * false when the user cancelled somewhere. Without it, the one dialog about
   * the document on screen is all there is.
   */
  reviewUnsaved?: () => Promise<boolean>;
}

export type CloseRequestOutcome = 'closed' | 'asked';

/**
 * Unsaved means unsaved on either side: the webview's own state, or the
 * backend's flag in the request. A change the webview never registered is
 * still a change on disk-to-be.
 */
export function handleCloseRequest(
  deps: CloseRequestDeps,
  request: CloseRequestPayload = { kind: 'window', documentModified: false },
): CloseRequestOutcome {
  if (!deps.isDirty() && !request.documentModified) {
    deps.confirmClose();
    return 'closed';
  }
  if (deps.reviewUnsaved) {
    void deps.reviewUnsaved().then((done) => {
      if (done) deps.confirmClose();
    });
    return 'asked';
  }
  deps.pending.current = deps.confirmClose;
  deps.openUnsavedDialog();
  return 'asked';
}
