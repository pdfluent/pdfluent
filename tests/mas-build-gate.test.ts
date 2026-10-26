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
// PATH 'bash' is Intel-only on the owner's Mac; the arch guard would (rightly) refuse it.
const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash';

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
  const run = spawnSync(BASH, [SCRIPT], {
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
  it('ships the app version: the overlay has no version, or the app version without its pre-release tag', () => {
    // The overlay sat at 1.0.0 while the app moved to 1.1.0; the package would
    // have been named and stamped 1.0.0.
    const overlay = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.mas.conf.json'), 'utf8')).version;
    const app = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')).version.split('-')[0];
    expect(overlay === undefined || overlay === app).toBe(true);
    expect(readFileSync(SCRIPT, 'utf8')).toContain('The App Store build must ship the app');
  });

  it('runs the preflight before it spends a build number', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src.indexOf('mas-preflight.sh')).toBeGreaterThan(-1);
    expect(src.indexOf('mas-preflight.sh')).toBeLessThan(src.indexOf('> "${BUILD_NUMBER_FILE}"'));
  });

  it('hands altool the folder of APPLE_API_KEY_PATH, which altool otherwise ignores', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('API_PRIVATE_KEYS_DIR');
    expect(src.indexOf('export API_PRIVATE_KEYS_DIR')).toBeLessThan(src.indexOf('altool --upload-app'));
  });

  it('preflight reports a missing provisioning profile and does not build', () => {
    const run = spawnSync(BASH, [join(ROOT, 'scripts', 'mas-preflight.sh')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, MAS_PREFLIGHT_SKIP_SIGN: '1', MAS_PROFILE: join(tmp, 'no-such.provisionprofile') },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toContain('FAIL  missing');
  });

  it('signs the .pkg with productsign, because productbuild --sign waits for a keychain click', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/^\s*xcrun productbuild[^\n]*--sign/m);
    expect(src.indexOf('productsign --sign')).toBeGreaterThan(src.indexOf('productbuild --component'));
    expect(src.indexOf('pkgutil --check-signature')).toBeGreaterThan(src.indexOf('productsign --sign'));
  });

  it('looks for the built .app under CARGO_TARGET_DIR when it is set', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toContain('${CARGO_TARGET_DIR:-src-tauri/target}/universal-apple-darwin/release/bundle/macos"');
  });

  describe('arch guard (Rosetta)', () => {
    const guarded = (script: string, env: Record<string, string>) => {
      const run = spawnSync(BASH, [join(ROOT, 'scripts', script)], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, MAS_DRY_RUN: '1', MAS_PREFLIGHT_SKIP_SIGN: '1', MAS_GUARD_UNAME_S: 'Darwin', ...env },
      });
      return { status: run.status, out: `${run.stdout}${run.stderr}` };
    };

    for (const script of ['build-mas.sh', 'mas-preflight.sh']) {
      it(`${script} refuses an x86_64 shell and names the fix`, () => {
        const r = guarded(script, { MAS_GUARD_UNAME_M: 'x86_64', MAS_GUARD_TRANSLATED: '0' });
        expect(r.status).toBe(1);
        expect(r.out).toContain('arch -arm64 /bin/bash');
      });
      it(`${script} refuses a translated arm64-looking shell`, () => {
        const r = guarded(script, { MAS_GUARD_UNAME_M: 'arm64', MAS_GUARD_TRANSLATED: '1' });
        expect(r.status).toBe(1);
        expect(r.out).toContain('Rosetta');
      });
    }

    it('lets a native arm64 shell through to the dry run', () => {
      const r = guarded('build-mas.sh', { MAS_GUARD_UNAME_M: 'arm64', MAS_GUARD_TRANSLATED: '0' });
      expect(r.out).not.toContain('Rosetta');
      expect(r.out).toContain('CFBundleVersion=');
    });
  });
});
