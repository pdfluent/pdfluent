// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-84: the Autosave setting now does something. While it is on and there are
// unsaved changes, a recovery copy is written on a timer; restoring a copy
// opens it as unsaved work on the original file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { restoreRecoveryCopy, startRecoveryCopies, type RecoveryRecord } from '../recoveryCopy';
import type { InvokeFn } from '../saveFlow';

describe('startRecoveryCopies', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes a copy on each interval while enabled and dirty', async () => {
    const write = vi.fn(() => Promise.resolve(true));
    const stop = startRecoveryCopies({ isEnabled: () => true, isDirty: () => true, write }, 1000);
    await vi.advanceTimersByTimeAsync(3500);
    stop();
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('writes nothing for a clean document or when the setting is off', async () => {
    const write = vi.fn(() => Promise.resolve(true));
    let enabled = true;
    let dirty = false;
    const stop = startRecoveryCopies({ isEnabled: () => enabled, isDirty: () => dirty, write }, 1000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(write).not.toHaveBeenCalled();
    dirty = true;
    enabled = false;
    await vi.advanceTimersByTimeAsync(2500);
    expect(write).not.toHaveBeenCalled();
    enabled = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps going after a failed write, and never runs two at once', async () => {
    let resolveFirst: (() => void) | undefined;
    const write = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockImplementationOnce(() => Promise.reject(new Error('disk full')))
      .mockImplementation(() => Promise.resolve(true));
    const onError = vi.fn();
    const stop = startRecoveryCopies({ isEnabled: () => true, isDirty: () => true, write, onError }, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops writing once stopped', async () => {
    const write = vi.fn(() => Promise.resolve(true));
    const stop = startRecoveryCopies({ isEnabled: () => true, isDirty: () => true, write }, 1000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('restoreRecoveryCopy', () => {
  const record: RecoveryRecord = { originalPath: '/Users/a/report.pdf', savedAt: 1_760_000_000, appVersion: '1.0.1' };

  it('opens the copy as unsaved work on the original file, then empties the slot', async () => {
    const calls: string[] = [];
    const invoke = (<T,>(cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? `${cmd} ${JSON.stringify(args)}` : cmd);
      return Promise.resolve((cmd === 'restore_recovery' ? '/data/recovery/restored-1.pdf' : undefined) as T);
    }) as InvokeFn;
    const open = vi.fn(() => Promise.resolve());
    const onRestored = vi.fn();
    await restoreRecoveryCopy(record, { invoke, open, onRestored });
    expect(open).toHaveBeenCalledWith('/data/recovery/restored-1.pdf');
    expect(onRestored).toHaveBeenCalledWith('/Users/a/report.pdf');
    expect(calls).toEqual([
      'restore_recovery',
      'adopt_recovered_document {"originalPath":"/Users/a/report.pdf"}',
      'discard_recovery',
    ]);
  });

  it('keeps the slot when the copy does not open', async () => {
    const calls: string[] = [];
    const invoke = (<T,>(cmd: string) => { calls.push(cmd); return Promise.resolve('/x.pdf' as unknown as T); }) as InvokeFn;
    await expect(restoreRecoveryCopy(record, {
      invoke, open: () => Promise.reject(new Error('Failed to parse PDF')), onRestored: vi.fn(),
    })).rejects.toThrow('parse');
    expect(calls).toEqual(['restore_recovery']);
  });
});
