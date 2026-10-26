// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The fault guard, tested without an app.
//
// The owner saw "'ocr_component_status' did not complete" on a plain start, an
// error no journey, no Playwright spec and no UI walk had flagged. The guard
// (tests/lib/fault-watch.js in the page, tests/lib/fault-guard.ts in the
// harness) fails a run on any error toast, console error, uncaught exception
// or unhandled rejection that the test did not list, with a reason, as the
// thing it is about.
//
// Three layers here:
//   1. the page-side watch, run against a fake window;
//   2. the judgement: a fake toast fails a journey, an allowlisted one does not;
//   3. the same scenarios against deliberately broken copies of both halves
//      (a guard nobody has seen fail guards nothing).

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { agentCall } from './journeys/lib/driver';
import { EXPECTED_FAULTS } from './journeys/lib/expected-faults';
import * as realGuard from './lib/fault-guard';
import { validateExpectations, type ExpectedFault, type Fault } from './lib/fault-guard';

type Guard = typeof realGuard;

const WATCH_FILE = 'tests/lib/fault-watch.js';
const GUARD_FILE = 'tests/lib/fault-guard.ts';
const WATCH = readFileSync(WATCH_FILE, 'utf8');
const TOAST = '[data-testid="app-error-toast"]';

// ── A window just big enough for the watch ──────────────────────────────────

class FakeNode {
  constructor(
    private readonly attrs: Record<string, string>,
    private readonly paras: string[],
  ) {}
  getAttribute(name: string): string | null { return this.attrs[name] ?? null; }
  matches(sel: string): boolean { return sel === TOAST && this.attrs['data-testid'] === 'app-error-toast'; }
  querySelectorAll(sel: string): Array<{ textContent: string }> {
    return sel === 'p' ? this.paras.map((textContent) => ({ textContent })) : [];
  }
  get textContent(): string { return this.paras.join(' '); }
}

function toast(o: { severity?: string; title: string; message: string; command?: string; code?: string }): FakeNode {
  const attrs: Record<string, string> = { 'data-testid': 'app-error-toast', 'data-severity': o.severity ?? 'error' };
  if (o.command) attrs['data-error-source'] = o.command;
  if (o.code) attrs['data-error-code'] = o.code;
  return new FakeNode(attrs, [o.title, o.message]);
}

interface Page {
  watch: {
    faults: Fault[];
    warnings: Fault[];
    snapshot(): Fault[];
    warningsSnapshot(): Fault[];
  };
  /** A toast the app renders after the watch is installed; the observer is told unless `told` is false. */
  show(node: FakeNode, o?: { told?: boolean }): void;
  logged: unknown[][];
  console: { error: (...a: unknown[]) => void };
  fire(type: string, event: Record<string, unknown>): void;
  sunk: Array<Record<string, unknown>>;
  win: Record<string, unknown>;
}

function page(source: string, before: FakeNode[] = [], withSink = false): Page {
  const stack = [...before];
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  let notify: (records: unknown[]) => void = () => undefined;
  let watching = false;
  class FakeObserver {
    constructor(cb: (records: unknown[]) => void) { notify = cb; }
    // Only a watch that asked to observe is told about new nodes.
    observe(): void { watching = true; }
  }
  const logged: unknown[][] = [];
  const sunk: Array<Record<string, unknown>> = [];
  const win: Record<string, unknown> = {
    console: { error: (...a: unknown[]) => { logged.push(a); } },
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
  };
  if (withSink) win.__pjFaultSink = (f: Record<string, unknown>) => { sunk.push(f); };
  const doc = {
    documentElement: {},
    querySelectorAll: (sel: string) => (sel === TOAST ? stack : []),
  };
  new Function('window', 'document', 'MutationObserver', source)(win, doc, FakeObserver);
  return {
    watch: win.__pjFaultWatch as Page['watch'],
    show: (node, o = {}) => {
      stack.push(node);
      if (o.told !== false && watching) notify([{ addedNodes: [node] }]);
    },
    logged,
    console: win.console as Page['console'],
    fire: (type, event) => { for (const fn of listeners.get(type) ?? []) fn(event); },
    sunk,
    win,
  };
}

