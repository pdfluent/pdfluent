// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The OCR component inside every build (owner decision 19-10: bundled
// everywhere, nothing downloaded).
//
// The component is assembled from the folder build-tesseract.sh wrote, after
// checking every file against the manifest the app compiles in
// (src-tauri/resources/ocr/tesseract-component.json), and laid out the way the
// app reads it: bin/tesseract[.exe], LICENSES/*, tessdata/*. tauri.conf.json maps
// the staged folder to the app's resources/ocr.
//
//   stage:  node scripts/ocr-component/ocr-bundle.mjs --stage <build-out> [--platform <p>] [--out <dir>]
//   verify: node scripts/ocr-component/ocr-bundle.mjs --verify <bundle-dir> [--platform <p>]
//   CI:     node scripts/ocr-component/ocr-bundle.mjs --stage <build-out> --platform <p> --rehearse <manifest-out>
//           node scripts/ocr-component/ocr-bundle.mjs --verify <bundle-dir> --platform <p> --manifest <manifest-out>
//
// Platforms (default: the host's, macOS -> macos-universal, Windows -> windows-x86_64):
//   macos-universal   the arm64 and x86_64 builds, pinned, lipo-merged into one
//                     bin/tesseract and signed again (hardened runtime, the
//                     sandbox-inherit entitlements, identity from
//                     $PDFLUENT_CODESIGN_IDENTITY, ad-hoc when unset: a merged
//                     file has no valid signature and will not start on Apple
//                     Silicon). Used by the Mac DMG/site build and the Mac App
//                     Store build; the store build signs it once more with its
//                     own identity.
//   windows-x86_64    the signed tesseract.exe as pinned (MSI/Store). Nothing is
//                     merged, so verify also checks the binary's exact hash.
//   macos-aarch64,    one architecture, for a developer or a CI runner that only
//   macos-x86_64      builds its own (never shipped).
//
// --rehearse (CI): a runner builds the component from the pinned sources, but
// the bytes of a build are not the bytes the owner pinned in the committed
// manifest (compiler, timestamps, signature). So the rehearsal pins the build it
// is given into a COPY of the manifest (written to the path after --rehearse,
// never the committed one), stages and verifies against that copy. It proves the
// layout, the merge and signing mechanics and the data files' integrity on every
// runner; it does not prove the released bytes. A release build never rehearses:
// without --rehearse the committed manifest must be published, or staging stops.
//
// stage  checks the binaries, the licence texts and every language pack against
//        the manifest (SHA-256 and exact size), refuses an unpublished manifest,
//        then writes the bundle. Default <out>: src-tauri/resources/ocr-bundle.
// verify checks a staged bundle, or the one inside a finished app (macOS
//        Contents/Resources/resources/ocr, Windows <install>/resources/ocr): the
//        same files, the same hashes, the architecture(s) of the binary, and no
//        file the manifest does not name.
//
// The macOS universal binary is the one file whose bytes the manifest cannot
// pin: it is a merge of two pinned inputs, signed again with the release
// identity by the build script (notarize-macos.sh / build-mas.sh). Its inputs are
// what the manifest vouches for. The Windows binary is pinned as it ships.
// Nothing is deleted: a directory with a stray file is a failure, not a clean-up.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_PATH, pinLanguages, pinPlatform, sha256File, unpinned } from './write-manifest.mjs';
import { isMainModule } from '../lib/main-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_BUNDLE_DIR = join(root, 'src-tauri', 'resources', 'ocr-bundle');
export const THIN_PLATFORMS = { arm64: 'macos-aarch64', x86_64: 'macos-x86_64' };
/** Where the bundle sits in a finished macOS app. */
export const BUNDLE_IN_APP = 'Contents/Resources/resources/ocr';
/**
 * The entitlements of the bundled Tesseract on macOS. The app is sandboxed in
 * every macOS distribution (Entitlements.plist, Entitlements.appstore.plist), and
 * a child process of a sandboxed app that is not signed with `inherit` is killed
 * at launch -- on the reviewer's and the user's Mac, not on the build machine.
 */
