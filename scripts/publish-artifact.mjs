#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// publish-artifact.mjs — the single, channel-independent way to publish a
// desktop editor build to Cloudflare R2 and keep the public release manifest
// in sync. Every build path (Linux GitLab CI, the local macOS/Windows scripts,
// or a future SaaS/self-hosted runner) calls this so artifacts land uniformly
// and the website always knows the latest release. No GitHub required.
//
// It maintains TWO files in the pdfluent-releases bucket:
//   releases/manifest.json   — the website's source of truth for download
//                              buttons: { version, pub_date, platforms{} }.
//   <version>/<file>         — the artifact itself (when uploading).
//
// (latest.json — the Tauri *updater* manifest — is produced separately by
//  scripts/ci-generate-latest-json.mjs, because it needs the production
//  signing key. This file is the *download* manifest; the two are siblings.)
//
// Usage:
//   # Upload a local file and register it:
//   node scripts/publish-artifact.mjs --version 1.0.0-beta.5 \
//        --platform darwin-aarch64 --file dist-release/PDFluent_..._aarch64.dmg
//
//   # Register artifacts already uploaded into artifacts/{macos,windows,linux}/
//   # (used by CI after its own upload step):
//   node scripts/publish-artifact.mjs --version 1.0.0-beta.5 --register-dir artifacts
//
//   # Register an already-uploaded object without re-uploading:
//   node scripts/publish-artifact.mjs --version 1.0.0-beta.5 \
//        --platform linux-x86_64 --filename PDFluent_..._amd64.AppImage --size 92355064
//
// Env:
//   WRANGLER          wrangler invocation (default: "wrangler"; locally point at
//                     a repo-local binary, e.g. .../node_modules/.bin/wrangler)
//   CF_R2_BUCKET_NAME R2 bucket (default: pdfluent-releases)
//   CF_RELEASES_BASE  public base (default: https://pdfluent.com/releases)
//
// Publishing without a PASS quality/reports/<version>-<platform>.json is
// refused; see docs/RELEASE_RUNBOOK_GA.md section 7. The check runs BEFORE the
// first upload: a refusal after the bytes are already in the bucket is not a
// gate, it is a log line.

import { readFileSync, writeFileSync, statSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireQualityReport, overrideOr } from './quality/require-report.mjs';

const BUCKET = process.env.CF_R2_BUCKET_NAME || 'pdfluent-releases';
const RELEASES_BASE = (process.env.CF_RELEASES_BASE || 'https://pdfluent.com/releases').replace(/\/$/, '');
const MANIFEST_KEY = 'releases/manifest.json';
const WRANGLER = (process.env.WRANGLER || 'wrangler').trim();

const PLATFORM_META = {
  // darwin-aarch64 is the canonical macOS download slot; we ship a UNIVERSAL
  // .dmg (arm64 + x86_64) under it so one download covers every Mac.
  'darwin-aarch64': { ext: 'dmg', contentType: 'application/x-apple-diskimage', label: 'macOS · Universal (Intel & Apple Silicon)' },
  'darwin-x86_64':  { ext: 'dmg', contentType: 'application/x-apple-diskimage', label: 'macOS · Intel' },
  'linux-x86_64':   { ext: 'AppImage', contentType: 'application/octet-stream', label: 'Linux · x86-64' },
  'windows-x86_64': { ext: 'msi', contentType: 'application/x-msi', label: 'Windows · x64' },
};

// ── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { a[key] = true; }
      else { a[key] = next; i++; }
    }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

function die(msg) { console.error(`✘ ${msg}`); process.exit(1); }

// ── wrangler helpers ──────────────────────────────────────────────────────
function wrangler(wArgs) {
  // WRANGLER may be "wrangler" or "npx wrangler" or an absolute path.
  const parts = WRANGLER.split(/\s+/);
  const cmd = parts[0];
  const pre = parts.slice(1);
  return execFileSync(cmd, [...pre, ...wArgs], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

function r2Put(key, file, contentType) {
  console.log(`↑ R2 put ${BUCKET}/${key}`);
  // --remote is REQUIRED: wrangler 4.x defaults `r2 object` to the local
  // (miniflare) store, which silently no-ops against the real bucket.
  wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType, '--remote']);
}

function fetchManifest() {
  // Prefer the live (proxied) manifest; fall back to a direct R2 get.
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'pdfl-')), 'manifest.json');
  try {
    wrangler(['r2', 'object', 'get', `${BUCKET}/${MANIFEST_KEY}`, '--file', tmp, '--remote']);
    if (existsSync(tmp)) return JSON.parse(readFileSync(tmp, 'utf8'));
  } catch { /* no manifest yet */ }
  return null;
}

function putManifest(obj) {
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'pdfl-')), 'manifest.json');
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  r2Put(MANIFEST_KEY, tmp, 'application/json');
}