const OCR = { title: "'ocr_component_status' did not complete", message: 'No resource folder for the OCR component: unknown path', command: 'ocr_component_status' };

// ── Scenarios: each one must fail on a broken copy of the code it covers ────

interface Env { watch: string; guard: Guard }
const scenarios: Record<string, (env: Env) => void> = {
  errorToastIsAFault: ({ watch }) => {
    const p = page(watch);
    p.show(toast({ ...OCR, code: 'COMMAND_FAILED' }));
    expect(p.watch.snapshot()).toMatchObject([{ kind: 'error-toast', command: 'ocr_component_status', code: 'COMMAND_FAILED', title: OCR.title, message: OCR.message }]);
    expect(p.watch.snapshot()[0]!.text).toBe(`${OCR.title} — ${OCR.message}`);
  },
  warningToastIsNotAFault: ({ watch }) => {
    const p = page(watch);
    p.show(toast({ severity: 'warning', title: 'Feature unavailable', message: 'x' }));
    expect(p.watch.snapshot()).toEqual([]);
    expect(p.watch.warningsSnapshot()).toHaveLength(1);
  },
  toastAlreadyOnScreenWhenInstalled: ({ watch }) => {
    // Read the list itself, not snapshot(): snapshot looks at the stack again.
    const p = page(watch, [toast(OCR)]);
    expect(p.watch.faults).toHaveLength(1);
  },
  snapshotLooksAtTheStackNow: ({ watch }) => {
    const p = page(watch);
    p.show(toast(OCR), { told: false });
    expect(p.watch.snapshot()).toHaveLength(1);
  },
  toastAddedLaterIsSeen: ({ watch }) => {
    const p = page(watch);
    p.show(toast(OCR));
    expect(p.watch.faults).toHaveLength(1);
  },
  oneToastIsOneFault: ({ watch }) => {
    const p = page(watch);
    const node = toast(OCR);
    p.show(node);
    p.show(node, { told: false });
    p.watch.snapshot();
    expect(p.watch.faults).toHaveLength(1);
  },
  commandComesFromTheToast: ({ watch }) => {
    const p = page(watch);
    p.show(toast({ title: 'Anything', message: 'x', command: 'save_pdf' }));
    expect(p.watch.snapshot()[0]!.command).toBe('save_pdf');
  },
  consoleErrorIsAFault: ({ watch }) => {
    const p = page(watch);
    p.console.error('Warning:', new Error('boom'), { a: 1 });
    const [f] = p.watch.snapshot();
    expect(f!.kind).toBe('console-error');
    expect(f!.text).toContain('Warning:');
    expect(f!.text).toContain('boom');
    expect(f!.text).toContain('{"a":1}');
  },
  consoleErrorStillReachesTheConsole: ({ watch }) => {
    const p = page(watch);
    p.console.error('still logged');
    expect(p.logged).toEqual([['still logged']]);
  },
  uncaughtExceptionIsAFault: ({ watch }) => {
    const p = page(watch);
    p.fire('error', { message: 'Uncaught TypeError: x is undefined' });
    expect(p.watch.snapshot()).toMatchObject([{ kind: 'window-error', text: 'Uncaught TypeError: x is undefined' }]);
  },
  aFailedResourceIsNotAnException: ({ watch }) => {
    const p = page(watch);
    p.fire('error', { target: {} }); // an <img> that did not load: an Event, no message
    expect(p.watch.snapshot()).toEqual([]);
  },
  unhandledRejectionIsAFault: ({ watch }) => {
    const p = page(watch);
    p.fire('unhandledrejection', { reason: new Error('nobody caught this') });
    expect(p.watch.snapshot()).toMatchObject([{ kind: 'unhandled-rejection' }]);
    expect(p.watch.snapshot()[0]!.text).toContain('nobody caught this');
  },
  aHarnessCanBeToldAtOnce: ({ watch }) => {
    const p = page(watch, [], true);
    p.show(toast(OCR));
    p.console.error('x');
    expect(p.sunk.map((f) => f.kind)).toEqual(['error-toast', 'console-error']);
  },
  installingTwiceChangesNothing: ({ watch }) => {
    const p = page(watch);
    const first = p.watch;
    // The driver sends the watch with every call: a second run finds it and leaves it alone.
    new Function('window', 'document', 'MutationObserver', watch)(p.win, { documentElement: {}, querySelectorAll: () => [] }, class { observe(): void { /* none */ } });
    expect(p.win.__pjFaultWatch).toBe(first);
    p.console.error('once');
    expect(first.snapshot()).toHaveLength(1);
  },

  // The judgement.
  aFakeToastFailsTheJourney: ({ guard }) => {
    const toastFault: Fault = { kind: 'error-toast', command: 'ocr_component_status', text: `${OCR.title} — ${OCR.message}` };
    const r = guard.resolveFaults('J-10', [toastFault], []);
    expect(r.failure).toContain('J-10');
    expect(r.failure).toContain(OCR.message);
    expect(r.failure).toContain('[ocr_component_status]');
  },
  anAllowlistedToastDoesNot: ({ guard }) => {
    const toastFault: Fault = { kind: 'error-toast', command: 'save_pdf', text: "'save_pdf' did not complete — permission denied" };
    const allow: ExpectedFault[] = [{ kind: 'error-toast', command: 'save_pdf', reason: 'the journey saves into a read-only folder on purpose' }];
    const r = guard.resolveFaults('J-26', [toastFault], allow);
    expect(r.failure).toBeUndefined();
    expect(r.verdict.expected).toHaveLength(1);
    expect(r.verdict.expected[0]!.reason).toContain('read-only');
  },
  anAllowanceCoversItsCommandOnly: ({ guard }) => {
    const allow: ExpectedFault[] = [{ command: 'save_pdf', reason: 'the journey saves into a read-only folder on purpose' }];
    const other: Fault = { kind: 'error-toast', command: 'ocr_component_status', text: 'x' };
    const sameTextOtherKind: Fault = { kind: 'console-error', text: "'save_pdf' did not complete" };
    const r = guard.resolveFaults('J-26', [other, sameTextOtherKind], allow);
    expect(r.verdict.unexpected).toEqual([other, sameTextOtherKind]);
  },
  anAllowanceCanBeKindAndText: ({ guard }) => {
    const allow: ExpectedFault[] = [{ kind: 'console-error', match: /refused by the mock/, reason: 'the spec opens a file the mock refuses; the refusal is logged' }];
    const hit: Fault = { kind: 'console-error', text: 'open refused by the mock' };
    const wrongKind: Fault = { kind: 'window-error', text: 'open refused by the mock' };
    const wrongText: Fault = { kind: 'console-error', text: 'something else' };
    expect(guard.judgeFaults([hit, wrongKind, wrongText], allow).unexpected).toEqual([wrongKind, wrongText]);
    const str: ExpectedFault[] = [{ match: 'refused', reason: 'a string matches when it occurs in the text' }];
    expect(guard.judgeFaults([hit, wrongText], str).unexpected).toEqual([wrongText]);
  },
  anAllowanceNothingMatchedIsSaid: ({ guard }) => {
    const allow: ExpectedFault[] = [{ command: 'save_pdf', reason: 'the journey saves into a read-only folder on purpose' }];
    const r = guard.resolveFaults('J-26', [], allow);
    expect(r.failure).toBeUndefined();
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]).toContain('J-26');
  },
  noFaultsNoFailure: ({ guard }) => {
    const r = guard.resolveFaults('J-10', [], []);
    expect(r.failure).toBeUndefined();
    expect(r.stale).toEqual([]);
  },
  anAllowanceNeedsAReason: ({ guard }) => {
    expect(guard.validateExpectations([{ command: 'save_pdf', reason: '' }], 'J-26').join()).toMatch(/written reason/);
    expect(guard.validateExpectations([{ command: 'save_pdf', reason: 'too short' }], 'J-26').join()).toMatch(/written reason/);
    expect(() => guard.judgeFaults([], [{ command: 'save_pdf', reason: '' }])).toThrow(/written reason/);
  },
  anAllowanceCannotAllowEverything: ({ guard }) => {
    const reason = 'a perfectly good reason in words';
    expect(guard.validateExpectations([{ reason }], 'J-26').join()).toMatch(/would allow every fault/);
    expect(guard.validateExpectations([{ kind: 'error-toast', reason }], 'J-26').join()).toMatch(/would allow every fault/);
    expect(guard.validateExpectations([{ match: '', reason }], 'J-26').join()).toMatch(/matches everything/);
    expect(guard.validateExpectations([{ command: 'save_pdf', kind: 'console-error', reason }], 'J-26').join()).toMatch(/only appears on error toasts/);
    expect(guard.validateExpectations([{ command: 'save_pdf', reason }], 'J-26')).toEqual([]);
  },
};