export const HELPER_ENTITLEMENTS = join(root, 'src-tauri', 'Entitlements.appstore.inherit.plist');

/**
 * The bundles this script makes. `thin` are the manifest platforms whose build
 * output feeds the bundle; `archs` are what the bundled binary must contain
 * (null: not inspected); `exactBinary`: the binary is bundled as pinned.
 */
export const BUNDLES = {
  'macos-universal': { thin: [THIN_PLATFORMS.arm64, THIN_PLATFORMS.x86_64], archs: ['arm64', 'x86_64'], exactBinary: false },
  'macos-aarch64': { thin: [THIN_PLATFORMS.arm64], archs: ['arm64'], exactBinary: false },
  'macos-x86_64': { thin: [THIN_PLATFORMS.x86_64], archs: ['x86_64'], exactBinary: false },
  'windows-x86_64': { thin: ['windows-x86_64'], archs: null, exactBinary: true },
};

/** The bundle this machine builds when --platform is not given. */
export function hostBundle(platform = process.platform) {
  if (platform === 'darwin') return 'macos-universal';
  if (platform === 'win32') return 'windows-x86_64';
  throw new Error(`no OCR bundle is built on ${platform}; the editor ships on macOS and Windows`);
}

function bundleOf(name) {
  const bundle = BUNDLES[name];
  if (!bundle) throw new Error(`unknown bundle platform ${name}; expected ${Object.keys(BUNDLES).join(' or ')}`);
  return bundle;
}

/** Sign the merged binary. Not injectable-by-default away: tests pass their own. */
export function codesignBinary(binary, identity = process.env.PDFLUENT_CODESIGN_IDENTITY || '-', entitlements = HELPER_ENTITLEMENTS) {
  // The e2e build runs the bare binary, not a sandboxed .app: the kernel aborts a
  // helper signed `app-sandbox` + `inherit` outside a sandboxed parent. Only
  // scripts/ci/build-e2e.sh sets this; no release script may (tests/ocr-bundle.test.ts).
  const sandboxed = process.env.PDFLUENT_E2E_UNSANDBOXED_HELPER !== '1';
  const args = ['--force', '--options', 'runtime', ...(identity === '-' ? [] : ['--timestamp']), ...(sandboxed ? ['--entitlements', entitlements] : []), '--sign', identity, binary];
  const run = spawnSync('codesign', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`codesign ${binary}: ${run.stderr || run.error}`);
}

export function readManifest(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function lipoCreate(inputs, output) {
  const run = spawnSync('lipo', ['-create', ...inputs, '-output', output], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`lipo -create failed: ${run.stderr || run.error}`);
}

export function lipoArchs(file) {
  const run = spawnSync('lipo', ['-archs', file], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`lipo -archs ${file}: ${run.stderr || run.error}`);
  return run.stdout.trim().split(/\s+/).sort();
}

/** Hash and size problems of `files` (relative path, pinned sha, pinned size) below `dir`. */
function fileProblems(dir, label, files) {
  const problems = [];
  for (const f of files) {
    const path = join(dir, f.path);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      problems.push(`${label}/${f.path}: missing`);
      continue;
    }
    if (size !== f.size) problems.push(`${label}/${f.path}: ${size} bytes, the manifest pins ${f.size}`);
    else if (sha256File(path) !== f.sha256) problems.push(`${label}/${f.path}: SHA-256 differs from the manifest`);
  }
  return problems;
}

/**
 * The files of the bundle that are not the binary: [{path (in bundle), sha256, size}].
 * Every thin platform of the bundle must carry the same ones, or a single
 * bundle could not serve them all.
 */
