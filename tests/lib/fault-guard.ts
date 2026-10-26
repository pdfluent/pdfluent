// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The judging half of the fault guard. tests/lib/fault-watch.js runs in the
// page and records error toasts, console errors, uncaught exceptions and
// unhandled rejections; this decides, after the fact, which of them a test may
// have. Used by the journeys (tests/journeys/lib/journey.ts), the Playwright
// suite (tests/e2e/helpers/guarded-test.ts) and nothing else.
//
// The rule: a fault fails the test unless the test says, in writing, that it
// expects exactly that. An expectation is a command and/or a message pattern
// plus a reason. "It happens on every start" is not a reason; that is a bug
// (an error toast the owner sees in the running app: 'ocr_component_status'
// did not complete, which no test run had ever flagged).

export type FaultKind = 'error-toast' | 'console-error' | 'window-error' | 'unhandled-rejection';

export const FAULT_KINDS: readonly FaultKind[] = ['error-toast', 'console-error', 'window-error', 'unhandled-rejection'];

export interface Fault {
  kind: FaultKind;
  /** What a person would read, or the console line. */
  text: string;
  /** error-toast only: the Tauri command that failed (AppError.source). */
  command?: string;
  code?: string;
  title?: string;
  message?: string;
  at?: number;
}

export interface ExpectedFault {
  /** Restrict to these kinds; default: every kind. */
  kind?: FaultKind | readonly FaultKind[];
  /** The Tauri command named by the toast. Matches error toasts only. */
  command?: string;
  /** Matched against the fault's text: a RegExp, or a string that must occur in it. */
  match?: RegExp | string;
  /** Why this journey or spec expects the fault. Required, and has to say something. */
  reason: string;
}

export interface Judgement {
  unexpected: Fault[];
  expected: Array<{ fault: Fault; reason: string }>;
  /** Expectations nothing matched: either the fault is fixed, or the entry was wrong. */
  unused: ExpectedFault[];
}

export const MIN_REASON_LENGTH = 20;

/** Problems with the expectations themselves; an empty list means they can be trusted. */
export function validateExpectations(expectations: readonly ExpectedFault[], owner: string): string[] {
  const problems: string[] = [];
  expectations.forEach((e, i) => {
    const where = `${owner} expectation #${i + 1}`;
    if (typeof e.reason !== 'string' || e.reason.trim().length < MIN_REASON_LENGTH) {
      problems.push(`${where}: needs a written reason (at least ${MIN_REASON_LENGTH} characters)`);
    }
    if (e.command === undefined && e.match === undefined) {
      problems.push(`${where}: names neither a command nor a message pattern, so it would allow every fault`);
    }
    if (e.command !== undefined && e.kind !== undefined) {
      const kinds = Array.isArray(e.kind) ? e.kind : [e.kind];
      if (!kinds.includes('error-toast')) problems.push(`${where}: a command only appears on error toasts, but kind excludes them`);
    }
    if (typeof e.match === 'string' && e.match.length === 0) problems.push(`${where}: an empty match string matches everything`);
  });
  return problems;
}

export function matches(e: ExpectedFault, f: Fault): boolean {
  if (e.kind !== undefined) {
    const kinds = Array.isArray(e.kind) ? e.kind : [e.kind];
    if (!kinds.includes(f.kind)) return false;
  }
  if (e.command !== undefined && !(f.kind === 'error-toast' && f.command === e.command)) return false;
  if (e.match !== undefined) {
    const hit = typeof e.match === 'string' ? f.text.includes(e.match) : e.match.test(f.text);
    if (!hit) return false;
  }
  return true;
}

export function judgeFaults(faults: readonly Fault[], expectations: readonly ExpectedFault[] = []): Judgement {
  const problems = validateExpectations(expectations, 'fault');
  if (problems.length > 0) throw new Error(problems.join('; '));
  const unexpected: Fault[] = [];
  const expected: Judgement['expected'] = [];
  const used = new Set<ExpectedFault>();
  for (const fault of faults) {
    const hit = expectations.find((e) => matches(e, fault));
    if (hit) {
      used.add(hit);
      expected.push({ fault, reason: hit.reason });
    } else {
      unexpected.push(fault);
    }
  }
  return { unexpected, expected, unused: expectations.filter((e) => !used.has(e)) };
}

/** One line per fault, in the words the test failure should lead with. */
export function describeFaults(faults: readonly Fault[]): string {
  return faults
    .map((f) => {
      const cmd = f.kind === 'error-toast' && f.command ? ` [${f.command}]` : '';
      return `  - ${f.kind}${cmd}: ${f.text.slice(0, 400)}`;
    })
    .join('\n');
}

export function faultFailure(owner: string, unexpected: readonly Fault[]): string {
  const n = unexpected.length;
  return (
    `${owner}: the app showed ${n} error${n === 1 ? '' : 's'} nobody expected.\n${describeFaults(unexpected)}\n` +
    'Fix the app. If this test is about a failure path, say so with a written reason ' +
    '(tests/journeys/lib/expected-faults.ts, or allowFaults() in a Playwright spec).'
  );
}

export interface Resolution {
  verdict: Judgement;
  /** Set when a fault nobody expected was seen: the text the test fails with. */
  failure?: string;
  /** One line per expectation nothing matched. Said, never failed. */
  stale: string[];
}

/**
 * What a test run makes of the faults it saw. The harnesses call this once at
 * the end and throw `failure` when there is one; it is the whole decision, kept
 * apart from the harnesses so it can be run without an app.
 */
export function resolveFaults(owner: string, seen: readonly Fault[], expectations: readonly ExpectedFault[] = []): Resolution {
  const verdict = judgeFaults(seen, expectations);
  return {
    verdict,
    failure: verdict.unexpected.length > 0 ? faultFailure(owner, verdict.unexpected) : undefined,
    stale: verdict.unused.map((e) => `${owner}: expected fault never happened (${e.reason})`),
  };
}