// ── 1 + 2. The scenarios on the real code ───────────────────────────────────

describe('the fault guard', () => {
  const env: Env = { watch: WATCH, guard: realGuard };
  for (const [name, run] of Object.entries(scenarios)) {
    it(name, () => { run(env); });
  }
});

describe('where the guard is wired in', () => {
  it('every driver call carries the watch, and the page agent can report what it saw', () => {
    const script = agentCall('faults', []);
    expect(script.indexOf('installFaultWatch')).toBeGreaterThanOrEqual(0);
    expect(script.indexOf('installFaultWatch')).toBeLessThan(script.indexOf('installAgent'));
    expect(script).toContain('__pjFaultWatch.snapshot()');
  });

  it('every journey is judged on its faults, in the one place journeys are registered', () => {
    const src = readFileSync('tests/journeys/lib/journey.ts', 'utf8');
    expect(src).toContain('resolveFaults(id, faultsSeen, expectedFaults)');
    expect(src).toMatch(/if \(resolved\.failure\) throw new Error\(resolved\.failure\)/);
    // A relaunch closes a page; its faults are taken first.
    expect(src).toMatch(/const closeSession = async[\s\S]*await harvest\(\);[\s\S]*await session\.close\(\)/);
  });

  it('every Playwright spec uses the guarded test, none the stock one', () => {
    const specs = readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(5);
    for (const f of specs) {
      const src = readFileSync(path.join('tests/e2e', f), 'utf8');
      expect(src, `${f} imports from @playwright/test`).not.toMatch(/from ['"]@playwright\/test['"]/);
      expect(src, `${f} does not use the guarded test`).toContain("from './helpers/guarded-test'");
    }
  });

  it('the journeys only expect faults they give a reason for, in journeys that exist', () => {
    const map = JSON.parse(readFileSync('docs/JOURNEY_TESTS.json', 'utf8')) as { journeys: Record<string, unknown> };
    for (const [id, list] of Object.entries(EXPECTED_FAULTS)) {
      expect(Object.keys(map.journeys), `${id} is not a journey`).toContain(id);
      expect(validateExpectations(list, id), id).toEqual([]);
    }
  });
});

// ── 3. The same scenarios against broken copies ─────────────────────────────

interface Mutant {
  name: string;
  file: typeof WATCH_FILE | typeof GUARD_FILE;
  from: string;
  to: string;
  /** Scenarios that must notice. */
  caughtBy: string[];
}

const MUTANTS: Mutant[] = [
  // The page side.
  { name: 'every toast is a fault, warnings included', file: WATCH_FILE, from: "else { fault.kind = 'warning-toast'; add(warnings, fault); }", to: 'else { add(faults, fault); }', caughtBy: ['warningToastIsNotAFault'] },
  { name: 'no toast is a fault', file: WATCH_FILE, from: "if (severity === 'error') add(faults, fault);", to: 'if (false) add(faults, fault);', caughtBy: ['errorToastIsAFault', 'toastAddedLaterIsSeen', 'toastAlreadyOnScreenWhenInstalled', 'snapshotLooksAtTheStackNow', 'oneToastIsOneFault', 'commandComesFromTheToast', 'aHarnessCanBeToldAtOnce'] },
  { name: 'the toast stack is never watched', file: WATCH_FILE, from: 'observer.observe(doc.documentElement || doc, { childList: true, subtree: true });', to: '', caughtBy: ['toastAddedLaterIsSeen', 'aHarnessCanBeToldAtOnce'] },
  { name: 'a toast already up at install is missed', file: WATCH_FILE, from: '  scan(doc);\n\n  var originalError', to: '  var originalError', caughtBy: ['toastAlreadyOnScreenWhenInstalled'] },
  { name: 'snapshot does not look at the stack', file: WATCH_FILE, from: '    snapshot: function () {\n      scan(doc);', to: '    snapshot: function () {', caughtBy: ['snapshotLooksAtTheStackNow'] },
  { name: 'the same toast counts every time it is seen', file: WATCH_FILE, from: 'if (!node || seen.has(node)) return;', to: 'if (!node) return;', caughtBy: ['oneToastIsOneFault'] },
  { name: 'the failing command is not read', file: WATCH_FILE, from: "command: attr(node, 'data-error-source') || undefined,", to: 'command: undefined,', caughtBy: ['errorToastIsAFault', 'commandComesFromTheToast'] },
  { name: 'console.error is not recorded', file: WATCH_FILE, from: "add(faults, { kind: 'console-error', text: parts.join(' ') });", to: '', caughtBy: ['consoleErrorIsAFault', 'aHarnessCanBeToldAtOnce'] },
  { name: 'console.error is swallowed', file: WATCH_FILE, from: 'if (originalError) return originalError.apply(null, arguments);', to: '', caughtBy: ['consoleErrorStillReachesTheConsole'] },
  { name: 'uncaught exceptions are not recorded', file: WATCH_FILE, from: "add(faults, { kind: 'window-error', text: event.message });", to: '', caughtBy: ['uncaughtExceptionIsAFault'] },
  { name: 'a failed image counts as an exception', file: WATCH_FILE, from: "if (!event || typeof event.message !== 'string' || !event.message) return;", to: 'if (!event) return;', caughtBy: ['aFailedResourceIsNotAnException'] },
  { name: 'unhandled rejections are not recorded', file: WATCH_FILE, from: "add(faults, { kind: 'unhandled-rejection', text: describeValue(event && event.reason) });", to: '', caughtBy: ['unhandledRejectionIsAFault'] },
  { name: 'the harness is never told', file: WATCH_FILE, from: "if (typeof win.__pjFaultSink === 'function') {", to: 'if (false) {', caughtBy: ['aHarnessCanBeToldAtOnce'] },
  { name: 'a second install replaces the watch', file: WATCH_FILE, from: 'if (win.__pjFaultWatch) return;', to: '', caughtBy: ['installingTwiceChangesNothing'] },
  // The judgement.
  { name: 'a fault never fails the run', file: GUARD_FILE, from: 'failure: verdict.unexpected.length > 0 ? faultFailure(owner, verdict.unexpected) : undefined,', to: 'failure: undefined,', caughtBy: ['aFakeToastFailsTheJourney'] },
  { name: 'every fault is expected', file: GUARD_FILE, from: 'const hit = expectations.find((e) => matches(e, fault));', to: 'const hit = expectations[0] ?? { reason: "anything goes" };', caughtBy: ['anAllowanceCoversItsCommandOnly', 'anAllowanceCanBeKindAndText'] },
  { name: 'an allowed toast still fails', file: GUARD_FILE, from: 'const hit = expectations.find((e) => matches(e, fault));', to: 'const hit = undefined as ExpectedFault | undefined;', caughtBy: ['anAllowlistedToastDoesNot', 'anAllowanceCanBeKindAndText'] },
  { name: 'the command is not compared', file: GUARD_FILE, from: "if (e.command !== undefined && !(f.kind === 'error-toast' && f.command === e.command)) return false;", to: '', caughtBy: ['anAllowanceCoversItsCommandOnly'] },
  { name: 'a command allows the same words from any source', file: GUARD_FILE, from: "!(f.kind === 'error-toast' && f.command === e.command)", to: '!(f.command === e.command || f.text.includes(e.command))', caughtBy: ['anAllowanceCoversItsCommandOnly'] },
  { name: 'the kind is not compared', file: GUARD_FILE, from: 'if (!kinds.includes(f.kind)) return false;', to: '', caughtBy: ['anAllowanceCanBeKindAndText'] },
  { name: 'a string pattern matches everything', file: GUARD_FILE, from: "typeof e.match === 'string' ? f.text.includes(e.match) : e.match.test(f.text)", to: "typeof e.match === 'string' ? true : e.match.test(f.text)", caughtBy: ['anAllowanceCanBeKindAndText'] },
  { name: 'a stale allowance goes unnoticed', file: GUARD_FILE, from: 'unused: expectations.filter((e) => !used.has(e)) };', to: 'unused: [] };', caughtBy: ['anAllowanceNothingMatchedIsSaid'] },
  { name: 'no reason is needed', file: GUARD_FILE, from: "if (typeof e.reason !== 'string' || e.reason.trim().length < MIN_REASON_LENGTH) {", to: 'if (false) {', caughtBy: ['anAllowanceNeedsAReason'] },
  { name: 'an allowance may allow everything', file: GUARD_FILE, from: 'if (e.command === undefined && e.match === undefined) {', to: 'if (false) {', caughtBy: ['anAllowanceCannotAllowEverything'] },
  { name: 'invalid expectations are used anyway', file: GUARD_FILE, from: "if (problems.length > 0) throw new Error(problems.join('; '));\n  const unexpected", to: 'const unexpected', caughtBy: ['anAllowanceNeedsAReason'] },
];

describe('the scenarios fail when the guard is broken', () => {
  const copies: string[] = [];
  afterAll(() => {
    // Only directories this test made with mkdtemp are removed.
    for (const dir of copies) rmSync(dir, { recursive: true, force: true });
  });

  async function broken(m: Mutant): Promise<Env> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fault-guard-mutant-'));
    copies.push(dir);
    cpSync('tests/lib', dir, { recursive: true });
    const target = path.join(dir, path.basename(m.file));
    const source = readFileSync(target, 'utf8');
    expect(source.split(m.from).length - 1, `"${m.from}" must occur exactly once in ${m.file}`).toBe(1);
    const mutated = source.replace(m.from, () => m.to);
    writeFileSync(target, mutated);
    const guard = (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, 'fault-guard.ts')).href)) as Guard;
    return { watch: m.file === WATCH_FILE ? mutated : WATCH, guard };
  }

  it('every scenario is claimed by at least one mutant, and every claim is a scenario', () => {
    const claimed = new Set(MUTANTS.flatMap((m) => m.caughtBy));
    for (const name of Object.keys(scenarios)) {
      if (name === 'noFaultsNoFailure') continue; // the control case: nothing to break
      expect(claimed, `no mutant is caught by "${name}"`).toContain(name);
    }
    for (const name of claimed) expect(Object.keys(scenarios), `"${name}" is not a scenario`).toContain(name);
  });

  for (const m of MUTANTS) {
    it(`notices: ${m.name}`, async () => {
      const env = await broken(m);
      const failed: string[] = [];
      for (const [name, run] of Object.entries(scenarios)) {
        try { run(env); } catch { failed.push(name); }
      }
      for (const name of m.caughtBy) expect(failed, `"${name}" stayed green on "${m.name}"`).toContain(name);
    });
  }
});