export function bundleDataFiles(manifest, name = 'macos-universal') {
  const { thin } = bundleOf(name);
  const [first, ...rest] = thin.map((key) => {
    const entry = manifest.platforms[key];
    if (!entry) throw new Error(`the manifest has no platform ${key}`);
    return entry;
  });
  const out = [];
  for (const f of first.files.filter((f) => f.path !== first.binary)) {
    for (const other of rest) {
      const twin = other.files.find((g) => g.path === f.path);
      if (!twin || twin.sha256 !== f.sha256 || twin.size !== f.size) {
        throw new Error(`${f.path} differs between ${thin.join(' and ')}; a single bundle cannot carry both`);
      }
    }
    out.push({ path: f.path, sha256: f.sha256, size: f.size });
  }
  for (const l of Object.values(manifest.languages)) {
    out.push({ path: `tessdata/${l.path}`, sha256: l.sha256, size: l.size });
  }
  return out;
}

function listFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) found.push(...listFiles(p, base));
    else found.push(relative(base, p).split('\\').join('/'));
  }
  return found.sort();
}

function expectedPaths(manifest, name) {
  const first = manifest.platforms[bundleOf(name).thin[0]];
  return [first.binary, ...bundleDataFiles(manifest, name).map((f) => f.path)].sort();
}

/**
 * Check the build output against the manifest and write the bundle.
 * `merge` and `sign` are injectable so tests run without lipo and codesign.
 */
export function stageBundle({ buildDir, outDir = DEFAULT_BUNDLE_DIR, manifest = readManifest(), merge = lipoCreate, sign = codesignBinary, platform = 'macos-universal' }) {
  const bundle = bundleOf(platform);
  const gaps = unpinned(manifest);
  if (!manifest.published || gaps.length) {
    throw new Error(`the manifest is not published (${gaps.length} unpinned entries); the build bundles only what the manifest pins`);
  }
  const problems = [];
  for (const key of bundle.thin) {
    problems.push(...fileProblems(join(buildDir, key), key, manifest.platforms[key].files));
  }
  problems.push(
    ...fileProblems(
      join(buildDir, 'tessdata'),
      'tessdata',
      Object.values(manifest.languages).map((l) => ({ path: l.path, sha256: l.sha256, size: l.size })),
    ),
  );
  if (problems.length) throw new Error(`the build output is not what the manifest pins:\n  ${problems.join('\n  ')}`);

  const [firstKey] = bundle.thin;
  const first = manifest.platforms[firstKey];
  for (const key of bundle.thin) {
    if (manifest.platforms[key].binary !== first.binary) throw new Error(`the platforms of ${platform} name different binaries`);
  }
  const data = bundleDataFiles(manifest, platform);

  mkdirSync(join(outDir, 'bin'), { recursive: true });
  mkdirSync(join(outDir, 'LICENSES'), { recursive: true });
  mkdirSync(join(outDir, 'tessdata'), { recursive: true });
  for (const f of data) {
    const from = f.path.startsWith('tessdata/') ? join(buildDir, f.path) : join(buildDir, firstKey, f.path);
    copyFileSync(from, join(outDir, f.path));
  }
  const binary = join(outDir, first.binary);
  if (bundle.exactBinary) {
    copyFileSync(join(buildDir, firstKey, first.binary), binary);
  } else {
    merge(bundle.thin.map((key) => join(buildDir, key, first.binary)), binary);
    chmodSync(binary, 0o755);
    sign(binary);
  }
  chmodSync(binary, 0o755);

  const stray = listFiles(outDir).filter((p) => !expectedPaths(manifest, platform).includes(p));
  if (stray.length) throw new Error(`files in ${outDir} that the manifest does not name (nothing is deleted; remove them): ${stray.join(', ')}`);
  return { outDir, binary, files: expectedPaths(manifest, platform) };
}

