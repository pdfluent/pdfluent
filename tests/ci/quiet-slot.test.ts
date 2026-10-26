// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #730: the four-axes job refuses to measure, and says why, when the machine is busy.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { judgeLoad, waitForQuiet } from '../../scripts/ci/quiet-slot.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const script = resolve(ROOT, 'scripts/ci/quiet-slot.mjs');
const run = (load: string) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, QUIET_SLOT_LOAD: load } });

describe('quiet slot (#730)', () => {
  it('measures on an idle machine', () => {
    expect(judgeLoad({ load1: 0.4, cores: 8, maxPerCore: 0.25 }).quiet).toBe(true);
    const r = run('0.1');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('within');
  });

  it('refuses under load, with the numbers and the way out', () => {
    const r = run('900');
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('REFUSED');
    expect(r.stderr).toMatch(/per core, over the limit of 0\.25/);
    expect(r.stderr).toContain('Not measuring');
  });

  it('waits for the load to drop, then measures', async () => {
    const readings = [9, 9, 0.1];
    const v = await waitForQuiet({ maxPerCore: 0.25, waitS: 30, cores: 4, read: () => readings.shift() ?? 0.1, pauseMs: 1 });
    expect(v.quiet).toBe(true);
    expect(readings).toEqual([]);
  });

  it('gives up when the wait is over', async () => {
    const v = await waitForQuiet({ maxPerCore: 0.25, waitS: 0, cores: 4, read: () => 9, pauseMs: 1 });
    expect(v.quiet).toBe(false);
  });

  it('the nightly axes workflow runs the check before it measures, and has no soft failure', () => {
    const wf = readFileSync(resolve(ROOT, '.github/workflows/axes-nightly.yml'), 'utf8');
    expect(wf.indexOf('scripts/ci/quiet-slot.mjs')).toBeGreaterThan(-1);
    expect(wf.indexOf('scripts/ci/quiet-slot.mjs')).toBeLessThan(wf.indexOf('--test golden_axes'));
    expect(wf).toMatch(/\n  schedule:/);
    expect(wf).not.toMatch(/continue-on-error\s*:\s*true/);
  });
});
