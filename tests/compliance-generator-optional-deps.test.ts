// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * CI gate for scripts/generate-third-party.mjs + scripts/check-licenses.mjs.
 *
 * The generator used to skip every optional lock entry that was not a direct
 * dependency. Native binaries reach the tree exactly that way (a wrapper such
 * as sharp declares @img/sharp-libvips-* as optionalDependencies), so ten
 * LGPL-3.0-or-later packages sat in package-lock.json for three months while
 * THIRD_PARTY.md listed only the Apache-2.0 wrapper and the licence gate stayed
 * green. This drives the real scripts against a fixture lock and proves both
 * directions:
 *   - an optional, not-installed LGPL platform package IS listed, IS blocked,
 *     and FAILS the gate (exit 2)                      <- the regression
 *   - the same tree without that package passes clean (exit 0), and an
 *     "MIT OR GPL" dual licence is not over-blocked
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const GENERATE = resolve(import.meta.dirname, '..', 'scripts', 'generate-third-party.mjs');
const CHECK = resolve(import.meta.dirname, '..', 'scripts', 'check-licenses.mjs');

const WRAPPER = 'image-wrapper';
const DUAL = 'zip-lib';
const DEV_TOOL = 'dev-tool';
const LIBVIPS = '@img/fixture-libvips-linux-x64';
const WIN32 = '@img/fixture-win32-x64';

interface LockEntry {
  version: string;
  license: string;
  dev?: boolean;
  optional?: boolean;
  os?: string[];
  cpu?: string[];
  optionalDependencies?: Record<string, string>;
}

interface ReportEntry {
  source: string;
  name: string;
  version: string;
  license: string;
  licenseStatus: string;
  policyStatus: string;
  direct: boolean;
  scope: string;
  optional: boolean;
}

interface Report {
  entries: ReportEntry[];
  summary: { totalDependencies: number; skippedSources: string[] };
}

const fixtureRoots: string[] = [];
afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
});

/**
 * A minimal npm workspace: package.json, a v3 package-lock.json and the
 * node_modules that npm would leave on a macOS machine. The @img/* platform
 * packages are in the lock only, exactly as on any machine but their own.
 */
function writeFixture(options: { withPlatformPackages: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'third-party-gen-'));
  fixtureRoots.push(root);

  const packages: Record<string, LockEntry | Record<string, unknown>> = {
    '': {
      name: 'fixture-app',
      version: '0.0.0',
      dependencies: { [WRAPPER]: '^1.0.0', [DUAL]: '^3.0.0' },
      devDependencies: { [DEV_TOOL]: '^2.0.0' },
    },
    [`node_modules/${WRAPPER}`]: {
      version: '1.0.0',
      license: 'Apache-2.0',
      optionalDependencies: { [LIBVIPS]: '1.0.0', [WIN32]: '1.0.0' },
    },
    [`node_modules/${DUAL}`]: { version: '3.0.0', license: '(MIT OR GPL-3.0-or-later)' },
    [`node_modules/${DEV_TOOL}`]: { version: '2.0.0', dev: true, license: 'MIT' },
  };
  if (options.withPlatformPackages) {
    packages[`node_modules/${LIBVIPS}`] = {
      version: '1.0.0',
      license: 'LGPL-3.0-or-later',
      optional: true,
      os: ['linux'],
      cpu: ['x64'],
    };
    packages[`node_modules/${WIN32}`] = {
      version: '1.0.0',
      license: 'Apache-2.0 AND LGPL-3.0-or-later',
      optional: true,
      os: ['win32'],
      cpu: ['x64'],
    };
  }

  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        version: '0.0.0',
        dependencies: { [WRAPPER]: '^1.0.0', [DUAL]: '^3.0.0' },
        devDependencies: { [DEV_TOOL]: '^2.0.0' },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({ name: 'fixture-app', version: '0.0.0', lockfileVersion: 3, requires: true, packages }, null, 2),
  );
  // Installed packages carry their own package.json; the platform packages do not exist here.
  for (const [name, license] of [
    [WRAPPER, 'Apache-2.0'],
    [DUAL, '(MIT OR GPL-3.0-or-later)'],
    [DEV_TOOL, 'MIT'],
  ] as const) {
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(
      join(root, 'node_modules', name, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', license }),
    );
  }
  return root;
}

function runGenerator(root: string) {
  return spawnSync('node', [GENERATE], { cwd: root, encoding: 'utf8' });
}

function runCheck(root: string) {
  return spawnSync('node', [CHECK], { cwd: root, encoding: 'utf8' });
}

function readReport(root: string): Report {
  return JSON.parse(readFileSync(join(root, 'compliance-report.json'), 'utf8')) as Report;
}

