// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The build number of a Mac App Store upload.
 *
 * Until 2026-09-07 `scripts/build-mas.sh` stamped `CFBundleVersion` from
 * `${MAS_BUILD_NUMBER:-1}` — a shell default with no memory of what had already
 * been uploaded. App Store Connect never forgets a build number, not even one
 * from a build it rejected, so the second upload of a version would have been
 * refused with nothing on this machine explaining why. The number now comes from
 * a counter committed in the repository and has to exceed the last one handed
 * out.
 *
 * These tests drive the real script in dry-run mode. Restore the `:-1` default
 * or drop the "must exceed" check and they go red.
 *
 * The other half of a correct package — that the signature carries the
 * entitlements we meant to sign with — is in `mas-entitlements.test.ts`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'build-mas.sh');
const COUNTER = join(ROOT, 'store', 'mas', 'build-number');

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mas-gate-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Run the real build script in dry-run mode against a throwaway counter file. */
function dryRun(counterContents: string | null, env: Record<string, string> = {}) {
  const counter = join(tmp, `counter-${Math.random().toString(36).slice(2)}`);
  if (counterContents !== null) writeFileSync(counter, counterContents);
  const run = spawnSync('bash', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, MAS_DRY_RUN: '1', MAS_BUILD_NUMBER_FILE: counter, ...env },
  });
  return {
    status: run.status,
    out: `${run.stdout}${run.stderr}`,
    counterAfter: existsSync(counter) ? readFileSync(counter, 'utf8') : null,
  };
}

describe('MAS build number', () => {
  it('is a committed whole number, on its own line', () => {
    expect(existsSync(COUNTER)).toBe(true);
    expect(readFileSync(COUNTER, 'utf8')).toMatch(/^\d+\n$/);
  });

  it('hands out the next number after the one recorded', () => {
    const r = dryRun('41\n');
    expect(r.status).toBe(0);
    expect(r.out).toContain('CFBundleVersion=42');
  });

  it('leaves the counter untouched in dry-run', () => {
    const r = dryRun('41\n');
    expect(r.counterAfter).toBe('41\n');
  });

  it('refuses the number that was already handed out', () => {
    const r = dryRun('41\n', { MAS_BUILD_NUMBER: '41' });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('does not exceed');
  });

  it('refuses a number below the one recorded', () => {
    const r = dryRun('41\n', { MAS_BUILD_NUMBER: '7' });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('does not exceed');
  });

  it('accepts a deliberate jump forward', () => {
    const r = dryRun('41\n', { MAS_BUILD_NUMBER: '50' });
    expect(r.status).toBe(0);
    expect(r.out).toContain('CFBundleVersion=50');
  });

  it('refuses a number that is not a whole number', () => {
    for (const bad of ['12a', '1.2', '-3', '']) {
      const r = dryRun('41\n', { MAS_BUILD_NUMBER: bad });
      expect(r.status, `MAS_BUILD_NUMBER=${JSON.stringify(bad)} was accepted`).not.toBe(0);
    }
  });

  it('refuses to run without a counter file', () => {
    const r = dryRun(null);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('No build-number counter');
  });

  it('refuses a corrupt counter file', () => {
    const r = dryRun('beta.21\n');
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('not a whole number');
  });

  it('stamps Info.plist from the resolved number, never from a shell default', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('Set :CFBundleVersion ${BUILD_NUMBER}');
    expect(src).not.toContain('MAS_BUILD_NUMBER:-1');
  });

  it('reads the signature back before it can be uploaded', () => {
    // The verification is worth nothing as an optional extra step someone
    // remembers to run; it is part of producing the package.
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('scripts/mas-entitlements.mjs');
    expect(src.indexOf('mas-entitlements.mjs')).toBeLessThan(src.indexOf('altool --upload-app'));
  });

  it('records the number before the build, so a failed build cannot reuse it', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const recorded = src.indexOf('> "${BUILD_NUMBER_FILE}"');
    const built = src.indexOf('npm run tauri build');
    expect(recorded).toBeGreaterThan(-1);
    expect(built).toBeGreaterThan(recorded);
  });
});
