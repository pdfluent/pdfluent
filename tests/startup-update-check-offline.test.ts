// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// B67, "works without an internet connection": the automatic update check runs
// 5 s after start and talks to the network. When it cannot (no connection, a
// timeout, a DNS failure, a refused handshake) the app must carry on and say
// nothing: no error toast, no banner, no unhandled rejection. The sibling
// startup-update-check-gate.test.ts holds the on/off setting; this file holds
// the failure path, which until now rested on reading the code.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { checkMock } = vi.hoisted(() => ({ checkMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(), exit: vi.fn() }));

import { scheduleStartupUpdateCheck } from '../src/lib/updater';

/** What the failure looks like from the updater plugin, per cause. */
const FAILURES: Array<[string, unknown]> = [
  ['no connection (network is down)', new Error('error sending request for url (https://updates.pdfluent.com/latest.json): error trying to connect: tcp connect error: Network is unreachable')],
  ['a DNS failure', new Error('error sending request for url: dns error: failed to lookup address information: Name or service not known')],
  ['a timeout', new Error('error sending request for url: operation timed out')],
  ['a refused TLS handshake', new Error('error sending request for url: error trying to connect: invalid peer certificate')],
  ['a non-Error rejection (the plugin rejects with a string)', 'Could not fetch a valid release JSON from the remote'],
];

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };

beforeEach(() => {
  vi.useFakeTimers();
  checkMock.mockReset();
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  vi.useRealTimers();
});

/** The callbacks ViewerApp passes at startup: failure is silent. */
function silentStartup() {
  return {
    onUpdateAvailable: vi.fn(async () => false),
    onUpdateInstalled: vi.fn(),
    onError: vi.fn(),
  };
}

describe('the startup update check when the network fails', () => {
  it.each(FAILURES)('carries on quietly after %s', async (_name, failure) => {
    checkMock.mockRejectedValue(failure);
    const callbacks = silentStartup();

    scheduleStartupUpdateCheck(callbacks);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(checkMock).toHaveBeenCalledTimes(1); // it did try
    expect(callbacks.onUpdateAvailable).not.toHaveBeenCalled(); // no banner
    expect(callbacks.onUpdateInstalled).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledTimes(1); // handed to the silent handler, once
    expect(unhandled).toEqual([]); // nothing escapes as an unhandled rejection
  });

  it('does not retry in a loop: one failed attempt is the only attempt', async () => {
    checkMock.mockRejectedValue(new Error('offline'));
    scheduleStartupUpdateCheck(silentStartup());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it('a check that never answers leaves the app alone: no error, no banner, nothing pending after teardown', async () => {
    checkMock.mockReturnValue(new Promise(() => { /* the request hangs */ }));
    const callbacks = silentStartup();
    const cancel = scheduleStartupUpdateCheck(callbacks);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onUpdateAvailable).not.toHaveBeenCalled();
    cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('what ViewerApp does with that failure', () => {
  const source = readFileSync(new URL('../src/viewer/ViewerApp.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('scheduleStartupUpdateCheckIfEnabled({');
  const block = source.slice(start, source.indexOf('});', start));

  it('passes a startup onError that does nothing (no toast, no state, no log call)', () => {
    expect(start).toBeGreaterThan(0);
    const onError = block.slice(block.indexOf('onError:'));
    // an empty arrow function body, possibly with a comment
    expect(onError).toMatch(/^onError:\s*\(\)\s*=>\s*\{\s*(\/\*[^*]*\*\/)?\s*\}/);
  });

  it('never routes the startup check through the command bridge (which toasts every failure)', () => {
    expect(block).not.toMatch(/invokeCommand|reportCommandFailure|setAppErrors|reportFallback/);
  });
});