/** Problems of a bundle directory against the manifest; empty means it is the pinned component. */
export function verifyBundle(bundleDir, manifest = readManifest(), archs = lipoArchs, platform = 'macos-universal') {
  const bundle = bundleOf(platform);
  const problems = [];
  try {
    problems.push(...fileProblems(bundleDir, 'bundle', bundleDataFiles(manifest, platform)));
  } catch (e) {
    problems.push(e.message);
  }
  const first = manifest.platforms[bundle.thin[0]];
  const binary = join(bundleDir, first.binary);
  let mode = null;
  try {
    mode = statSync(binary).mode;
  } catch {
    problems.push(`bundle/${first.binary}: missing`);
  }
  if (mode !== null) {
    if (process.platform !== 'win32' && (mode & 0o111) === 0) problems.push(`bundle/${first.binary}: not executable`);
    if (bundle.exactBinary) {
      problems.push(...fileProblems(bundleDir, 'bundle', first.files.filter((f) => f.path === first.binary)));
    }
    if (bundle.archs) {
      try {
        const got = archs(binary);
        if (got.join(' ') !== [...bundle.archs].sort().join(' ')) {
          problems.push(`bundle/${first.binary}: architectures [${got.join(', ')}], expected [${bundle.archs.join(', ')}]`);
        }
      } catch (e) {
        problems.push(e.message);
      }
    }
    try {
      const stray = listFiles(bundleDir).filter((p) => !expectedPaths(manifest, platform).includes(p));
      if (stray.length) problems.push(`bundle holds files the manifest does not name: ${stray.join(', ')}`);
    } catch (e) {
      problems.push(e.message);
    }
  }
  return problems;
}

/**
 * A copy of `manifest` pinned from `buildDir`, for the platforms `name` needs and
 * the languages. Only for a rehearsal (see the header); the committed manifest
 * is never written.
 */
export function rehearsalManifest(buildDir, name, manifest = readManifest()) {
  const copy = JSON.parse(JSON.stringify(manifest));
  for (const key of bundleOf(name).thin) pinPlatform(copy, key, join(buildDir, key));
  pinLanguages(copy, join(buildDir, 'tessdata'));
  // Platforms this rehearsal does not build stay unpinned; they are not judged.
  for (const key of Object.keys(copy.platforms)) {
    if (!bundleOf(name).thin.includes(key)) delete copy.platforms[key];
  }
  copy.published = true;
  return copy;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (isMainModule(import.meta.url)) {
  try {
    const platform = arg('--platform') ?? hostBundle();
    if (arg('--stage')) {
      const buildDir = resolve(arg('--stage'));
      let manifest = readManifest();
      if (arg('--rehearse')) {
        manifest = rehearsalManifest(buildDir, platform, manifest);
        writeFileSync(resolve(arg('--rehearse')), `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`NOTE rehearsal: the build in ${buildDir} is pinned into ${arg('--rehearse')}, not into the committed manifest`);
      }
      const r = stageBundle({ buildDir, outDir: resolve(arg('--out') ?? DEFAULT_BUNDLE_DIR), manifest, platform });
      console.log(`OK OCR bundle (${platform}) staged in ${r.outDir} (${r.files.length} files)`);
    } else if (arg('--verify')) {
      const dir = resolve(arg('--verify'));
      const manifest = arg('--manifest') ? JSON.parse(readFileSync(resolve(arg('--manifest')), 'utf8')) : readManifest();
      const problems = verifyBundle(dir, manifest, lipoArchs, platform);
      if (problems.length) {
        console.error(`FAIL the OCR bundle in ${dir} is not the pinned component:\n  ${problems.join('\n  ')}`);
        process.exit(1);
      }
      console.log(`OK OCR bundle (${platform}) in ${dir} matches the manifest`);
    } else {
      console.error('usage: ocr-bundle.mjs --stage <build-out> [--platform <p>] [--out <dir>] [--rehearse <manifest-out>] | --verify <bundle-dir> [--platform <p>] [--manifest <file>]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exit(1);
  }
}
