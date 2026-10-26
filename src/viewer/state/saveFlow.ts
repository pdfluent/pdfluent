// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Save flows, without React.
//
// The hooks that drive saving hold refs and setters; what they decide is small
// and is the part that went wrong. It lives here so a test can call it with a
// fake backend and see what happens to the document, not what the source says.
// ---------------------------------------------------------------------------

/** How a Save As ended. A failure is not an outcome: it rejects. */
export type SaveAsResult =
  | { status: 'saved'; path: string }
  | { status: 'cancelled' };

/** The one backend call a Save As needs, injectable for tests. */
export type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Ask for a destination and save there.
 *
 * Until 1.0.1 the hook wrapped this in `catch {}`: a Save As that failed
 * resolved like one that worked, so the task bar said "Saved" and the caller
 * moved on. A rejection from the backend now reaches the caller unchanged;
 * `invokeCommand` has already put it on screen and in the log.
 */
export async function saveAsWithDialog(
  invoke: InvokeFn,
  onSaved: (path: string) => void,
  command: 'save_pdf_as_dialog' | 'save_unsigned_copy_as_dialog' = 'save_pdf_as_dialog',
): Promise<SaveAsResult> {
  const path = await invoke<string | null>(command);
  if (!path) return { status: 'cancelled' };
  onSaved(path);
  return { status: 'saved', path };
}

/** What the unsaved-changes dialog needs to save before it lets an action run. */
export interface SaveBeforeActionDeps {
  /** Where the document lives, or null for one that was never saved. */
  currentFilePath: string | null;
  /** Save over `path`; rejects on failure. Marks the document clean itself. */
  saveToPath: (path: string) => Promise<void>;
  /** Save As with a dialog; rejects on failure. */
  saveAs: () => Promise<SaveAsResult>;
}

export type SaveBeforeActionResult =
  | { proceed: true }
  | { proceed: false; reason: 'cancelled' }
  | { proceed: false; reason: 'failed'; error: unknown };

/**
 * The "Save" button of the unsaved-changes dialog.
 *
 * The action waiting behind the dialog — open another file, close the
 * document, quit — may only run once the changes are on disk. Until 1.0.1 a
 * failed save was caught and the action ran anyway (J-82): the user pressed
 * Save, the save failed, and the document was discarded. A document that was
 * never saved goes through Save As instead of leaving the button disabled, and
 * cancelling that dialog keeps the document open too.
 */
export async function saveBeforePendingAction(deps: SaveBeforeActionDeps): Promise<SaveBeforeActionResult> {
  try {
    if (deps.currentFilePath) {
      await deps.saveToPath(deps.currentFilePath);
      return { proceed: true };
    }
    const result = await deps.saveAs();
    return result.status === 'saved' ? { proceed: true } : { proceed: false, reason: 'cancelled' };
  } catch (error) {
    return { proceed: false, reason: 'failed', error };
  }
}

/** The ref the lifecycle hook keeps the waiting action in. */
export interface PendingActionSlot {
  current: (() => void) | null;
}

/**
 * Save, close the dialog, and run the waiting action only if the save
 * succeeded. The action is dropped either way: after a failure the user
 * decides again, with the error in front of them.
 */
export async function settleUnsavedWithSave(
  pending: PendingActionSlot,
  deps: SaveBeforeActionDeps,
  closeDialog: () => void,
): Promise<SaveBeforeActionResult> {
  const result = await saveBeforePendingAction(deps);
  closeDialog();
  const action = pending.current;
  pending.current = null;
  if (result.proceed) action?.();
  return result;
}

/**
 * The backend's typed refusal to save a signed document over itself when the
 * change cannot be appended as an incremental update (a redaction). The app
 * answers it with the signed-save dialog, which offers a copy without the
 * signature. Mirrors pdf_engine::SIGNED_NEEDS_FULL_REWRITE.
 */
export const SIGNED_NEEDS_FULL_REWRITE = 'signed-document-needs-full-rewrite';

export function isSignedSaveRefusal(message: string): boolean {
  return message.includes(SIGNED_NEEDS_FULL_REWRITE);
}

/**
 * Where a command failure goes. The signed-document refusal is not an error
 * the person has to read: it is a question (save a copy without the
 * signature?), and the dialog asks it. Appending the raw backend sentence to
 * the error stack as well put a second, worse-worded message on screen and
 * made J-19 fail on its own expected answer.
 */
export function routeCommandFailure(message: string): 'signed-save-dialog' | 'error-stack' {
  return isSignedSaveRefusal(message) ? 'signed-save-dialog' : 'error-stack';
}
