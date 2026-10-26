// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-81: closing the window or quitting with unsaved changes asks first, and
// the answer decides. Driven end to end through the same two functions the app
// uses: the close request, then the unsaved-changes dialog's Save.

import { describe, it, expect, vi } from 'vitest';
import { handleCloseRequest } from '../closeGuard';
import { settleUnsavedWithSave, type PendingActionSlot } from '../saveFlow';

function setup(dirty: boolean) {
  const pending: PendingActionSlot = { current: null };
  const confirmClose = vi.fn();
  const openUnsavedDialog = vi.fn();
  const outcome = handleCloseRequest({ isDirty: () => dirty, pending, openUnsavedDialog, confirmClose });
  return { pending, confirmClose, openUnsavedDialog, outcome };
}

describe('handleCloseRequest', () => {
  it('closes at once when there is nothing to lose', () => {
    const { confirmClose, openUnsavedDialog, outcome } = setup(false);
    expect(outcome).toBe('closed');
    expect(confirmClose).toHaveBeenCalledTimes(1);
    expect(openUnsavedDialog).not.toHaveBeenCalled();
  });

  it('asks instead of closing when there are unsaved changes', () => {
    const { confirmClose, openUnsavedDialog, outcome } = setup(true);
    expect(outcome).toBe('asked');
    expect(openUnsavedDialog).toHaveBeenCalledTimes(1);
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it('Cancel keeps the app open', () => {
    const { pending, confirmClose } = setup(true);
    // The dialog's Cancel drops the waiting action (useDocumentLifecycle).
    pending.current = null;
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it("Don't save closes the app", () => {
    const { pending, confirmClose } = setup(true);
    pending.current?.();
    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it('Save closes only after the save succeeded', async () => {
    const { pending, confirmClose } = setup(true);
    await settleUnsavedWithSave(pending, {
      currentFilePath: '/Users/a/report.pdf',
      saveToPath: () => Promise.resolve(),
      saveAs: vi.fn(),
    }, () => {});
    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the app open', async () => {
    const { pending, confirmClose } = setup(true);
    await settleUnsavedWithSave(pending, {
      currentFilePath: '/Users/a/report.pdf',
      saveToPath: () => Promise.reject(new Error('No space left on device')),
      saveAs: vi.fn(),
    }, () => {});
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it('treats a change only the backend knows about as unsaved', () => {
    const confirmClose = vi.fn();
    const openUnsavedDialog = vi.fn();
    const outcome = handleCloseRequest(
      { isDirty: () => false, pending: { current: null }, openUnsavedDialog, confirmClose },
      { kind: 'quit', documentModified: true },
    );
    expect(outcome).toBe('asked');
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it('reads the dirty state when the request arrives, not when it was set up', () => {
    let dirty = false;
    const confirmClose = vi.fn();
    const deps = { isDirty: () => dirty, pending: { current: null }, openUnsavedDialog: vi.fn(), confirmClose };
    dirty = true;
    expect(handleCloseRequest(deps)).toBe('asked');
    expect(confirmClose).not.toHaveBeenCalled();
  });
});

// J-90: with several documents open the one dialog about the document on
// screen is not enough; the review asks about each in turn.
describe('handleCloseRequest with several documents', () => {
  function review(result: Promise<boolean>) {
    const confirmClose = vi.fn();
    const openUnsavedDialog = vi.fn();
    const reviewUnsaved = vi.fn(() => result);
    const outcome = handleCloseRequest({
      isDirty: () => true,
      pending: { current: null },
      openUnsavedDialog,
      confirmClose,
      reviewUnsaved,
    });
    return { confirmClose, openUnsavedDialog, reviewUnsaved, outcome };
  }

  it('runs the review instead of the single dialog', () => {
    const { reviewUnsaved, openUnsavedDialog, outcome } = review(new Promise<boolean>(() => undefined));
    expect(outcome).toBe('asked');
    expect(reviewUnsaved).toHaveBeenCalledTimes(1);
    expect(openUnsavedDialog).not.toHaveBeenCalled();
  });

  it('closes once every document is settled', async () => {
    const { confirmClose } = review(Promise.resolve(true));
    await Promise.resolve();
    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the app open when the user cancels on any document', async () => {
    const { confirmClose } = review(Promise.resolve(false));
    await Promise.resolve();
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it('does not close while the review is still waiting for an answer', async () => {
    const { confirmClose } = review(new Promise<boolean>(() => undefined));
    await Promise.resolve();
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it('closes without asking when nothing is unsaved anywhere', () => {
    const confirmClose = vi.fn();
    const reviewUnsaved = vi.fn(() => Promise.resolve(true));
    const outcome = handleCloseRequest({
      isDirty: () => false,
      pending: { current: null },
      openUnsavedDialog: vi.fn(),
      confirmClose,
      reviewUnsaved,
    });
    expect(outcome).toBe('closed');
    expect(reviewUnsaved).not.toHaveBeenCalled();
  });
});
