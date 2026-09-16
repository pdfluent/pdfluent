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
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  licenseFilePath?: string | null;
  repository?: string;
  homepage?: string;
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

/**
 * The same lockfile must produce the same inventory on every machine.
 *
 * It did not. The npm section read `license`, `repository`, `homepage` and the
 * licence file out of node_modules whenever the package happened to be
 * installed, and a platform-optional package is installed on exactly one
 * OS/CPU. So `@rollup/rollup-darwin-arm64` carried a repository URL in the
 * copy generated on a Mac and `@rollup/rollup-linux-x64-gnu` carried it in the
 * copy generated on the Linux runner — two inventories of one lockfile, and a
 * freshness check in .github/workflows/compliance.yml that could not be green
 * on both.
 *
 * The npm section is now read from package-lock.json alone, so these three
 * layouts — the darwin optional set, the linux optional set, and no install at
 * all — have to agree byte for byte.
 */
const NATIVE_DARWIN = '@fixture/native-darwin-arm64';
const NATIVE_LINUX = '@fixture/native-linux-x64';
const HOST_TOOL = 'host-tool';

const GENERATED_FILES = [
  'compliance-report.json',
  'THIRD_PARTY.md',
  'THIRD_PARTY_ATTRIBUTIONS.md',
] as const;

/**
 * One lockfile, one of the platform sets on disk. `installed` names the
 * platform packages npm would have unpacked on that host; the plain dependency
 * is always there, as npm ci leaves it on every host.
 */
function writePlatformFixture(installed: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'third-party-platform-'));
  fixtureRoots.push(root);

  const manifest = {
    name: 'fixture-app',
    version: '0.0.0',
    dependencies: { [HOST_TOOL]: '^5.0.0' },
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        version: '0.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': manifest,
          [`node_modules/${HOST_TOOL}`]: {
            version: '5.0.0',
            license: 'MIT',
            optionalDependencies: { [NATIVE_DARWIN]: '5.0.0', [NATIVE_LINUX]: '5.0.0' },
          },
          [`node_modules/${NATIVE_DARWIN}`]: {
            version: '5.0.0',
            license: 'MIT',
            optional: true,
            os: ['darwin'],
            cpu: ['arm64'],
          },
          [`node_modules/${NATIVE_LINUX}`]: {
            version: '5.0.0',
            license: 'MIT',
            optional: true,
            os: ['linux'],
            cpu: ['x64'],
          },
        },
      },
      null,
      2,
    ),
  );

  const install = (name: string, extra: Record<string, unknown>): void => {
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(
      join(root, 'node_modules', name, 'package.json'),
      JSON.stringify({ name, version: '5.0.0', license: 'MIT', ...extra }),
    );
    writeFileSync(join(root, 'node_modules', name, 'LICENSE'), 'MIT\n');
  };
  install(HOST_TOOL, {});
  for (const name of installed) {
    // The fields that used to leak the host into the inventory.
    install(name, {
      repository: { url: `git+https://example.invalid/${name.split('/').pop()}.git` },
      homepage: `https://example.invalid/${name.split('/').pop()}`,
    });
  }
  return root;
}

function generatedFiles(root: string): Record<string, string> {
  const gen = runGenerator(root);
  expect(gen.status, gen.stdout + gen.stderr).toBe(0);
  return Object.fromEntries(
    GENERATED_FILES.map((name) => [name, readFileSync(join(root, name), 'utf8')]),
  );
}

describe('third-party notice generator: the inventory does not depend on the host', () => {
  it('writes the same files from the darwin set, the linux set and no install at all', () => {
    const onDarwin = generatedFiles(writePlatformFixture([NATIVE_DARWIN]));
    const onLinux = generatedFiles(writePlatformFixture([NATIVE_LINUX]));
    const fromLockAlone = generatedFiles(writePlatformFixture([]));

    for (const name of GENERATED_FILES) {
      expect(onLinux[name], `${name} differs between the darwin and linux layouts`).toBe(
        onDarwin[name],
      );
      // The freshness check has to be reproducible without an install at all.
      expect(fromLockAlone[name], `${name} depends on node_modules`).toBe(onDarwin[name]);
    }
  });

  it('records both platform binaries, from the lock, with no host-dependent field', () => {
    const report = (() => {
      const root = writePlatformFixture([NATIVE_DARWIN]);
      runGenerator(root);
      return readReport(root);
    })();

    for (const name of [NATIVE_DARWIN, NATIVE_LINUX]) {
      const entry = report.entries.find((candidate) => candidate.name === name);
      expect(entry, `${name} is missing from the inventory`).toBeDefined();
      expect(entry?.license).toBe('MIT');
      expect(entry?.optional).toBe(true);
      expect(entry?.policyStatus).toBe('allowed');
      // Present on this host or not, the row says the same thing.
      expect(entry?.licenseFilePath ?? null).toBeNull();
      expect(entry?.repository ?? '').toBe('');
      expect(entry?.homepage ?? '').toBe('');
    }
  });
});

