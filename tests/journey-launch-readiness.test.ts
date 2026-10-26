// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Launch readiness of the journey suite (tests/journeys/lib/launch-readiness.ts,
// launch-hygiene.ts, launch-diagnostics.ts). Three Windows journeys (J-21, J-41,
// J-44) failed "waiting for [data-has-document=true]" with an empty list of
// test ids after a launch that had reported success: a ping is answered by a
// blank page too. These tests hold what replaced it.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  MEASURED_LAUNCH_MS, PING_BUDGET_MS, ShellNotMountedError, classifyStall, isShellReady, shellBudgetMs, waitForShell, type PingState,
} from './journeys/lib/launch-readiness';

const state = (o: Partial<PingState> = {}): PingState => ({
  readyState: 'complete', href: 'http://tauri.localhost/', shellMounted: true, hasDocument: false, rootChildren: 1, scriptBytes: 2_900_000, ...o,
});

/** A clock that only moves when somebody sleeps, so a 150 s wait costs no time. */
function fakeClock(): { now(): number; sleep(ms: number): Promise<void> } {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

describe('launch readiness: the shell, not the ping', () => {
  it('is not ready on a page that merely answers (blank, loading, nothing rendered)', () => {
    expect(isShellReady(null)).toBe(false);
    expect(isShellReady(state({ href: 'about:blank', shellMounted: false, rootChildren: 0 }))).toBe(false);
    expect(isShellReady(state({ readyState: 'loading', shellMounted: false, rootChildren: 0 }))).toBe(false);
    expect(isShellReady(state({ shellMounted: false, rootChildren: 0 }))).toBe(false);
    expect(isShellReady(state({ readyState: 'interactive' }))).toBe(false);
    expect(isShellReady(state())).toBe(true);
  });

  it('waits through a slow start and returns how long it took', async () => {
    const clock = fakeClock();
    let calls = 0;
    const r = await waitForShell(async () => {
      calls += 1;
      return calls < 40 ? state({ readyState: 'loading', shellMounted: false, rootChildren: 0 }) : state();
    }, 150_000, clock);
    expect(calls).toBe(40);
    expect(r.ms).toBeGreaterThanOrEqual(39 * 250);
  });

  it('keeps polling after a probe that throws (a busy web view), and says the last error if it never recovers', async () => {
    const clock = fakeClock();
    await expect(waitForShell(async () => { throw new Error('no answer to ping within 15000 ms'); }, 5_000, clock))
      .rejects.toThrow(/never answered a script.*no answer to ping within 15000 ms/s);
  });

  it('fails at the budget, naming where the start-up stopped', async () => {
    const clock = fakeClock();
    const stuck = state({ readyState: 'loading', shellMounted: false, rootChildren: 0, scriptBytes: 1234 });
    const err = await waitForShell(async () => stuck, 150_000, clock).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShellNotMountedError);
    const e = err as ShellNotMountedError;
    expect(e.message).toMatch(/never showed the editor within 150 s/);
    expect(e.message).toMatch(/readyState=loading, 1234 bytes of script/);
    expect(e.last).toEqual(stuck);
  });

  it('tells the stalls apart', () => {
    expect(classifyStall(null)).toMatch(/never answered a script/);
    expect(classifyStall(state({ href: 'about:blank', readyState: 'complete', shellMounted: false, rootChildren: 0 }))).toMatch(/about:blank.*never navigated/);
    expect(classifyStall(state({ readyState: 'loading', shellMounted: false }))).toMatch(/still loading/);
    expect(classifyStall(state({ shellMounted: false, rootChildren: 0 }))).toMatch(/React rendered nothing/);
    expect(classifyStall(state({ shellMounted: false, rootChildren: 2 }))).toMatch(/error screen/);
  });
});

describe('launch budgets come from measurement, not from a round number', () => {
  it('gives a cold start more than the measured p99, and less than a journey may take', () => {
    expect(shellBudgetMs(true)).toBeGreaterThan(MEASURED_LAUNCH_MS.coldP99);
    // ping + shell must fit the journey's default 300 s with room for its body.
    expect(PING_BUDGET_MS + shellBudgetMs(true)).toBeLessThanOrEqual(240_000);
  });

  it('is not the old 60 s that a cold start ran past', () => {
    expect(shellBudgetMs(true)).toBeGreaterThan(MEASURED_LAUNCH_MS.coldP90);
    expect(shellBudgetMs(true)).toBeGreaterThan(shellBudgetMs(false));
    expect(shellBudgetMs(false)).toBeGreaterThan(MEASURED_LAUNCH_MS.warmMedian * 10);
  });
});

describe('the page agent reports what readiness is judged on', () => {
  function ping(dom: { root?: number; shell?: boolean; href?: string; readyState?: string }): PingState {
    const src = readFileSync('tests/journeys/lib/page-agent.js', 'utf8');
    const win: Record<string, unknown> = { fetch: Object.assign(() => undefined, { __pjWrapped: true }) };
    const document = {
      readyState: dom.readyState ?? 'complete', title: 'PDFluent',
      getElementById: () => (dom.root === undefined ? null : { childElementCount: dom.root }),
      querySelector: (sel: string) => (sel === '[data-has-document]' && dom.shell ? {} : null),
    };
    vm.runInNewContext(src, {
      window: win, document, location: { href: dom.href ?? 'http://tauri.localhost/' }, setTimeout,
      performance: { getEntriesByType: () => [{ name: 'http://tauri.localhost/assets/index.js', initiatorType: 'script', transferSize: 1000 }] },
    });
    return (win.__pj as { ping(): PingState }).ping();
  }

  it('says whether the shell is mounted, which page it is, and how much script arrived', () => {
    expect(ping({ root: 1, shell: true })).toMatchObject({ shellMounted: true, rootChildren: 1, href: 'http://tauri.localhost/', scriptBytes: 1000 });
    expect(ping({ root: 0, shell: false, href: 'about:blank' })).toMatchObject({ shellMounted: false, rootChildren: 0, href: 'about:blank' });
    expect(ping({ shell: false })).toMatchObject({ shellMounted: false, rootChildren: 0 });
  });
});

describe('the driver waits for the shell, and the journey keeps the document separate', () => {
  const driver = readFileSync('tests/journeys/lib/driver.ts', 'utf8');
  const journey = readFileSync('tests/journeys/lib/journey.ts', 'utf8');

  it('does not call a start-up ready on a ping alone, and has no fixed 60 s start-up wait left', () => {
    expect(driver).toContain('waitForShell(');
    expect(driver).toContain('shellBudgetMs(coldProfile)');
    expect(driver).not.toMatch(/const ready = Date\.now\(\) \+ 60_000/);
  });

  it('writes evidence before it kills a launch that did not finish', () => {
    const fail = driver.slice(driver.indexOf('const failWith'), driver.indexOf('// 2. The web view answers'));
    expect(fail.indexOf('session.evidence(')).toBeGreaterThan(-1);
    expect(fail.indexOf('session.evidence(')).toBeLessThan(fail.indexOf('session.kill()'));
  });

  it('puts the evidence outside what the judge reads', () => {
    expect(journey).toContain("'launch-failures'");
    expect(readFileSync('scripts/quality/journey-results.mjs', 'utf8')).toMatch(/\^J-\[0-9A-F\]\{2\}\\\.json\$/);
  });

  it('says "the document did not open" for a timeout after a mounted shell, with evidence', () => {
    expect(journey).toMatch(/the editor was running but the document did not open/);
    expect(journey).toContain("evidenceDirFor(id, 'document')");
  });
});
