// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// One journey = one test. `journey('J-xx', ...)` registers it with vitest,
// gives it a fresh working folder and a launched app, and writes a result
// file the CI job and docs/JOURNEY_TESTS.json are checked against.
//
// Known gaps. Some journeys fail today because the product does not do what
// it promises yet (OCR, XFA filling, ...). Such a journey is still written
// out in full, and the step that cannot pass is wrapped in `j.gap(id, ...)`
// with the same id listed under that journey's `gaps` in
// docs/JOURNEY_TESTS.json, with its owner. Every step before and after it
// must pass as usual. Inside a listed gap the step must FAIL: when it starts
// passing, the test goes red and asks for the entry to be removed — a gap
// cannot quietly outlive its fix. A gap is never a pass: the result file says
// `known-gap` and the feature gate (stream D, editor-features.json v2)
// treats it as not proven. It is said on stderr as `KNOWN-GAP (not a pass)`.
//
// Faults. Every journey is also judged on what the app showed that nobody
// asked for: an error toast ("'<command>' did not complete"), a console.error,
// an uncaught exception, an unhandled rejection (tests/lib/fault-watch.js,
// read back after the body, and before any relaunch closes the page). A fault
// the journey does not list in lib/expected-faults.ts, with a written reason,
// fails the journey with the text the owner would have seen. A journey about a
// failure path lists the failure; a bug is never listed away.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'vitest';
import { launch, type LaunchTimings, type Session } from './driver';
import { driverKind, missingPrerequisite, platform, REQUIRED, repoFile, watchdogEnv } from './env';
import { launchesStopped, recordLaunch } from './launch-breaker';
import { describeFaults, resolveFaults, validateExpectations, type ExpectedFault, type Fault, type Judgement } from '../../lib/fault-guard';
import { EXPECTED_FAULTS } from './expected-faults';
import * as pdfcheck from './pdfcheck';
import { grant, sandboxedApp } from './sandbox';

interface GapEntry { id: string; owner: string; reason: string; tracker?: string; platforms?: string[] }
interface JourneyEntry { title: string; priority: string; spec: string; gaps?: GapEntry[]; platforms: string[] }
interface JourneyMap { journeys: Record<string, JourneyEntry> }

const MAP = JSON.parse(readFileSync(repoFile('docs/JOURNEY_TESTS.json'), 'utf8')) as JourneyMap;

export interface StartOptions {
  /** Fixture (repo-relative) copied into the work folder and opened at launch. */
  open?: string;
  /** Name for the copy; default the fixture's own name. */
  as?: string;
  /** Extra environment for the app. */
  env?: Record<string, string>;
  /** Do not wait for a document to show (no fixture, or one that must not open). */
  noDocument?: boolean;
  /** Leave start-up dialogs (recovery offer) for the journey to judge. */
  keepStartupDialogs?: boolean;
  /**
   * Run the app inside the Mac App Store sandbox (macOS only; lib/sandbox.ts):
   * it can touch the document it is asked to open, the paths the journey
   * answers a panel with, and nothing else.
   */
  sandbox?: boolean;
}

export interface Journey {
  readonly id: string;
  readonly work: string;
  s: Session;
  /** Copy a repo fixture into the work folder; returns the copy's path. */
  fixture(rel: string, as?: string): string;
  /** A path in the work folder. */
  file(name: string): string;
  start(o?: StartOptions): Promise<Session>;
  /** Close the current session (app gone) — for journeys that relaunch. */
  stop(): Promise<void>;
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  gap(id: string, fn: () => Promise<void>): Promise<void>;
  inspect: typeof pdfcheck.inspect;
  waitFor(selector: string, o?: { timeout?: number; state?: 'visible' | 'gone' | 'attached'; text?: string }): Promise<void>;
  /** Wait for the document view, with `pages` pages when given. */
  waitForDocument(pages?: number): Promise<void>;
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  /** Answer the next JS-side dialog of `kind` (open/save: a path or null; message: true = OK/Yes). */
  answerDialog(kind: 'open' | 'save' | 'message', value: string | string[] | boolean | null): Promise<void>;
  /**
   * Give the sandboxed app access to `paths` the way the system does when a
   * person drops a file on the window or picks it in a panel. A no-op when
   * the app is not sandboxed.
   */
  allow(...paths: string[]): Promise<void>;
  /** Answer the next native dialogs opened from Rust (Save As, attachments); null cancels. */
  answerNativeDialogs(...answers: Array<string | null>): Promise<void>;
  /** Dialogs the app opened that nobody queued an answer for. */
  unexpectedDialogs(): Promise<Array<{ kind: string; args: string }>>;
  /** Whether the dirty marker says the document has unsaved changes. */
  backendDirty(): Promise<boolean>;
  /** The platform's primary modifier: Cmd on macOS, Ctrl elsewhere. */
  readonly mod: 'meta' | 'ctrl';
  note(msg: string): void;
  /** Every fault the app showed or logged so far in this journey, across relaunches (tests/lib/fault-watch.js). */
  faults(): Promise<Fault[]>;
}

