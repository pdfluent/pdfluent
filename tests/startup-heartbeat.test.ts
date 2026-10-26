// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The startup watchdog (src-tauri/src/startup_watchdog.rs) tells a slow start
// from a dead web view by this heartbeat. It must beat while loading, stop
// when told, and be loaded by index.html as a same-origin classic script
// (the CSP has script-src 'self' only).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const script = readFileSync(join(root, 'public/startup-heartbeat.js'), 'utf8');

function run(win: Record<string, unknown>): void {
  vm.runInNewContext(script, { window: win, setInterval, clearInterval });
}

afterEach(() => vi.useRealTimers());

describe('startup heartbeat', () => {
  it('is loaded by index.html as an external classic script', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/<script src="\/startup-heartbeat\.js"><\/script>/);
  });

  it('beats at once and every 2 s until stopped', () => {
    vi.useFakeTimers();
    const invoke = vi.fn(() => Promise.resolve());
    const win: Record<string, unknown> = { __TAURI_INTERNALS__: { invoke } };
    run(win);
    expect(invoke).toHaveBeenCalledWith('frontend_heartbeat');
    expect(invoke).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(invoke).toHaveBeenCalledTimes(4);
    (win.__pdfluentStopHeartbeat as () => void)();
    vi.advanceTimersByTime(10_000);
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it('does nothing outside Tauri', () => {
    expect(() => run({})).not.toThrow();
  });

  it('survives a rejecting or throwing invoke', () => {
    vi.useFakeTimers();
    expect(() => run({ __TAURI_INTERNALS__: { invoke: () => Promise.reject(new Error('x')) } })).not.toThrow();
    expect(() => run({ __TAURI_INTERNALS__: { invoke: () => { throw new Error('x'); } } })).not.toThrow();
  });

  it('main.tsx stops the heartbeat once the app reported ready', () => {
    const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
    expect(main).toContain('__pdfluentStopHeartbeat');
  });
});
