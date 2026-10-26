// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The Windows journey job used to stop after ten red journeys, which ended the
// run at 16 of 63 once five journeys failed for their own reasons. The suite
// now stops trying only when the app itself will not start.

import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAUNCH_FAILURES_BEFORE_STOP, launchesStopped, recordLaunch, resetLaunchLedger } from './journeys/lib/launch-breaker';

const dir = (): string => mkdtempSync(path.join(os.tmpdir(), 'pdfluent-breaker-'));

describe('the launch breaker', () => {
  it('lets the suite carry on after a few failed launches', () => {
    const d = dir();
    for (let i = 0; i < LAUNCH_FAILURES_BEFORE_STOP - 1; i += 1) recordLaunch(d, 'no WebDriver session');
    expect(launchesStopped(d)).toBeNull();
  });

  it('stops the suite when launches fail in a row, and says why', () => {
    const d = dir();
    for (let i = 0; i < LAUNCH_FAILURES_BEFORE_STOP; i += 1) recordLaunch(d, 'no WebDriver session: chrome not reachable');
    expect(launchesStopped(d)).toContain('chrome not reachable');
  });

  it('forgets the failures when an app starts', () => {
    const d = dir();
    for (let i = 0; i < LAUNCH_FAILURES_BEFORE_STOP - 1; i += 1) recordLaunch(d, 'x');
    recordLaunch(d);
    recordLaunch(d, 'x');
    expect(launchesStopped(d)).toBeNull();
  });

  it('starts every run clean', () => {
    const d = dir();
    for (let i = 0; i < LAUNCH_FAILURES_BEFORE_STOP; i += 1) recordLaunch(d, 'x');
    resetLaunchLedger(d);
    expect(launchesStopped(d)).toBeNull();
  });

  it('does nothing without a results folder', () => {
    recordLaunch(undefined, 'x');
    expect(launchesStopped(undefined)).toBeNull();
  });

  it('is what ends a run of dead launches: the Windows job no longer bails after N red journeys', () => {
    const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
    const start = workflow.indexOf('\n  journeys-windows:');
    const rest = workflow.slice(start + 5);
    const end = rest.search(/\n {2}[A-Za-z0-9_-]+:\n/);
    const job = end === -1 ? rest : rest.slice(0, end);
    expect(start).toBeGreaterThan(-1);
    // Comments may explain the history; no env entry may set it.
    expect(job.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')).not.toMatch(/PDFLUENT_JOURNEYS_BAIL/);
  });
});
