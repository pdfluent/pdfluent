// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-83: a Save As that fails must say so. Until 1.0.1 the hook caught the
// rejection and resolved, so the task bar reported "Saved" for a document that
// was never written. These tests drive the flow with a fake backend and look at
// what the caller is told and whether the document was marked clean.

import { describe, it, expect, vi } from 'vitest';
import { isSignedSaveRefusal, routeCommandFailure, saveAsWithDialog, saveBeforePendingAction, settleUnsavedWithSave, type InvokeFn } from '../saveFlow';

function backend(result: () => Promise<unknown>): InvokeFn {
  return (<T,>(command: string) => {
    expect(command).toBe('save_pdf_as_dialog');
    return result() as Promise<T>;
  }) as InvokeFn;
}

describe('saveAsWithDialog', () => {
  it('rejects when the backend fails, and does not mark the document saved', async () => {
    const onSaved = vi.fn();
    const invoke = backend(() => Promise.reject(new Error('Failed to save PDF: No space left on device')));

    await expect(saveAsWithDialog(invoke, onSaved)).rejects.toThrow('No space left on device');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('reports a cancelled dialog as cancelled, not as saved', async () => {
    const onSaved = vi.fn();
    const result = await saveAsWithDialog(backend(() => Promise.resolve(null)), onSaved);
    expect(result).toEqual({ status: 'cancelled' });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('hands the chosen path to the caller once the backend has written it', async () => {
    const onSaved = vi.fn();
    const result = await saveAsWithDialog(backend(() => Promise.resolve('/Users/a/copy.pdf')), onSaved);
    expect(result).toEqual({ status: 'saved', path: '/Users/a/copy.pdf' });
    expect(onSaved).toHaveBeenCalledWith('/Users/a/copy.pdf');
  });
});

// J-82: the unsaved-changes dialog. "Save" may only let the waiting action
// (open another file, close, quit) run once the changes are on disk.
describe('saveBeforePendingAction', () => {
  it('holds the action back when the save fails, and passes the error on', async () => {
    const failure = new Error('Failed to save PDF: Permission denied');
    const saveAs = vi.fn();
    const result = await saveBeforePendingAction({
      currentFilePath: '/Users/a/report.pdf',
      saveToPath: () => Promise.reject(failure),
      saveAs,
    });
    expect(result).toEqual({ proceed: false, reason: 'failed', error: failure });
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('lets the action run once the save over the current file succeeded', async () => {
    const saveToPath = vi.fn(() => Promise.resolve());
    const result = await saveBeforePendingAction({
      currentFilePath: '/Users/a/report.pdf',
      saveToPath,
      saveAs: vi.fn(),
    });
    expect(saveToPath).toHaveBeenCalledWith('/Users/a/report.pdf');
    expect(result).toEqual({ proceed: true });
  });

  it('saves a never-saved document through Save As instead of discarding it', async () => {
    const saveToPath = vi.fn();
    const result = await saveBeforePendingAction({
      currentFilePath: null,
      saveToPath,
      saveAs: () => Promise.resolve({ status: 'saved' as const, path: '/Users/a/new.pdf' }),
    });
    expect(saveToPath).not.toHaveBeenCalled();
    expect(result).toEqual({ proceed: true });
  });

  it('keeps the document when the Save As dialog is cancelled', async () => {
    const result = await saveBeforePendingAction({
      currentFilePath: null,
      saveToPath: vi.fn(),
      saveAs: () => Promise.resolve({ status: 'cancelled' as const }),
    });
    expect(result).toEqual({ proceed: false, reason: 'cancelled' });
  });

  it('holds the action back when the Save As fails', async () => {
    const result = await saveBeforePendingAction({
      currentFilePath: null,
      saveToPath: vi.fn(),
      saveAs: () => Promise.reject(new Error('disk full')),
    });
    expect(result.proceed).toBe(false);
    expect(result).toMatchObject({ reason: 'failed' });
  });
});

describe('settleUnsavedWithSave', () => {
  it('does not run the waiting action when the save fails', async () => {
    const action = vi.fn();
    const pending = { current: action as (() => void) | null };
    const closeDialog = vi.fn();

    const result = await settleUnsavedWithSave(pending, {
      currentFilePath: '/Users/a/report.pdf',
      saveToPath: () => Promise.reject(new Error('Failed to save PDF: No space left on device')),
      saveAs: vi.fn(),
    }, closeDialog);

    expect(action).not.toHaveBeenCalled();
    expect(result).toMatchObject({ proceed: false, reason: 'failed' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(pending.current).toBeNull();
  });

  it('runs the waiting action exactly once after a successful save', async () => {
    const order: string[] = [];
    const pending = { current: (() => { order.push('action'); }) as (() => void) | null };

    await settleUnsavedWithSave(pending, {
      currentFilePath: '/Users/a/report.pdf',
      saveToPath: () => { order.push('save'); return Promise.resolve(); },
      saveAs: vi.fn(),
    }, () => { order.push('close'); });

    expect(order).toEqual(['save', 'close', 'action']);
    expect(pending.current).toBeNull();
  });
});

// J-19: a signed document whose change cannot be appended is refused by the
// backend with a typed reason, and the app answers with an unsigned copy.
describe('signed-document save refusal', () => {
  it('recognises the backend refusal by its code', () => {
    expect(isSignedSaveRefusal(
      'signed-document-needs-full-rewrite: this document is signed, and the redaction removes content…',
    )).toBe(true);
    expect(isSignedSaveRefusal('Failed to save PDF: No space left on device')).toBe(false);
  });

  it('answers the refusal with the dialog alone, every other failure with the error stack', () => {
    expect(routeCommandFailure('signed-document-needs-full-rewrite: this document is signed…')).toBe('signed-save-dialog');
    expect(routeCommandFailure('Failed to save PDF: No space left on device')).toBe('error-stack');
  });

  it('saves the unsigned copy through its own command, never over the signed file', async () => {
    const commands: string[] = [];
    const invoke = (<T,>(command: string) => {
      commands.push(command);
      return Promise.resolve('/Users/a/redacted-copy.pdf' as unknown as T);
    }) as InvokeFn;
    const onSaved = vi.fn();
    const result = await saveAsWithDialog(invoke, onSaved, 'save_unsigned_copy_as_dialog');
    expect(commands).toEqual(['save_unsigned_copy_as_dialog']);
    expect(result).toEqual({ status: 'saved', path: '/Users/a/redacted-copy.pdf' });
    expect(onSaved).toHaveBeenCalledWith('/Users/a/redacted-copy.pdf');
  });
});
