#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Generates latest.json (Tauri v2 updater format) from CI build artifacts.
//
// Reads sig files from:
//   artifacts/macos/   → darwin-aarch64
//   artifacts/windows/ → windows-x86_64
//   artifacts/linux/   → linux-x86_64
//
// Required environment variables:
//   CI_COMMIT_TAG       e.g. v1.0.0-beta.6
//   CF_R2_PUBLIC_URL    public base URL of R2 bucket, e.g. https://releases.pdfluent.com
//   CF_R2_BUCKET_NAME   bucket name (used for path construction)
//
// Output:
//   latest.json (written to CWD)

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const tag = process.env.CI_COMMIT_TAG ?? '';
// v* = production release; rc* = CI debug run (workflow rule allows both)
if (!tag.startsWith('v') && !tag.startsWith('rc')) {
  console.error(`ERROR: CI_COMMIT_TAG must start with v or rc (got: "${tag}")`);
  process.exit(1);
}
const version = tag.startsWith('v') ? tag.slice(1) : tag; // strip leading v; keep rc* as-is

const r2PublicUrl = (process.env.CF_R2_PUBLIC_URL ?? '').replace(/\/$/, '');
if (!r2PublicUrl) {
  console.error('ERROR: CF_R2_PUBLIC_URL is required');
  process.exit(1);
}

const artifactsBase = path.resolve(process.cwd(), 'artifacts');

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Return all filenames in a directory (empty array if dir missing). */
function listDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

/**
 * Find the updater payload sig for a platform and return { sig, url }.
 *
 * Tauri v2 updater artifact naming:
 *   macOS:   PDFluent_<ver>_aarch64.app.tar.gz  + .sig
 *   Windows: PDFluent_<ver>_x64_en-US.msi       + .msi.sig  (Tauri v2 signs the installer directly; no .msi.zip)
 *   Linux:   PDFluent_<ver>_amd64.AppImage.tar.gz + .sig
 */
function findPlatformArtifact(platformDir, sigPattern) {
  const files = listDir(platformDir);
  const sigFile = files.find(f => f.match(sigPattern));
  if (!sigFile) return null;

  // The artifact that the sig covers is the filename without the trailing .sig
  const artifactName = sigFile.replace(/\.sig$/, '');
  const sigPath = path.join(platformDir, sigFile);
  const sig = readFileSync(sigPath, 'utf8').trim();
  const url = `${r2PublicUrl}/${version}/${artifactName}`;

  return { sig, url, artifactName };
}

// ─── per-platform lookup ──────────────────────────────────────────────────────

const macosDir   = path.join(artifactsBase, 'macos');
const windowsDir = path.join(artifactsBase, 'windows');
const linuxDir   = path.join(artifactsBase, 'linux');

const macos   = findPlatformArtifact(macosDir,   /\.app\.tar\.gz\.sig$/);
// Tauri v2 (createUpdaterArtifacts:true) signs the installer DIRECTLY: it emits
// <installer>.msi.sig (the bare MSI), NOT the legacy v1 .msi.zip wrapper. Match
// *.msi.sig and let the URL resolve to the matching bare .msi below. The
// `\.msi\.sig$` anchor deliberately does NOT match a legacy *.msi.zip.sig.
const windows = findPlatformArtifact(windowsDir, /\.msi\.sig$/);
// Tauri v2 AppImage updater: prefer *.AppImage.tar.gz.sig (v1 compat);
// fall back to *.AppImage.sig (Tauri v2 default — signs the AppImage directly).
const linux   = findPlatformArtifact(linuxDir, /\.AppImage\.tar\.gz\.sig$/)
             ?? findPlatformArtifact(linuxDir, /\.AppImage\.sig$/);

// Desktop release platforms are macOS + Windows; Linux is OPTIONAL (out of scope
// for the gated desktop release — see the Windows+macOS-only release policy). Each
// platform is included only when its signed updater artifact is present; require
// at least one so we never publish an empty feed.
if (!macos)   console.warn('WARN: darwin-aarch64 sig missing — omitted from latest.json');
if (!windows) console.warn('WARN: windows-x86_64 sig missing — omitted from latest.json');
if (!linux)   console.warn('WARN: linux-x86_64 sig missing — omitted from latest.json (Linux is optional)');
if (!macos && !windows && !linux) {
  console.error('ERROR: no updater sig files found under artifacts/{macos,windows,linux}/ — nothing to publish');
  process.exit(1);
}

// ─── assemble latest.json ─────────────────────────────────────────────────────

const pubDate = new Date().toISOString();

/** @type {Record<string, {url: string, signature: string}>} */
const platforms = {
  ...(macos   ? { 'darwin-aarch64': { url: macos.url,   signature: macos.sig   } } : {}),
  ...(windows ? { 'windows-x86_64': { url: windows.url, signature: windows.sig } } : {}),
  ...(linux   ? { 'linux-x86_64':   { url: linux.url,   signature: linux.sig   } } : {}),
};

const latestJson = {
  version,
  notes: 'See the GitLab release for the full changelog.',
  pub_date: pubDate,
  platforms,
};

// ─── write + verify ──────────────────────────────────────────────────────────

const outPath = path.resolve(process.cwd(), 'latest.json');
writeFileSync(outPath, JSON.stringify(latestJson, null, 2) + '\n', 'utf8');

console.log(`✓ latest.json written`);
console.log(`  version:          ${version}`);
console.log(`  pub_date:         ${pubDate}`);
if (macos)   console.log(`  darwin-aarch64:   ${macos.url}`);
if (windows) console.log(`  windows-x86_64:   ${windows.url}`);
if (linux)   console.log(`  linux-x86_64:     ${linux.url}`);

// Sanity-check: all required fields present
const parsed = JSON.parse(readFileSync(outPath, 'utf8'));
const requiredKeys = ['version', 'notes', 'pub_date', 'platforms'];
for (const key of requiredKeys) {
  if (!(key in parsed)) {
    console.error(`ERROR: generated JSON is missing key: ${key}`);
    process.exit(1);
  }
}
// At least one platform must be present (macOS/Windows are the desktop
// release targets; Linux is optional).
if (Object.keys(parsed.platforms).length === 0) {
  console.error('ERROR: generated JSON has no platforms');
  process.exit(1);
}
for (const [p, data] of Object.entries(parsed.platforms)) {
  if (!data.url || !data.signature) {
    console.error(`ERROR: platform ${p} is missing url or signature`);
    process.exit(1);
  }
}
console.log('✓ latest.json validation passed');
