// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The frontend half of the crash-free-sessions metric. The counting itself is
// Rust (src-tauri/src/session_log.rs, unit-tested there); this covers the part
// that decides what a person is shown and what therefore gets sent.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// The command bridge is the only door to the backend (#413); mocking it is
// mocking the door, not the transport underneath it.
const { invokeMock, logMock, tauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  logMock: vi.fn(),
  tauriMock: vi.fn(() => true),
}));
vi.mock('../src/lib/commandBridge', () => ({
  invokeCommand: invokeMock,
  logToApp: logMock,
  describeError: (e: unknown) => String(e),
}));
vi.mock('../src/lib/updater', () => ({ isTauriRuntime: tauriMock }));

import {
  describeReliability,
  readSessionReliability,
  withReliabilityNote,
} from '../src/lib/telemetry/sessions';

beforeEach(() => {
  invokeMock.mockReset();
  logMock.mockReset();
  tauriMock.mockReturnValue(true);
});

describe('describeReliability', () => {
  it('states the pair count and the percentage', () => {
    expect(
      describeReliability({ finished: 200, cleanQuits: 199, crashFreePercent: 99.5 }),
    ).toBe('sessions: 200 finished, 199 ended cleanly (99.5% crash-free)');
  });

  it('says nothing at all when no session has finished yet', () => {
    // A first run has no history. "0% crash-free" would be a lie about a
    // product that has not crashed once.
    expect(describeReliability({ finished: 0, cleanQuits: 0, crashFreePercent: null })).toBeNull();
  });
});

describe('readSessionReliability', () => {
  it('maps the snake_case shape the command returns', async () => {
    invokeMock.mockResolvedValue({ finished: 3, clean_quits: 2, crash_free_percent: 66.7 });
    await expect(readSessionReliability()).resolves.toEqual({
      finished: 3,
      cleanQuits: 2,
      crashFreePercent: 66.7,
    });
    expect(invokeMock).toHaveBeenCalledWith('session_reliability');
  });

  it('returns null rather than throwing when the command fails', async () => {
    // A crash report must never fail because a statistic was unavailable. The
    // bridge has already reported it; this logs and carries on without it.
    invokeMock.mockRejectedValue(new Error('no such command'));
    await expect(readSessionReliability()).resolves.toBeNull();
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('no such command'));
  });

  it('does not ask a runtime that has no backend', async () => {
    // In a browser or the browser-test build there is nothing to count, and
    // asking would put "command session_reliability failed" on screen.
    tauriMock.mockReturnValue(false);
    await expect(readSessionReliability()).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('withReliabilityNote', () => {
  it('appends one line to the message that is shown and sent', () => {
    expect(
      withReliabilityNote('panicked at src/lib.rs:12', {
        finished: 3,
        cleanQuits: 2,
        crashFreePercent: 66.7,
      }),
    ).toBe('panicked at src/lib.rs:12\n\nsessions: 3 finished, 2 ended cleanly (66.7% crash-free)');
  });

  it('leaves the message untouched when there is nothing to say', () => {
    expect(withReliabilityNote('boom', null)).toBe('boom');
    expect(
      withReliabilityNote('boom', { finished: 0, cleanQuits: 0, crashFreePercent: null }),
    ).toBe('boom');
  });

  it('never adds the line twice', () => {
    // The dialog builds a preview and then builds the payload again on submit.
    const stats = { finished: 2, cleanQuits: 2, crashFreePercent: 100 };
    const once = withReliabilityNote('boom', stats);
    expect(withReliabilityNote(once, stats)).toBe(once);
  });
});