describe('third-party notice generator: optional platform packages', () => {
  it('lists an optional, not-installed LGPL platform package and the gate fails on it', () => {
    const root = writeFixture({ withPlatformPackages: true });

    const gen = runGenerator(root);
    expect(gen.status, gen.stdout + gen.stderr).toBe(0);
    expect(existsSync(join(root, 'THIRD_PARTY.md'))).toBe(true);

    const report = readReport(root);
    const npm = report.entries.filter((entry) => entry.source === 'npm');
    expect(npm.map((entry) => entry.name).sort()).toEqual([LIBVIPS, WIN32, DEV_TOOL, WRAPPER, DUAL].sort());

    const libvips = npm.find((entry) => entry.name === LIBVIPS);
    expect(libvips).toBeDefined();
    // Licence comes from the lock record: the package is not in node_modules.
    expect(libvips?.license).toBe('LGPL-3.0-or-later');
    expect(libvips?.licenseStatus).toBe('known');
    expect(libvips?.policyStatus).toBe('blocked');
    expect(libvips?.direct).toBe(false);
    expect(libvips?.optional).toBe(true);
    expect(libvips?.scope).toBe('runtime');

    // "Apache-2.0 AND LGPL-3.0-or-later": both apply, so the LGPL part governs.
    const win32 = npm.find((entry) => entry.name === WIN32);
    expect(win32?.policyStatus).toBe('blocked');

    // The wrapper itself is still what it always was.
    const wrapper = npm.find((entry) => entry.name === WRAPPER);
    expect(wrapper?.license).toBe('Apache-2.0');
    expect(wrapper?.policyStatus).toBe('allowed');
    expect(wrapper?.direct).toBe(true);

    const thirdParty = readFileSync(join(root, 'THIRD_PARTY.md'), 'utf8');
    expect(thirdParty).toContain(`| ${LIBVIPS} | 1.0.0 | LGPL-3.0-or-later | blocked | no |`);

    const check = runCheck(root);
    expect(check.status, check.stdout + check.stderr).toBe(2);
    expect(check.stderr).toContain('Blocked licenses detected (2)');
    expect(check.stderr).toContain(`${LIBVIPS}@1.0.0 (LGPL-3.0-or-later)`);
    expect(check.stderr).toContain(`${WIN32}@1.0.0 (Apache-2.0 AND LGPL-3.0-or-later)`);
  });

  it('passes clean without the platform packages and does not over-block an OR dual licence', () => {
    const root = writeFixture({ withPlatformPackages: false });

    const gen = runGenerator(root);
    expect(gen.status, gen.stdout + gen.stderr).toBe(0);

    const report = readReport(root);
    const npm = report.entries.filter((entry) => entry.source === 'npm');
    expect(npm.map((entry) => entry.name).sort()).toEqual([DEV_TOOL, WRAPPER, DUAL].sort());
    expect(npm.some((entry) => entry.name.startsWith('@img/'))).toBe(false);
    expect(npm.some((entry) => entry.policyStatus === 'blocked')).toBe(false);

    // A choice ("MIT OR GPL") is review material, not a block.
    const dual = npm.find((entry) => entry.name === DUAL);
    expect(dual?.policyStatus).toBe('needs-review');

    const devTool = npm.find((entry) => entry.name === DEV_TOOL);
    expect(devTool?.scope).toBe('dev');
    expect(devTool?.optional).toBe(false);

    // No Cargo.toml in the fixture, so no cargo section — and nothing was skipped.
    expect(report.summary.skippedSources).toEqual([]);

    const check = runCheck(root);
    expect(check.status, check.stdout + check.stderr).toBe(0);
    expect(check.stdout).toContain('License check passed (3 entries');
  });
});

describe('third-party notice generator: a skipped source is not a pass', () => {
  it('takes the SKIPPED path, not a crash, when cargo is not on PATH', () => {
    const root = writeFixture({ withPlatformPackages: false });
    // A Cargo manifest makes the generator try cargo; a PATH holding only the
    // node binary makes that spawn fail (ENOENT), the case that used to throw.
    mkdirSync(join(root, 'src-tauri'), { recursive: true });
    writeFileSync(join(root, 'src-tauri', 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.0.0"\n');

    const gen = spawnSync(process.execPath, [GENERATE], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: dirname(process.execPath) },
    });
    expect(gen.status, gen.stdout + gen.stderr).toBe(0);
    expect(gen.stderr).not.toContain('TypeError');
    expect(gen.stderr).toContain('SKIPPED (not a pass): cargo section omitted');
    expect(gen.stderr).toContain('ENOENT');

    const report = readReport(root);
    expect(report.summary.skippedSources).toEqual(['cargo']);
    expect(report.entries.some((entry) => entry.source === 'cargo')).toBe(false);
    const thirdParty = readFileSync(join(root, 'THIRD_PARTY.md'), 'utf8');
    expect(thirdParty).toContain('INCOMPLETE — sources not inventoried in this run: cargo');

    // ...and the gate refuses that report.
    const check = runCheck(root);
    expect(check.status, check.stdout + check.stderr).toBe(2);
    expect(check.stderr).toContain('Incomplete compliance report: not inventoried in this run: cargo');
  });

  it('fails the gate on a report whose summary lists a skipped source, and passes when the list is empty', () => {
    const allowedEntry = {
      source: 'npm',
      name: 'image-wrapper',
      version: '1.0.0',
      license: 'Apache-2.0',
      licenseStatus: 'known',
      policyStatus: 'allowed',
      direct: true,
    };
    const writeReport = (skippedSources: string[]): string => {
      const root = mkdtempSync(join(tmpdir(), 'third-party-check-'));
      fixtureRoots.push(root);
      writeFileSync(
        join(root, 'compliance-report.json'),
        JSON.stringify({
          generatedAt: '2026-09-02T00:00:00.000Z',
          entries: [allowedEntry],
          summary: { totalDependencies: 1, skippedSources },
        }),
      );
      return root;
    };

    const incomplete = runCheck(writeReport(['cargo']));
    expect(incomplete.status, incomplete.stdout + incomplete.stderr).toBe(2);
    expect(incomplete.stderr).toContain('not inventoried in this run: cargo');
    expect(incomplete.stdout).not.toContain('License check passed');

    const complete = runCheck(writeReport([]));
    expect(complete.status, complete.stdout + complete.stderr).toBe(0);
    expect(complete.stdout).toContain('License check passed (1 entries');
  });
});
