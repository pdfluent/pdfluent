// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * OCR is bundled in every build, not downloaded (owner decision 19-10).
 *
 * What has to hold, and what turns red when it stops holding:
 *
 * - the bundle is assembled only from files the committed manifest pins
 *   (SHA-256 and size) -- a tampered or swapped file stops the build;
 * - an unpublished manifest stops the build instead of bundling unpinned bytes;
 * - a finished bundle with a changed language pack, a missing file, a thin
 *   binary or a stray file fails verification; on Windows the binary itself is
 *   judged by hash;
 * - every release script (Mac DMG, Mac App Store, Windows MSI) stages the bundle
 *   before it builds, builds with PDFLUENT_REQUIRE_OCR_BUNDLE=1 and verifies the
 *   bundle inside the finished app;
 * - the macOS helper is judged against the sandbox-inherit entitlements;
 * - no download code, no download host and no download feature is left.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUNDLES,
  BUNDLE_IN_APP,
  HELPER_ENTITLEMENTS,
  THIN_PLATFORMS,
  hostBundle,
  readManifest,
  rehearsalManifest,
  stageBundle,
  verifyBundle,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/ocr-component/ocr-bundle.mjs';
import {
  judge as smokeJudge,
  smoke,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/ocr-component/ocr-smoke.mjs';
import {
  INHERIT_EXPECTED,
  OCR_HELPER,
  helperProblems,
  nestedHelpers,
  parseEntitlements,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/mas-entitlements.mjs';
import {
  ALLOWED,
  HTTP_CLIENT_EXCEPTIONS,
  checkNoHttpClient,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from './../scripts/ci/offline-allowlist.mjs';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

interface Entry { path: string; sha256: string; size: number; executable?: boolean }
interface Manifest {
  published: boolean;
  platforms: Record<string, { binary: string; files: Entry[] }>;
  languages: Record<string, { name: string; path: string; sha256: string; size: number }>;
}

/** A small published manifest and the build folder that matches it. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-bundle-'));
  made.push(dir);
  const build = join(dir, 'build');
  const lic = 'Apache-2.0 text';
  const win = 'windows-x86_64';
  const bodies: Record<string, string> = {
    [`${THIN_PLATFORMS.arm64}/bin/tesseract`]: 'arm64 binary',
    [`${THIN_PLATFORMS.x86_64}/bin/tesseract`]: 'x86_64 binary',
    [`${win}/bin/tesseract.exe`]: 'signed windows binary',
    [`${THIN_PLATFORMS.arm64}/LICENSES/tesseract-LICENSE.txt`]: lic,
    [`${THIN_PLATFORMS.x86_64}/LICENSES/tesseract-LICENSE.txt`]: lic,
    [`${win}/LICENSES/tesseract-LICENSE.txt`]: lic,
    'tessdata/eng.traineddata': 'english pack',
    'tessdata/nld.traineddata': 'dutch pack',
  };
  for (const [path, body] of Object.entries(bodies)) {
    mkdirSync(join(build, path, '..'), { recursive: true });
    writeFileSync(join(build, path), body);
  }
  const entry = (platform: string, binary: string): Manifest['platforms'][string] => ({
    binary,
    files: [
      { path: binary, sha256: sha(bodies[`${platform}/${binary}`]!), size: bodies[`${platform}/${binary}`]!.length, executable: true },
      { path: 'LICENSES/tesseract-LICENSE.txt', sha256: sha(lic), size: lic.length, executable: false },
    ],
  });
  const lang = (code: string, name: string) => ({
    name, path: `${code}.traineddata`,
    sha256: sha(bodies[`tessdata/${code}.traineddata`]!), size: bodies[`tessdata/${code}.traineddata`]!.length,
  });
  const manifest: Manifest = {
    published: true,
    platforms: {
      [THIN_PLATFORMS.arm64]: entry(THIN_PLATFORMS.arm64, 'bin/tesseract'),
      [THIN_PLATFORMS.x86_64]: entry(THIN_PLATFORMS.x86_64, 'bin/tesseract'),
      [win]: entry(win, 'bin/tesseract.exe'),
    },
    languages: { eng: lang('eng', 'English'), nld: lang('nld', 'Nederlands') },
  };
  // lipo stand-in: the "universal" file is the two inputs side by side.
  const merge = (inputs: string[], out: string) =>
    writeFileSync(out, inputs.map((i) => readFileSync(i, 'utf8')).join('+'));
  const signed: string[] = [];
  const sign = (binary: string) => { signed.push(binary); };
  return { dir, build, manifest, merge, sign, signed, out: join(dir, 'bundle') };
}

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

const universal = () => ['arm64', 'x86_64'];

describe('staging the macOS bundle (Mac DMG and Mac App Store)', () => {
  it('bundles exactly what the manifest pins, with a universal binary that is signed again', () => {
    const f = fixture();
    stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign, platform: 'macos-universal' });
    expect(readFileSync(join(f.out, 'bin/tesseract'), 'utf8')).toBe('arm64 binary+x86_64 binary');
    expect(readFileSync(join(f.out, 'tessdata/nld.traineddata'), 'utf8')).toBe('dutch pack');
    // A lipo merge has no valid signature; it must be signed before it is bundled.
    expect(f.signed).toEqual([join(f.out, 'bin/tesseract')]);
    expect(verifyBundle(f.out, f.manifest, universal, 'macos-universal')).toEqual([]);
  });

  it('stops the build on a language pack whose bytes are not the pinned ones', () => {
    const f = fixture();
    writeFileSync(join(f.build, 'tessdata/eng.traineddata'), 'english EVIL'); // same length, other bytes
    expect(() => stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign }))
      .toThrow(/tessdata\/eng\.traineddata: SHA-256 differs/);
  });

  it('stops the build on a binary that is not the pinned one, and on a missing file', () => {
    const f = fixture();
    writeFileSync(join(f.build, THIN_PLATFORMS.x86_64, 'bin/tesseract'), 'x86_64 EVIL!');
    expect(() => stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign }))
      .toThrow(/macos-x86_64\/bin\/tesseract/);
    const g = fixture();
    rmSync(join(g.build, 'tessdata/nld.traineddata'));
    expect(() => stageBundle({ buildDir: g.build, outDir: g.out, manifest: g.manifest, merge: g.merge, sign: g.sign }))
      .toThrow(/tessdata\/nld\.traineddata: missing/);
  });

  it('refuses a manifest that is not published rather than bundling unpinned bytes', () => {
    const f = fixture();
    f.manifest.languages.eng!.sha256 = '';
    f.manifest.published = false;
    expect(() => stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign }))
      .toThrow(/not published/);
  });

  it('refuses to stage into a folder that holds files it does not own (nothing is deleted)', () => {
    const f = fixture();
    mkdirSync(f.out, { recursive: true });
    writeFileSync(join(f.out, 'old-model.bin'), 'x');
    expect(() => stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign }))
      .toThrow(/old-model\.bin/);
  });

  it('the committed manifest names both macOS slices and the Windows binary, with one shared data set', () => {
    const m = readManifest() as Manifest;
    expect(Object.keys(m.platforms)).toEqual(expect.arrayContaining([...Object.values(THIN_PLATFORMS), 'windows-x86_64'] as string[]));
    const data = (key: string) => m.platforms[key]!.files.filter((e) => e.path !== m.platforms[key]!.binary);
    expect(data(THIN_PLATFORMS.x86_64)).toEqual(data(THIN_PLATFORMS.arm64));
    expect(data('windows-x86_64')).toEqual(data(THIN_PLATFORMS.arm64));
  });
});

describe('staging the Windows bundle (MSI and Store)', () => {
  it('bundles the pinned, already signed tesseract.exe as it is: nothing is merged or re-signed', () => {
    const f = fixture();
    const merge = () => { throw new Error('nothing is merged on Windows'); };
    const sign = () => { throw new Error('the Windows binary is signed before it is pinned'); };
    stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge, sign, platform: 'windows-x86_64' });
    expect(readFileSync(join(f.out, 'bin/tesseract.exe'), 'utf8')).toBe('signed windows binary');
    expect(verifyBundle(f.out, f.manifest, () => { throw new Error('no lipo on Windows'); }, 'windows-x86_64')).toEqual([]);
  });

  it('stops the build on a tesseract.exe that is not the pinned one', () => {
    const f = fixture();
    writeFileSync(join(f.build, 'windows-x86_64/bin/tesseract.exe'), 'unsigned windows binarY');
    expect(() => stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, platform: 'windows-x86_64' }))
      .toThrow(/windows-x86_64\/bin\/tesseract\.exe/);
  });

  it('verification judges the Windows binary by hash, not only by name', () => {
    const f = fixture();
    stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, platform: 'windows-x86_64' });
    writeFileSync(join(f.out, 'bin/tesseract.exe'), 'signed windows binarY'); // same length
    expect(verifyBundle(f.out, f.manifest, universal, 'windows-x86_64').join('\n'))
      .toMatch(/bin\/tesseract\.exe: SHA-256 differs/);
  });

  it('the host picks its own bundle and refuses a platform the editor does not ship on', () => {
    expect(hostBundle('darwin')).toBe('macos-universal');
    expect(hostBundle('win32')).toBe('windows-x86_64');
    expect(() => hostBundle('linux')).toThrow(/macOS and Windows/);
    expect(Object.keys(BUNDLES).sort()).toEqual(['macos-aarch64', 'macos-universal', 'macos-x86_64', 'windows-x86_64']);
  });
});

describe('the CI rehearsal on a runner that builds the component itself', () => {
  it('pins the build it is given into a copy, stages one architecture and verifies it', () => {
    const f = fixture();
    f.manifest.published = false;
    for (const e of Object.values(f.manifest.platforms)) for (const file of e.files) { file.sha256 = ''; file.size = 0; }
    for (const l of Object.values(f.manifest.languages)) { l.sha256 = ''; l.size = 0; }
    const copy = rehearsalManifest(f.build, 'macos-aarch64', f.manifest) as Manifest;
    expect(copy.published).toBe(true);
    expect(Object.keys(copy.platforms)).toEqual([THIN_PLATFORMS.arm64]);
    expect(f.manifest.published, 'the committed manifest is never touched').toBe(false);
    stageBundle({ buildDir: f.build, outDir: f.out, manifest: copy, merge: f.merge, sign: f.sign, platform: 'macos-aarch64' });
    expect(verifyBundle(f.out, copy, () => ['arm64'], 'macos-aarch64')).toEqual([]);
    // A release never takes this route: the committed, unpublished manifest stops it.
    expect(() => stageBundle({ buildDir: f.build, outDir: join(f.dir, 'other'), manifest: f.manifest, merge: f.merge, sign: f.sign, platform: 'macos-aarch64' }))
      .toThrow(/not published/);
  });

  it('is the route the macOS and Windows CI jobs take, and no release script has it', () => {
    const ci = read('.github/workflows/quality.yml');
    expect(ci.match(/ocr-bundle\.mjs --stage[^\n]*--rehearse/g)?.length).toBe(2);
    expect(ci.match(/PDFLUENT_REQUIRE_OCR_BUNDLE: "?1"?/g)?.length).toBeGreaterThanOrEqual(2);
    for (const script of ['scripts/build-mas.sh', 'scripts/notarize-macos.sh', 'scripts/release-macos.sh', 'scripts/release-windows.ps1']) {
      expect(read(script), script).not.toContain('--rehearse');
    }
  });
});

describe('verifying a finished bundle', () => {
  function staged() {
    const f = fixture();
    stageBundle({ buildDir: f.build, outDir: f.out, manifest: f.manifest, merge: f.merge, sign: f.sign });
    return f;
  }

  it('catches a changed language pack, a removed licence, a thin binary and a stray file', () => {
    const a = staged();
    writeFileSync(join(a.out, 'tessdata/eng.traineddata'), 'english EVIL');
    expect(verifyBundle(a.out, a.manifest, universal).join('\n')).toMatch(/eng\.traineddata: SHA-256 differs/);

    const b = staged();
    rmSync(join(b.out, 'LICENSES/tesseract-LICENSE.txt'));
    expect(verifyBundle(b.out, b.manifest, universal).join('\n')).toMatch(/LICENSE\.txt: missing/);

    const c = staged();
    expect(verifyBundle(c.out, c.manifest, () => ['arm64']).join('\n')).toMatch(/architectures \[arm64\]/);

    const d = staged();
    writeFileSync(join(d.out, 'extra.bin'), 'x');
    expect(verifyBundle(d.out, d.manifest, universal).join('\n')).toMatch(/extra\.bin/);
  });
});

describe('the release scripts', () => {
  const mas = read('scripts/build-mas.sh');
  const dmg = read('scripts/notarize-macos.sh');
  const site = read('scripts/release-macos.sh');
  const win = read('scripts/release-windows.ps1');

  /** Index of `needle` in the code, ignoring comment lines. */
  const at = (script: string, needle: string) => {
    let offset = 0;
    for (const line of script.split('\n')) {
      if (!line.trimStart().startsWith('#') && line.includes(needle)) return offset + line.indexOf(needle);
      offset += line.length + 1;
    }
    return -1;
  };

  it.each([
    ['build-mas.sh (Mac App Store)', mas, 'npm run tauri build'],
    ['notarize-macos.sh (Mac DMG)', dmg, 'npm run tauri build'],
    ['release-macos.sh (Mac DMG, site)', site, 'npm run tauri build'],
    ['release-windows.ps1 (MSI)', win, 'npm run tauri build'],
  ])('%s stages the bundle before it builds, and builds only with it', (_name, script, build) => {
    const stage = at(script, 'ocr-bundle.mjs');
    expect(stage, 'no staging step').toBeGreaterThan(-1);
    expect(stage).toBeLessThan(at(script, build));
    expect(script).toMatch(/PDFLUENT_REQUIRE_OCR_BUNDLE.{0,3}=.{0,3}"?1/);
    expect(script).toContain('PDFLUENT_OCR_COMPONENT_BUILD');
  });

  it.each([
    ['build-mas.sh', mas, 'macos-universal'],
    ['notarize-macos.sh', dmg, 'macos-universal'],
    ['release-macos.sh', site, 'macos-universal'],
    ['release-windows.ps1', win, 'windows-x86_64'],
  ])('%s verifies the bundle inside the finished build', (_name, script, platform) => {
    const verify = script.indexOf('--verify');
    expect(verify, 'no verification step').toBeGreaterThan(-1);
    expect(script.slice(verify, verify + 400)).toContain(platform);
    expect(verify).toBeGreaterThan(at(script, 'npm run tauri build'));
  });

  it('build-mas.sh compiles the store build with no OCR feature to choose', () => {
    const cargoLine = mas.split('\n').find((l) => !l.trimStart().startsWith('#') && l.includes('--no-default-features'));
    expect(cargoLine).toBeDefined();
    expect(cargoLine).toMatch(/--features custom-protocol\s*$/);
    expect(mas).not.toMatch(/ocr-bundled|ocr-download|mas-bundle/);
  });

  it('build-mas.sh verifies the bundle after the final seal and reads the helper signatures back', () => {
    const seal = mas.indexOf('--entitlements "${REPO_ROOT}/src-tauri/Entitlements.appstore.plist"');
    expect(mas.indexOf('ocr-bundle.mjs" --verify')).toBeGreaterThan(seal);
    expect(mas).toContain('Contents/Resources/resources/ocr');
    expect(mas).toMatch(/mas-entitlements\.mjs" --pkg "\$\{OUT\}" --helpers/);
  });

  it('notarize-macos.sh signs the bundled Tesseract for the sandbox and checks it afterwards', () => {
    // The direct build is sandboxed too (Entitlements.plist); a helper without
    // `inherit` is killed at launch.
    expect(dmg).toContain('OCR_INHERIT_ENTITLEMENTS');
    expect(dmg).toMatch(/--entitlements "\$\{OCR_INHERIT_ENTITLEMENTS\}"/);
    expect(dmg).toContain('com.apple.security.inherit');
    expect(dmg).toMatch(/flags=\.\*runtime/);
  });

  it('notarize-macos.sh never pipes codesign into grep -q (pipefail turns the early exit into a failure)', () => {
    // `grep -q` exits at the first match, codesign then dies of SIGPIPE, and
    // `set -o pipefail` reports the pipe as failed: the Hardened Runtime check
    // failed on every run. The output is captured first.
    expect(dmg).toContain('set -euo pipefail');
    expect(dmg).not.toMatch(/\bcodesign\b[^\n|]*\|\s*grep -q/);
  });

  it('release-windows.ps1 refuses a signed build whose bundled tesseract.exe is not signed', () => {
    expect(win).toContain('Get-AuthenticodeSignature');
    expect(win).toMatch(/Status -ne 'Valid'/);
  });

  it('src-tauri/build.rs stops a build that asked for the bundle and has none', () => {
    const rs = read('src-tauri/build.rs');
    expect(rs).toContain('PDFLUENT_REQUIRE_OCR_BUNDLE');
    expect(rs).toMatch(/panic!/);
  });
});

describe('where the app finds the bundle', () => {
  it('every build maps the staged folder to the folder the app reads, from one place', () => {
    const base = JSON.parse(read('src-tauri/tauri.conf.json')) as { bundle: { resources: Record<string, string> } };
    expect(base.bundle.resources['resources/ocr-bundle']).toBe('resources/ocr');
    // Not repeated in an overlay: a build profile cannot forget it or change it.
    const mas = JSON.parse(read('src-tauri/tauri.mas.conf.json')) as { bundle: { resources?: unknown } };
    expect(mas.bundle.resources).toBeUndefined();
    expect(BUNDLE_IN_APP).toBe('Contents/Resources/resources/ocr');
    // The Rust side reads <resources>/<BUNDLE_RESOURCE_DIR>; Tauri's resources land under it.
    expect(read('src-tauri/src/ocr_component.rs')).toContain('pub const BUNDLE_RESOURCE_DIR: &str = "resources/ocr";');
    expect(OCR_HELPER).toBe(`${BUNDLE_IN_APP}/bin/tesseract`);
  });

  it('the staged folder is not committed', () => {
    expect(read('.gitignore')).toMatch(/^src-tauri\/resources\/ocr-bundle\/$/m);
  });
});

describe('no download is left', () => {
  it('Cargo.toml has no ocr feature and no HTTP client of its own', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).not.toMatch(/ocr-download|ocr-bundled/);
    // reqwest may only appear as a dev-dependency (the update-feed TLS smoke).
    const beforeDev = cargo.split('[dev-dependencies]')[0]!;
    expect(beforeDev).not.toMatch(/^reqwest\s*=/m);
  });

  it('the app has no command that installs, cancels or removes the component', () => {
    const lib = read('src-tauri/src/lib.rs');
    for (const gone of ['install_ocr_component', 'cancel_ocr_component_install', 'remove_ocr_component', 'remove_ocr_language', 'OCR_INSTALLING']) {
      expect(lib, gone).not.toContain(gone);
    }
    const api = read('src/lib/tauri-api.ts');
    for (const gone of ['installOcrComponent', 'cancelOcrComponentInstall', 'removeOcrComponent', 'removeOcrLanguage']) {
      expect(api, gone).not.toContain(gone);
    }
  });

  it('the offline allow-list no longer contains the component host, and allows no HTTP client for it', () => {
    const origins = (ALLOWED as Array<{ origin: string }>).map((e) => e.origin);
    expect(origins.some((o) => o.includes('components.pdfluent.com'))).toBe(false);
    expect(HTTP_CLIENT_EXCEPTIONS).toEqual([]);
    // A direct, optional reqwest behind a feature would have been the exception; now it is a finding.
    expect(checkNoHttpClient('[dependencies]\nreqwest = { version = "0.13", optional = true }\n[features]\nocr-download = ["dep:reqwest"]\n'))
      .toEqual(['reqwest']);
    expect(checkNoHttpClient(read('src-tauri/Cargo.toml'))).toEqual([]);
  });

  it('the component host is gone from the allow-list and from the outbound-endpoint document', () => {
    for (const rel of ['scripts/ci/offline-allowlist.mjs', 'docs/OUTBOUND_ENDPOINTS.md', 'src-tauri/src/ocr_component.rs', 'src-tauri/tauri.conf.json']) {
      expect(read(rel), rel).not.toContain('components.pdfluent.com');
    }
    expect(existsOcrScript('publish.sh'), 'the upload script is gone').toBe(false);
  });
});

function existsOcrScript(name: string): boolean {
  try {
    readFileSync(join(ROOT, 'scripts/ocr-component', name));
    return true;
  } catch {
    return false;
  }
}

describe('the bundled Tesseract as a sandboxed helper', () => {
  const inherit = () => parseEntitlements(readFileSync(INHERIT_EXPECTED, 'utf8'));
  const xml = (body: string) => `<plist version="1.0"><dict>${body}</dict></plist>`;
  const GOOD = xml('<key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.inherit</key><true/>');

  it('inherits the sandbox and asks for nothing else', () => {
    expect([...inherit().keys()].sort()).toEqual(['com.apple.security.app-sandbox', 'com.apple.security.inherit']);
  });

  it('is the entitlements file the merged binary is signed with at staging time', () => {
    expect(HELPER_ENTITLEMENTS).toBe(INHERIT_EXPECTED);
  });

  it('is accepted when signed with the inherit entitlements', () => {
    expect(helperProblems([OCR_HELPER], inherit(), () => GOOD)).toEqual([]);
  });

  it('is rejected when the bundle has no OCR binary, or it was signed with the app entitlements', () => {
    expect(helperProblems([], inherit(), () => GOOD).join('\n')).toMatch(/not in the app/);
    const appEntitlements = xml(
      '<key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.network.client</key><true/>',
    );
    const problems = helperProblems([OCR_HELPER], inherit(), () => appEntitlements).join('\n');
    expect(problems).toMatch(/missing: com\.apple\.security\.inherit/);
    expect(problems).toMatch(/extra: com\.apple\.security\.network\.client/);
  });

  it('finds nested executables but not the main one', () => {
    const app = '/x/PDFluent.app';
    const files = [
      `${app}/Contents/MacOS/PDFluent`,
      `${app}/Contents/Resources/${OCR_HELPER.slice('Contents/Resources/'.length)}`,
      `${app}/Contents/Resources/resources/ocr/tessdata/eng.traineddata`,
    ];
    const found = nestedHelpers(app, () => files, (p: string) => !p.endsWith('.traineddata'));
    expect(found).toEqual([OCR_HELPER]);
  });
});

describe('the committed manifest, with real pins, against bytes that are not the pinned ones', () => {
  const committed = () => readManifest() as Manifest;

  it('is accepted by staging as published (no unpinned entry is left)', () => {
    const m = committed();
    expect(m.published).toBe(true);
    // Staging gets past the published check and stops on the missing build output instead.
    for (const platform of ['macos-universal', 'macos-aarch64', 'macos-x86_64', 'windows-x86_64']) {
      const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-real-'));
      made.push(dir);
      expect(() => stageBundle({ buildDir: dir, outDir: join(dir, 'out'), manifest: m, merge: () => {}, sign: () => {}, platform }), platform)
        .toThrow(/: missing/);
    }
  });

  it('refuses a Mac or Windows binary whose bytes differ from the pin, and a pack that does', () => {
    const m = committed();
    for (const [platform, slices] of [
      ['macos-aarch64', ['macos-aarch64']],
      ['macos-x86_64', ['macos-x86_64']],
      ['windows-x86_64', ['windows-x86_64']],
    ] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-real-'));
      made.push(dir);
      for (const key of slices) {
        for (const e of m.platforms[key]!.files) {
          mkdirSync(join(dir, key, e.path, '..'), { recursive: true });
          writeFileSync(join(dir, key, e.path), 'x'.repeat(e.size)); // right size, wrong bytes
        }
      }
      expect(() => stageBundle({ buildDir: dir, outDir: join(dir, 'out'), manifest: m, merge: () => {}, sign: () => {}, platform }), platform)
        .toThrow(/SHA-256 differs/);
    }
  });
});

describe('the entitlements plists the helper is signed with', () => {
  // A double hyphen inside an XML comment is invalid XML. plutil accepts it, the
  // kernel's entitlement parser (AMFI) does not: codesign fails on the Mac that
  // stages the bundle, which no other test run would show.
  it.each(['Entitlements.plist', 'Entitlements.appstore.plist', 'Entitlements.appstore.inherit.plist'])(
    '%s has no "--" inside an XML comment',
    (file) => {
      const text = read(`src-tauri/${file}`);
      for (const c of text.matchAll(/<!--([\s\S]*?)-->/g)) expect(c[1], file).not.toContain('--');
    },
  );
});

describe('the staged macOS OCR binary is run, not only hashed', () => {
  it('every macOS release script and the macOS CI job run ocr-smoke on what they stage', () => {
    for (const script of ['scripts/build-mas.sh', 'scripts/notarize-macos.sh', 'scripts/release-macos.sh']) {
      const text = read(script);
      expect(text, script).toMatch(/ocr-smoke\.mjs"? [^\n]*--universal/);
      expect(text.indexOf('ocr-smoke.mjs'), `${script}: smoke comes after staging`).toBeGreaterThan(text.indexOf('ocr-bundle.mjs'));
    }
    const ci = read('.github/workflows/quality.yml');
    expect(ci).toMatch(/ocr-smoke\.mjs/);
    expect(ci.indexOf('ocr-smoke.mjs')).toBeGreaterThan(ci.indexOf('Stage the OCR bundle (rehearsal'));
  });

  it('judges a binary that prints nothing, a wrong version and a wrong reading as broken', () => {
    const good = { status: 0, stdout: 'tesseract 5.5.1\n leptonica-1.85.0\n' };
    const read_ = { status: 0, stdout: 'PDFluent OCR 42\n' };
    expect(smokeJudge('arm64', good, read_)).toEqual([]);
    expect(smokeJudge('arm64', { status: 133, stdout: '' }, read_).join()).toMatch(/--version exit 133/);
    expect(smokeJudge('arm64', { status: 0, stdout: 'tesseract 4.1.1' }, read_).join()).toMatch(/--version/);
    expect(smokeJudge('x86_64', good, { status: 0, stdout: 'PDFluent OCR 4' }).join()).toMatch(/x86_64: OCR/);
    expect(smokeJudge('x86_64', good, { status: 1, stdout: 'PDFluent OCR 42' }).join()).toMatch(/OCR exit 1/);
  });

  it.runIf(process.platform === 'darwin')('a staged binary that is not a Mach-O fails the smoke run (on macOS)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-smoke-test-'));
    made.push(dir);
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(dir, 'bin/tesseract'), 'not a binary');
    expect(smoke(dir).problems.length).toBeGreaterThan(0);
  });

  it('the fixture is a real PNG', () => {
    expect(readFileSync(join(ROOT, 'tests/fixtures/ocr/hello-ocr.png')).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});

describe('the Windows release signs the component before it pins and stages it', () => {
  it('signs, verifies, re-pins the signed bytes, then stages, in that order', () => {
    const ps = read('scripts/release-windows.ps1');
    const at = (needle: string) => ps.indexOf(needle);
    const order = [
      'src-tauri/scripts/sign-windows.ps1")',
      'is not validly Authenticode-signed',
      'write-manifest.mjs --platform windows-x86_64',
      'ocr-bundle.mjs --stage',
    ].map(at);
    expect(order.every((i) => i > -1), order.join()).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});

describe('the e2e build carries the bundled OCR, and only the e2e build is allowed to bend the rules', () => {
  it('build-e2e.sh stages the bundle, requires it, and restores the committed manifest it replaced', () => {
    const sh = read('scripts/ci/build-e2e.sh');
    expect(sh).toContain('--stage "$PDFLUENT_OCR_COMPONENT_BUILD"');
    expect(sh).toContain('--rehearse');
    expect(sh).toContain('PDFLUENT_OCR_BUNDLE_DIR=');
    expect(sh).toContain('PDFLUENT_REQUIRE_OCR_BUNDLE=1');
    expect(sh).toMatch(/trap '.*committed\.json.*' EXIT/);
    expect(sh.indexOf('node scripts/ocr-component/ocr-bundle.mjs')).toBeLessThan(sh.indexOf('\ncargo build'));
    expect(sh.indexOf('--verify')).toBeGreaterThan(sh.indexOf('\ncargo build'));
  });

  it('both journeys jobs build the component and make a missing one a red build', () => {
    const ci = read('.github/workflows/quality.yml');
    for (const job of ['journeys-macos', 'journeys-windows']) {
      const section = ci.slice(ci.indexOf(`\n  ${job}:`), ci.indexOf('Build the e2e app and pdfcheck', ci.indexOf(`\n  ${job}:`)));
      expect(section, job).toContain('Build the OCR component');
      expect(section, job).toContain('PDFLUENT_E2E_REQUIRE_OCR=1');
    }
  });

  it('no release script signs the helper without the sandbox entitlements', () => {
    for (const script of ['scripts/build-mas.sh', 'scripts/notarize-macos.sh', 'scripts/release-macos.sh', 'scripts/release-windows.ps1']) {
      expect(read(script), script).not.toContain('PDFLUENT_E2E_UNSANDBOXED_HELPER');
    }
    expect(read('.github/workflows/release.yml')).not.toContain('PDFLUENT_E2E_UNSANDBOXED_HELPER');
  });
});