/**
 * The cargo half had the same disease in a different organ.
 *
 * `licenseFilePath` recorded where this machine unpacked the crate, and that
 * prefix is CARGO_HOME: `~/.cargo/registry/src/...` on a developer Mac,
 * `/var/cache/cargo-home/registry/src/...` on the Linux runner. Compliance run
 * 35082579311 failed on exactly that and nothing else -- 214 lines, all of them
 * a licenseFilePath prefix, with the registry hash, the crate directory, the
 * engine checkout hash and the pinned short revision already identical.
 *
 * Only the part below CARGO_HOME is a fact about the crate, so that is what the
 * inventory records now.
 */
const REGISTRY_DIR = 'registry/src/index.crates.io-1949cf8c6b5b557f/fixture-dep-1.0.0';
const GIT_CHECKOUT_DIR = 'git/checkouts/fixture-engine-e95b3c6e45dc1908/51f6f1b/crates/fixture-crate';

/**
 * A cargo home laid out the way cargo lays one out, with the two shapes that
 * reach the inventory: an unpacked registry crate and a git checkout.
 */
function writeCargoHome(root: string, name: string): string {
  const cargoHome = join(root, name);
  for (const [dir, crate] of [
    [REGISTRY_DIR, 'fixture-dep'],
    [GIT_CHECKOUT_DIR, 'fixture-crate'],
  ] as const) {
    mkdirSync(join(cargoHome, dir), { recursive: true });
    writeFileSync(
      join(cargoHome, dir, 'Cargo.toml'),
      `[package]\nname = "${crate}"\nversion = "1.0.0"\n`,
    );
    writeFileSync(join(cargoHome, dir, 'LICENSE'), 'MIT\n');
  }
  return cargoHome;
}

/**
 * A workspace whose `cargo` is a stub printing metadata for two crates that
 * live in `cargoHome`. The real cargo would print the same shape; what the test
 * needs is control over the prefix, which is the whole point.
 */
function writeCargoFixture(cargoHomeName: string): { workspace: string; bin: string } {
  const root = mkdtempSync(join(tmpdir(), 'third-party-cargo-'));
  fixtureRoots.push(root);
  const cargoHome = writeCargoHome(root, cargoHomeName);
  const workspace = join(root, 'workspace');
  mkdirSync(join(workspace, 'src-tauri'), { recursive: true });
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'fixture-app', version: '0.0.0' }));
  writeFileSync(
    join(workspace, 'package-lock.json'),
    JSON.stringify({ name: 'fixture-app', version: '0.0.0', lockfileVersion: 3, packages: {} }),
  );
  writeFileSync(
    join(workspace, 'src-tauri', 'Cargo.toml'),
    '[package]\nname = "fixture"\nversion = "0.0.0"\n',
  );

  const metadata = {
    packages: [
      {
        id: 'fixture-dep 1.0.0',
        name: 'fixture-dep',
        version: '1.0.0',
        license: 'MIT',
        repository: 'https://example.invalid/fixture-dep',
        homepage: '',
        manifest_path: join(cargoHome, REGISTRY_DIR, 'Cargo.toml'),
      },
      {
        id: 'fixture-crate 1.0.0',
        name: 'fixture-crate',
        version: '1.0.0',
        license: 'MIT OR LicenseRef-PDFluent-Commercial',
        repository: '',
        homepage: '',
        license_file: 'LICENSE',
        manifest_path: join(cargoHome, GIT_CHECKOUT_DIR, 'Cargo.toml'),
      },
    ],
    workspace_members: [],
  };
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const cargoStub = join(bin, 'cargo');
  const metadataPath = join(root, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata));
  // Node, not /bin/sh: the stub has to run on a PATH that holds nothing else.
  writeFileSync(
    cargoStub,
    `#!${process.execPath}\n` +
      `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(metadataPath)}, 'utf8'));\n`,
  );
  chmodSync(cargoStub, 0o755);
  return { workspace, bin };
}

describe('third-party notice generator: the inventory does not record CARGO_HOME', () => {
  it('writes the same rows whichever directory cargo unpacked the crates into', () => {
    const run = (cargoHomeName: string): Report => {
      const { workspace, bin } = writeCargoFixture(cargoHomeName);
      const gen = spawnSync(process.execPath, [GENERATE], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}` },
      });
      expect(gen.status, gen.stdout + gen.stderr).toBe(0);
      expect(gen.stderr).not.toContain('SKIPPED');
      return readReport(workspace);
    };

    // The two shapes this has actually been seen in: a home-relative cargo home
    // on a developer machine and a system one on the CI runner.
    const onDeveloperMachine = run('dot-cargo');
    const onRunner = run('var-cache-cargo-home');

    expect(onRunner.entries).toEqual(onDeveloperMachine.entries);

    const paths = onRunner.entries.map((entry) => entry.licenseFilePath);
    expect(paths).toContain(`${REGISTRY_DIR}/LICENSE`);
    expect(paths).toContain(`${GIT_CHECKOUT_DIR}/LICENSE`);
    // The crate is identified, the machine is not.
    for (const recorded of paths) {
      expect(recorded, `${recorded} still carries a host prefix`).not.toContain('dot-cargo');
      expect(recorded).not.toContain('var-cache-cargo-home');
      expect(recorded?.startsWith('/')).toBe(false);
    }
  });
});