// ── version compare (handles X.Y.Z and X.Y.Z-pre.N) ────────────────────────
function parseVer(v) {
  const [core, pre] = String(v).split('-');
  const nums = core.split('.').map(n => parseInt(n, 10) || 0);
  return { nums, pre: pre || '' };
}
/** -1 if a<b, 0 if equal, 1 if a>b. A release (no pre) outranks a prerelease. */
function cmpVer(a, b) {
  const A = parseVer(a), B = parseVer(b);
  for (let i = 0; i < 3; i++) {
    const d = (A.nums[i] || 0) - (B.nums[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;            // 1.0.0 > 1.0.0-beta.5
  if (!B.pre) return -1;
  // both prereleases: compare dot-separated identifiers numerically where possible
  const ap = A.pre.split('.'), bp = B.pre.split('.');
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i], y = bp[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx < ny ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// ── manifest merge ──────────────────────────────────────────────────────────
function mergePlatform(manifest, version, platform, entry) {
  let m = manifest;
  if (!m || !m.version) {
    m = { version, pub_date: new Date().toISOString(), platforms: {} };
  } else if (cmpVer(version, m.version) > 0) {
    // Newer release: start a fresh platform set for it.
    m = { version, pub_date: new Date().toISOString(), platforms: {} };
  } else if (cmpVer(version, m.version) < 0) {
    console.warn(`! refusing to register ${platform} for older ${version} (manifest is ${m.version}); skipping`);
    return m;
  } else {
    // same version → merge, refresh pub_date
    m.pub_date = new Date().toISOString();
  }
  m.platforms[platform] = entry;
  return m;
}

function entryFor(version, platform, filename, size) {
  const meta = PLATFORM_META[platform];
  return {
    url: `${RELEASES_BASE}/${version}/${filename}`,
    filename,
    size: Number(size),
    arch: platform,
    label: meta?.label || platform,
    ext: meta?.ext || path.extname(filename).replace('.', ''),
  };
}

function platformFromFilename(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.dmg')) return n.includes('x64') || n.includes('x86_64') ? 'darwin-x86_64' : 'darwin-aarch64';
  if (n.endsWith('.appimage')) return 'linux-x86_64';
  if (n.endsWith('.msi')) return 'windows-x86_64';
  return null;
}

// ── main ───────────────────────────────────────────────────────────
const version = args.version;
if (!version || version === true) die('--version is required');
const dryRun = args['dry-run'] === true;
const reportsDir = (args['reports-dir'] && args['reports-dir'] !== true) ? String(args['reports-dir']) : 'quality/reports';

// Collect first, judge second, upload third. Building the list has no side
// effects, so a refusal here costs nothing and an accepted run uploads bytes
// that a report already covers.
const toRegister = []; // {platform, filename, size, file?}

if (args['register-dir']) {
  const base = path.resolve(String(args['register-dir']));
  for (const sub of ['macos', 'windows', 'linux']) {
    const dir = path.join(base, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const plat = platformFromFilename(f);
      if (!plat) continue; // skip .sig / .tar.gz etc — only the primary download
      toRegister.push({ platform: plat, filename: f, size: statSync(path.join(dir, f)).size, file: path.join(dir, f) });
    }
  }
  if (!toRegister.length) die(`--register-dir ${base}: no .dmg/.AppImage/.msi found`);
} else if (args.file) {
  const file = path.resolve(String(args.file));
  if (!existsSync(file)) die(`--file not found: ${file}`);
  const filename = path.basename(file);
  const platform = args.platform && args.platform !== true ? String(args.platform) : platformFromFilename(filename);
  if (!platform || !PLATFORM_META[platform]) die(`unknown --platform (got "${platform}"); valid: ${Object.keys(PLATFORM_META).join(', ')}`);
  toRegister.push({ platform, filename, size: statSync(file).size, file, upload: true });
} else if (args.platform && args.filename && args.size) {
  // Registering a name with no file to hash: there is nothing here for a report
  // to be about, so this form needs the override.
  toRegister.push({ platform: String(args.platform), filename: String(args.filename), size: Number(args.size) });
} else {
  die('provide one of: --file <path> | --register-dir <dir> | (--platform --filename --size)');
}

for (const r of toRegister) {
  // Linux is out of scope for the gated desktop release; it is not judged and
  // not refused.
  if (r.platform === 'linux-x86_64') continue;
  try {
    overrideOr(
      () => {
        if (!r.file) {
          die(`registering ${r.filename} without a file to hash cannot be covered by a quality report.\n` +
              `  Publish the file itself (--file), or set PDFLUENT_PUBLISH_WITHOUT_REPORT=<ticket number>.`);
        }
        return requireQualityReport({ version, platform: r.platform, file: r.file, reportsDir });
      },
      { version, platform: r.platform, file: r.file, reportsDir },
    );
  } catch (e) {
    console.error(`\u2718 ${e.message}`);
    process.exit(e.code ?? 1);
  }
}

if (dryRun) {
  for (const r of toRegister) {
    if (r.upload) console.log(`would put ${BUCKET}/${version}/${r.filename}`);
    console.log(`would register ${r.platform} → ${version}/${r.filename} (${r.size} bytes)`);
  }
  console.log(`would put ${BUCKET}/${MANIFEST_KEY}`);
  process.exit(0);
}

for (const r of toRegister) {
  if (!r.upload) continue;
  const contentType = (args['content-type'] && args['content-type'] !== true) ? String(args['content-type']) : PLATFORM_META[r.platform].contentType;
  r2Put(`${version}/${r.filename}`, r.file, contentType);
}

let manifest = fetchManifest();
for (const r of toRegister) {
  manifest = mergePlatform(manifest, version, r.platform, entryFor(version, r.platform, r.filename, r.size));
  console.log(`✓ manifest: ${r.platform} → ${version}/${r.filename} (${r.size} bytes)`);
}
putManifest(manifest);
console.log(`✓ published ${MANIFEST_KEY} (version ${manifest.version}, platforms: ${Object.keys(manifest.platforms).join(', ')})`);
console.log(`  ${RELEASES_BASE}/manifest.json`);
