#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Post-build release gate: prove the built Tauri binary/.app embeds EXACTLY the
// current frontend bundle from dist/index.html — no stale bundle from a prior
// incremental build.
//
// Background: Tauri embeds `frontendDist` via `generate_context!` at compile
// time, and Cargo's incremental model does not invalidate that embed when only
// `../dist` changes. An incremental build could therefore ship a stale frontend
// (the bug that hid the inline-editor white-text fix behind an old index-*.js).
// build.rs now fingerprints the dist to force re-embedding; THIS script is the
// belt-and-braces gate that fails CI/release if a stale bundle slipped through.
//
// Usage: node scripts/verify-frontend-embed.mjs [path-to-binary-or-.app]
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// dist dir is overridable (PDFLUENT_VERIFY_DIST) so the gate is testable against
// a fixture dist in CI (see scripts/__tests__/verify-frontend-embed.test.ts).
const dist = process.env.PDFLUENT_VERIFY_DIST
  ? resolve(process.env.PDFLUENT_VERIFY_DIST)
  : resolve(root, 'dist');
const indexHtml = resolve(dist, 'index.html');
const assetsDir = resolve(dist, 'assets');

function fail(msg) {
  console.error(`\n❌ FRONTEND-EMBED VERIFY FAILED: ${msg}\n`);
  process.exit(1);
}

// Resolve the binary to inspect (accept a .app, a dir, or a raw binary path).
let binary = process.argv[2] || resolve(root, 'src-tauri/target/debug/pdfluent-desktop');
if (existsSync(binary) && statSync(binary).isDirectory()) {
  // a .app bundle → its MacOS executable
  binary = join(binary, 'Contents', 'MacOS', 'pdfluent-desktop');
}
if (!existsSync(indexHtml)) fail('dist/index.html not found — build the frontend first');
if (!existsSync(binary)) fail(`binary not found: ${binary}`);

const re = /index-[A-Za-z0-9_-]{6,}\.(?:js|css)/g;

// The entry bundles index.html references — these MUST be embedded.
const html = readFileSync(indexHtml, 'utf8');
const entryRefs = [...new Set([...html.matchAll(re)].map((m) => m[0]))];
if (entryRefs.length === 0) fail('no index-*.{js,css} references found in dist/index.html');

// The full set of current index-* assets actually produced by the build (some
// chunks aren't referenced directly from index.html, e.g. lazy/preload stubs) —
// anything embedded that is NOT in this set is a STALE bundle from a prior build.
if (!existsSync(assetsDir)) fail('dist/assets not found');
const fileRe = /^index-[A-Za-z0-9_-]{6,}\.(?:js|css)$/; // non-global (stateless .test)
const currentAssets = new Set(readdirSync(assetsDir).filter((f) => fileRe.test(f)));

// Read the binary directly (latin1) and scan for embedded asset keys — Tauri
// stores them as plaintext in the binary. Avoids the Unix `strings` dependency
// so the gate runs identically on macOS, Linux and Windows CI.
const binText = readFileSync(binary).toString('latin1');
const embedded = [...new Set([...binText.matchAll(re)].map((m) => m[0]))];

const missing = entryRefs.filter((b) => !embedded.includes(b));
if (missing.length) {
  fail(`current entry bundle(s) NOT embedded in the binary: ${missing.join(', ')}\n` +
    `   binary references: ${embedded.join(', ') || '(none)'}`);
}

const stale = embedded.filter((b) => !currentAssets.has(b));
if (stale.length) {
  fail(`STALE bundle(s) embedded that are not in the current dist/assets: ${stale.join(', ')}\n` +
    `   current dist entry bundle(s): ${entryRefs.join(', ')}\n` +
    `   → run a clean build (scripts/build-verified.sh) so the embed is regenerated.`);
}

console.log(`✅ FRONTEND-EMBED VERIFY OK\n   binary: ${binary}\n   current entry bundle(s) embedded: ${entryRefs.join(', ')}\n   no stale bundles present.`);