function say(line: string): void {
  process.stderr.write(`${line}\n`);
}

function writeResult(id: string, result: Record<string, unknown>): void {
  const dir = process.env.PDFLUENT_JOURNEY_RESULTS;
  if (!dir) return;
  const d = path.join(dir, platform());
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, `${id}.json`), `${JSON.stringify(result, null, 2)}\n`);
}

/**
 * Register journey `id`. The title comes from docs/JOURNEY_TESTS.json, so the
 * mapping and the test cannot disagree about what is being proven.
 */
export function journey(id: string, body: (j: Journey) => Promise<void>, timeoutMs = 300_000): void {
  const entry = MAP.journeys[id];
  if (!entry) throw new Error(`${id} is not in docs/JOURNEY_TESTS.json`);
  const plat = platform();
  const expectedFaults: readonly ExpectedFault[] = EXPECTED_FAULTS[id] ?? [];
  const badExpectations = validateExpectations(expectedFaults, id);
  if (badExpectations.length > 0) throw new Error(badExpectations.join('; '));
  const listed = (entry.gaps ?? []).filter((g) => !g.platforms || g.platforms.includes(plat));
  if (!entry.platforms.includes(plat)) {
    // Out of scope here by the mapping, not by circumstance: said, and the
    // judge does not expect a result for it on this platform.
    say(`SKIPPED (not a pass): ${id} runs on ${entry.platforms.join(', ')} only (docs/JOURNEY_TESTS.json)`);
    it.skip(`${id} ${entry.title}`, () => undefined);
    return;
  }

  it(`${id} ${entry.title}`, async (ctx) => {
    const started = Date.now();
    const missing = missingPrerequisite();
    if (missing) {
      writeResult(id, { id, platform: plat, status: 'skipped', reason: missing });
      if (REQUIRED) throw new Error(`${id}: ${missing} (PDFLUENT_JOURNEYS_REQUIRED=1)`);
      say(`SKIPPED (not a pass): ${id} — ${missing}`);
      ctx.skip();
      return;
    }
    const work = mkdtempSync(path.join(process.env.PDFLUENT_JOURNEY_TMP ?? os.tmpdir(), `pdfluent-${id}-`));
    const steps: Array<{ name: string; ms: number; ok: boolean; error?: string; launchMs?: number; phases?: LaunchTimings }> = [];
    const gapsHit: Array<{ id: string; owner: string; failure: string }> = [];
    const notes: string[] = [];
    // Faults of every session this journey had, taken before each one closed.
    const faultsSeen: Fault[] = [];
    const warningsSeen: Fault[] = [];
    let faultsTaken = 0;
    let warningsTaken = 0;
    // Assigned inside the closures below; the cast keeps TypeScript from narrowing it to null here.
    let session = null as Session | null;

    // Take what the current page has recorded since the last take. A session
    // that is already gone (a journey that kills the app) has nothing to say.
    const harvest = async (): Promise<void> => {
      if (!session) return;
      try {
        const all = await session.call<Fault[]>('faults');
        faultsSeen.push(...all.slice(faultsTaken));
        faultsTaken = all.length;
        const warnings = await session.call<Fault[]>('faultWarnings');
        warningsSeen.push(...warnings.slice(warningsTaken));
        warningsTaken = warnings.length;
      } catch (e) {
        notes.push(`faults could not be read from the page: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    // Close the current session after taking its faults; the next one starts counting again.
    const closeSession = async (): Promise<void> => {
      if (!session) return;
      await harvest();
      await session.close();
      session = null;
      faultsTaken = 0;
      warningsTaken = 0;
    };

    // True while the running app is the sandboxed one: every path a panel is
    // answered with must then be granted first, as the panel itself would.
    let sandboxed = false;
    const grantForPanel = async (paths: Array<string | null>): Promise<void> => {
      const real = paths.filter((p): p is string => typeof p === 'string');
      if (!sandboxed || real.length === 0) return;
      await j.invoke('e2e_sandbox_grant', { tokens: grant(...real) });
    };

    const j: Journey = {
      id,
      work,
      get s(): Session {
        if (!session) throw new Error(`${id}: no app session; call j.start() first`);
        return session;
      },
      set s(v: Session) { session = v; },
      mod: process.platform === 'darwin' ? 'meta' : 'ctrl',
      fixture(rel, as) {
        const dest = path.join(work, as ?? path.basename(rel));
        copyFileSync(repoFile(rel), dest);
        return dest;
      },
      file(name) { return path.join(work, name); },
      async start(o = {}) {
        // Progress goes to the job log as it happens: a reporter that prints on
        // completion shows nothing for a journey that hangs.
        console.error(`journeys: ${id} starts the app`);
        await closeSession();
        const args: string[] = [];
        if (o.open) args.push(o.open.startsWith(work) ? o.open : j.fixture(o.open, o.as));
        const appData = path.join(work, 'home');
        mkdirSync(appData, { recursive: true });
        const env: Record<string, string> = {
          PDFLUENT_E2E_PRINT_CAPTURE: path.join(work, 'print-capture.txt'),
          PDFLUENT_E2E_LANG: 'en',
          ...watchdogEnv(driverKind()),
          ...(o.env ?? {}),
        };
        // macOS and Linux resolve the app's data and settings folders from
        // HOME, so each launch starts with no recent files, no recovery copy
        // and no settings of an earlier journey. Windows resolves them from
        // the profile; the launch below dismisses what an earlier run left.
        // Not in the sandbox: there the system gives the app its container as HOME.
        if (process.platform !== 'win32' && !o.sandbox) env.HOME = appData;
        sandboxed = o.sandbox === true;
        let appPath = process.env.PDFLUENT_E2E_APP as string;
        if (o.sandbox) {
          if (process.platform !== 'darwin') throw new Error(`${id}: sandbox: true is for macOS`);
          appPath = sandboxedApp();
          // The bridge folder (the harness talks to the app through it), the
          // print capture, and the document the app is asked to open: what a
          // person's launch would have granted. Nothing else.
          const bridge = path.join(work, 'bridge');
          mkdirSync(path.join(bridge, 'in'), { recursive: true });
          mkdirSync(path.join(bridge, 'out'), { recursive: true });
          const tokens = grant(bridge, path.join(work, 'print-capture.txt'), ...args);
          env.PDFLUENT_E2E_SANDBOX_TOKENS = tokens.join('\n');
        }
        // Timed into the result file, so a slow runner shows where the time goes.
        const t = Date.now();
        const stopped = launchesStopped(process.env.PDFLUENT_JOURNEY_RESULTS);
        if (stopped) throw new Error(`${id}: ${stopped}`);
        // Windows: the web view keeps its profile (localStorage: the theme, the
        // language) in the journey's own folder, so a restart inside the
        // journey finds it and the next journey starts clean. macOS and Linux
        // get the same from HOME above.
        const profileDir = process.platform === 'win32' ? path.join(work, 'webview2') : undefined;
        try {
          session = await launch({
            app: appPath, args, env, workDir: work, profileDir,
            evidenceDir: evidenceDirFor(id, 'launch'), appLog: () => appLogSince(started),
          });
        } catch (e) {
          recordLaunch(process.env.PDFLUENT_JOURNEY_RESULTS, e instanceof Error ? e.message : String(e));
          throw e;
        }
        recordLaunch(process.env.PDFLUENT_JOURNEY_RESULTS);
        const launched = Date.now() - t;
        if (!o.keepStartupDialogs) await settleStartup(session);
        if (o.open && !o.noDocument && !o.keepStartupDialogs) await j.waitForDocument();
        steps.push({ name: 'launch the app (until ready)', ms: Date.now() - t, ok: true, launchMs: launched, ...(session.timings ? { phases: session.timings } : {}) });
        return session;
      },
      async stop() {
        await closeSession();
      },
      async step(name, fn) {
        const t = Date.now();
        console.error(`journeys: ${id} step "${name}"`);
        try {
          const v = await fn();
          steps.push({ name, ms: Date.now() - t, ok: true });
          return v;
        } catch (e) {
          steps.push({ name, ms: Date.now() - t, ok: false, error: String(e) });
          console.error(`journeys: ${id} step "${name}" failed after ${Date.now() - t} ms`);
          throw new Error(`${id} step "${name}": ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      async gap(gapId, fn) {
        const g = listed.find((x) => x.id === gapId);
        if (!g) {
          await j.step(`gap ${gapId} (closed)`, fn);
          return;
        }
        let failure: string | null = null;
        try { await fn(); } catch (e) { failure = e instanceof Error ? e.message : String(e); }
        if (failure === null) {
          throw new Error(`${id}: known gap "${gapId}" (${g.owner}) now passes on ${plat}. ` +
            'Remove it from docs/JOURNEY_TESTS.json so the journey counts as proven.');
        }
        gapsHit.push({ id: gapId, owner: g.owner, failure: failure.slice(0, 500) });
        say(`KNOWN-GAP (not a pass): ${id} ${gapId} — owner ${g.owner}: ${g.reason}`);
      },
      inspect: pdfcheck.inspect,
      async waitFor(selector, o = {}) {
        await j.s.call('waitFor', selector, o);
      },
      async waitForDocument(pages) {
        // The launch has already proven the editor shell is mounted
        // (lib/launch-readiness.ts), so a timeout here means the app is up and
        // the document never arrived: the open request, not the start-up.
        try {
          await j.waitFor('[data-has-document="true"]', { state: 'attached', timeout: DOCUMENT_BUDGET_MS });
        } catch (e) {
          const where = await j.s.evidence(evidenceDirFor(id, 'document') ?? path.join(work, 'launch-failures'), 'document', String(e), { budgetMs: DOCUMENT_BUDGET_MS })
            .catch(() => '(no evidence)');
          throw new Error(`the editor was running but the document did not open within ${DOCUMENT_BUDGET_MS / 1000} s ` +
            `(${e instanceof Error ? e.message : String(e)}); evidence: ${where}`);
        }
        if (pages !== undefined) {
          const until = Date.now() + 30_000;
          for (;;) {
            const n = await j.s.call<number>('count', '[data-testid="page-view"]');
            if (n === pages) return;
            if (Date.now() > until) throw new Error(`expected ${pages} pages on screen, the app shows ${n}`);
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      },
      async invoke<T>(cmd: string, args?: Record<string, unknown>) {
        return j.s.call<T>('invoke', cmd, args ?? {});
      },
      async allow(...paths) {
        await grantForPanel(paths);
      },
      async answerDialog(kind, value) {
        if (kind !== 'message') await grantForPanel(Array.isArray(value) ? value : [value as string | null]);
        await j.s.call('queueDialog', kind, value);
      },
      async answerNativeDialogs(...answers) {
        await grantForPanel(answers);
        await j.invoke('e2e_queue_dialog_answers', { answers });
      },
      async unexpectedDialogs() {
        return j.s.call('unexpectedDialogs');
      },
      async backendDirty() {
        return j.invoke<boolean>('has_unsaved_changes');
      },
      note(msg) { notes.push(msg); },
      async faults() {
        await harvest();
        return faultsSeen.slice();
      },
    };

    let status: 'pass' | 'known-gap' | 'fail' = 'pass';
    let error: string | undefined;
    let verdict: Judgement | undefined;
    try {
      await body(j);
      const extra = session ? await session.call<Array<{ kind: string }>>('unexpectedDialogs').catch(() => []) : [];
      if (extra.length > 0) {
        throw new Error(`${id}: the app opened dialogs nobody expected: ${JSON.stringify(extra)}`);
      }
      // A failing command answers a moment after the step that caused it ended.
      await new Promise((r) => setTimeout(r, 500));
      await harvest();
      const resolved = resolveFaults(id, faultsSeen, expectedFaults);
      verdict = resolved.verdict;
      if (resolved.failure) throw new Error(resolved.failure);
      for (const line of resolved.stale) {
        // Said, not failed: an entry nothing matched means the fault is gone
        // (delete the entry) or the entry never described it (fix it).
        notes.push(`STALE-EXPECTATION ${line}`);
        say(`STALE-EXPECTATION: ${line}`);
      }
      if (gapsHit.length > 0) status = 'known-gap';
    } catch (e) {
      status = 'fail';
      const original = e instanceof Error ? e.message : String(e);
      error = original;
      if (!verdict) {
        // The step that failed is often the one a toast explains: say what the page showed.
        await harvest().catch(() => undefined);
        verdict = resolveFaults(id, faultsSeen, expectedFaults).verdict;
        if (verdict.unexpected.length > 0) error = `${original}\nThe app also showed:\n${describeFaults(verdict.unexpected)}`;
      }
      throw error === original ? e : new Error(error);
    } finally {
      if (session) await session.close().catch(() => undefined);
      writeResult(id, {
        id,
        platform: plat,
        driver: driverKind(),
        build: `e2e build of ${process.env.GITHUB_SHA ?? process.env.PDFLUENT_E2E_SHA ?? 'a local tree'}`,
        status,
        error,
        gaps: gapsHit,
        // Everything the page showed or logged, so a run can be searched for a
        // command or a message: the unexpected ones failed the journey above.
        faults: {
          unexpected: verdict?.unexpected ?? faultsSeen,
          expected: verdict?.expected ?? [],
          warnings: warningsSeen,
        },
        steps,
        notes,
        ...(status === 'fail' ? { appLog: appLogSince(started) } : {}),
        ms: Date.now() - started,
        work,
      });
    }
  }, timeoutMs);
}

/** How long a document may take to open once the editor is running (start-up has its own budget: launch-readiness.ts). */
const DOCUMENT_BUDGET_MS = 60_000;

let evidenceCounter = 0;

/** `<results>/launch-failures/<journey>-<stage>-<n>`: next to the results, outside what the judge reads. */
function evidenceDirFor(id: string, stage: string): string | undefined {
  const dir = process.env.PDFLUENT_JOURNEY_RESULTS;
  if (!dir) return undefined;
  evidenceCounter += 1;
  return path.join(dir, 'launch-failures', `${id}-${stage}-${evidenceCounter}`);
}

/**
 * The app's own log lines written since `sinceMs`, for a failed journey: a page
 * that never loads or a command that never answers leaves nothing on screen,
 * but the log says how far the app got (perf lines, extraction start/finish).
 */
function appLogSince(sinceMs: number): string[] {
  const dir = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Logs', 'com.pdfluent.app')
    : path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'com.pdfluent.app', 'logs');
  try {
    const lines = readFileSync(path.join(dir, 'PDFluent.log'), 'utf8').split('\n');
    const from = sinceMs / 1000 - 1;
    return lines.filter((l) => {
      const m = /^\[(\d+(?:\.\d+)?)\]/.exec(l);
      return m !== null && Number(m[1]) >= from;
    }).slice(-200);
  } catch (e) {
    return [`(app log unreadable: ${e instanceof Error ? e.message : String(e)})`];
  }
}

/** Dismiss what an earlier run can leave at start-up (Windows shares app data). */
async function settleStartup(s: Session): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    if (await s.call<boolean>('visible', '[data-testid="recovery-dialog"]')) {
      await s.click('[data-testid="recovery-discard-btn"]');
      await s.call('waitFor', '[data-testid="recovery-dialog"]', { state: 'gone', timeout: 10_000 });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
