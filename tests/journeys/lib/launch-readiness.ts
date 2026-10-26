// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What "the app has started" means to the journey suite, in three separate
// questions with three separate budgets:
//
//   1. a WebDriver session exists   (msedgedriver started the app)
//   2. the web view answers a ping  (a script can run in it)
//   3. the app shell is mounted     (React rendered; this is "ready")
//
// and only then, in the journey: 4. the document is open.
//
// Until now (2) was taken for (3). A ping runs in whatever page the web view
// has, `about:blank` or an index.html that is still loading, so a launch
// "succeeded" with a window that was blank, and the journey's own
// `waitForDocument` (60 s) then spent its budget on a start-up that had never
// finished. Run 39889390284 (J-21, J-41, J-44) and run 39852607758 attempt 1
// (7 journeys) all failed that way: the app log ended at `perf setup_done`
// with no `page_loaded`, and the journey said only "waiting for
// [data-has-document="true"]", which names the document and not the stall.

/** What the page agent's `ping` reports (tests/journeys/lib/page-agent.js). */
export interface PingState {
  readyState: string;
  href: string;
  /** `[data-has-document]` exists: the V3 shell rendered, with or without a document. */
  shellMounted: boolean;
  hasDocument: boolean;
  /** Children of #root: 0 means React has not rendered anything. */
  rootChildren: number;
  /** Bytes of script the page has fetched so far (performance entries), to tell "slow" from "stuck". */
  scriptBytes: number;
}

/**
 * Measured launch times of the Windows journey run 39889390284 (artifact
 * journeys-windows, steps[].launchMs of all 68 journeys, 62 first launches in a
 * journey and 17 relaunches), in milliseconds. These are what the budgets below
 * are derived from; tests/journey-launch-readiness.test.ts holds the budgets
 * above them.
 *
 *   first launch in a journey (new web view profile)  median 32 000, p90 76 553, max 122 903
 *   relaunch in the same journey (profile kept)       median  3 522, p90 63 271, max  63 334
 *
 * The first launch is ~9 times the relaunch: the cost is the creation of a
 * WebView2 profile on a runner that scans every new file, not the app. The max
 * of the first launches includes a 60 s wait that was repeated once, so the
 * honest p99 of one start is just under it: 120 s.
 */
export const MEASURED_LAUNCH_MS = {
  coldMedian: 32_000,
  coldP90: 76_553,
  coldP99: 120_000,
  warmMedian: 3_522,
  warmP90: 63_271,
} as const;

/** The web view answers a ping. Bounded on its own: a dead web view must not eat the shell budget. */
export const PING_BUDGET_MS = 60_000;

/**
 * How long the app shell may take to mount after the web view answers.
 * Cold = a profile that does not exist yet (the first start of a journey);
 * the budget is the measured p99 with a quarter on top. Warm = a profile that
 * was used before. Neither is a retry loop: a start that has not mounted by
 * then is reported with its evidence, not started again behind the journey's back.
 */
export function shellBudgetMs(coldProfile: boolean): number {
  return coldProfile ? Math.round(MEASURED_LAUNCH_MS.coldP99 * 1.25) : 90_000;
}

/** Why a start-up that did not finish did not finish, from what the page said. */
export function classifyStall(state: PingState | null): string {
  if (state === null) return 'the web view never answered a script (no page to ask)';
  if (state.href === '' || state.href === 'about:blank') {
    return `the web view is on ${state.href || 'no page'}: index.html was never navigated to or never started loading`;
  }
  if (state.readyState !== 'complete') {
    return `index.html is still loading after the budget (readyState=${state.readyState}, ${state.scriptBytes} bytes of script fetched)`;
  }
  if (state.rootChildren === 0) {
    return 'index.html loaded but React rendered nothing into #root (the bundle did not run, or threw before the first render)';
  }
  if (!state.shellMounted) {
    return `#root has ${state.rootChildren} child(ren) but not the editor shell: an error screen or a different view is showing`;
  }
  return 'the shell is mounted';
}

export function isShellReady(state: PingState | null): boolean {
  return state !== null && state.readyState === 'complete' && state.shellMounted;
}

export class ShellNotMountedError extends Error {
  constructor(readonly budgetMs: number, readonly elapsedMs: number, readonly last: PingState | null, readonly lastError: string) {
    super(
      `the app started but its window never showed the editor within ${Math.round(budgetMs / 1000)} s ` +
      `(waited ${Math.round(elapsedMs / 1000)} s): ${classifyStall(last)}${lastError ? `; last error: ${lastError}` : ''}`,
    );
    this.name = 'ShellNotMountedError';
  }
}

export interface WaitClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const REAL_CLOCK: WaitClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * Ask `probe` until the shell is mounted or `budgetMs` has passed. A probe that
 * throws (the web view is busy, the script timed out) is a "not yet", and its
 * last message is kept for the report. Resolves with how long it took.
 */
export async function waitForShell(
  probe: () => Promise<PingState>,
  budgetMs: number,
  clock: WaitClock = REAL_CLOCK,
  pollMs = 250,
): Promise<{ ms: number; state: PingState }> {
  const started = clock.now();
  let last: PingState | null = null;
  let lastError = '';
  for (;;) {
    try {
      last = await probe();
      lastError = '';
      if (isShellReady(last)) return { ms: clock.now() - started, state: last };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (clock.now() - started >= budgetMs) throw new ShellNotMountedError(budgetMs, clock.now() - started, last, lastError);
    await clock.sleep(pollMs);
  }
}
