// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The Mac App Store sandbox for the journey suite.
//
// GOV-001 (1.1.1): Save As to a new file failed with EPERM for everyone who
// got the app from the Mac App Store, and not one test noticed, because the
// suite ran an unsandboxed binary and answered the save panel with a path the
// app could write anyway. This module closes that hole. It does three things:
//
// 1. It wraps the e2e binary in a bundle and signs it ad hoc with the
//    entitlements of the Mac App Store build (src-tauri/Entitlements.appstore.plist),
//    minus the two identifiers that only a provisioning profile can vouch for.
//    The sandbox is the kernel's, not a model of it. Nothing is weakened: the
//    entitlements are derived from the shipped file and `entitlementsFor`
//    refuses a result that lost the sandbox (tests/journeys-sandbox.test.ts).
// 2. It stands in for the open and save panels. In a sandbox the panel is what
//    gives the app a path: access to that one file and nothing around it. A test
//    cannot click the panel, so the harness issues the same grant itself
//    (src-tauri/examples/sandbox_grant.rs, sandbox_extension_issue_file) and the
//    e2e build takes it (src-tauri/src/e2e.rs). A path that was not granted is
//    refused by the kernel exactly as in the store build.
// 3. It leaves everything else alone: the app inside is the e2e build, driven
//    through the same bridge, answering the same journeys.
//
// macOS only. Windows has no equivalent sandbox for this product: the MSI is a
// plain Win32 install, and the Store listing points at that same MSI
// (store/packaging-route.md), so there is no MSIX virtualisation to test.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoFile } from './env';

export const SANDBOX_BUNDLE_ID = 'com.pdfluent.app.e2e.sandbox';

/** Entitlement keys only a provisioning profile can vouch for; a test bundle has none. */
export const PROFILE_ONLY_KEYS = ['com.apple.application-identifier', 'com.apple.developer.team-identifier'] as const;

/** What the sandbox must keep, read back from the signed test bundle. */
export const REQUIRED_KEYS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.files.user-selected.read-write',
] as const;

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Why the sandbox cannot be used here, or null. */
export function sandboxUnavailable(): string | null {
  if (process.platform !== 'darwin') return 'the App Sandbox exists on macOS only';
  if (!process.env.PDFLUENT_E2E_APP) return 'PDFLUENT_E2E_APP is not set';
  if (!grantTool()) return 'the sandbox_grant example was not built next to pdfcheck (scripts/ci/build-e2e.sh builds it)';
  return null;
}

function grantTool(): string | null {
  const check = process.env.PDFLUENT_PDFCHECK;
  if (!check) return null;
  const tool = path.join(path.dirname(check), 'sandbox_grant');
  return existsSync(tool) ? tool : null;
}

/**
 * The Mac App Store entitlements with the profile-only keys removed, as an
 * XML plist written to `out`. Fails when the result is not a sandbox.
 */
export function entitlementsFor(out: string, source = repoFile('src-tauri/Entitlements.appstore.plist')): void {
  copyFileSync(source, out);
  for (const key of PROFILE_ONLY_KEYS) {
    // plutil reads a dot as a key path separator, so each dot in the key is escaped.
    // It fails when the key is absent, which is fine: a source without it needs no removal.
    spawnSync('plutil', ['-remove', key.replace(/\./g, '\\.'), out], { encoding: 'utf8' });
  }
  const json = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', out])) as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    if (json[key] !== true) throw new Error(`${source} lost ${key}: the sandbox test bundle would not be the store build's sandbox`);
  }
  for (const key of PROFILE_ONLY_KEYS) {
    if (key in json) throw new Error(`${key} is still in the test entitlements`);
  }
}

let prepared: string | null = null;

/**
 * The e2e binary inside a signed, sandboxed bundle; the path of the executable
 * to launch. Built once per run.
 */
export function sandboxedApp(): string {
  if (prepared) return prepared;
  const why = sandboxUnavailable();
  if (why) throw new Error(`sandboxed journeys cannot run: ${why}`);
  const root = mkdtempSync(path.join(realpathSync(process.env.PDFLUENT_JOURNEY_TMP ?? os.tmpdir()), 'pdfluent-sandbox-app-'));
  const bundle = path.join(root, 'PDFluent E2E Sandbox.app');
  const macos = path.join(bundle, 'Contents', 'MacOS');
  mkdirSync(macos, { recursive: true });
  const exe = path.join(macos, 'pdfluent-desktop');
  copyFileSync(process.env.PDFLUENT_E2E_APP as string, exe);
  chmodSync(exe, 0o755);
  writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>CFBundleIdentifier</key><string>${SANDBOX_BUNDLE_ID}</string>`,
    '<key>CFBundleExecutable</key><string>pdfluent-desktop</string>',
    '<key>CFBundleName</key><string>PDFluent E2E Sandbox</string>',
    '<key>CFBundlePackageType</key><string>APPL</string>',
    '<key>CFBundleVersion</key><string>1</string>',
    '<key>CFBundleShortVersionString</key><string>0.0.0-e2e</string>',
    '<key>LSMinimumSystemVersion</key><string>11.0</string>',
    '</dict></plist>',
  ].join('\n'));
  const ent = path.join(root, 'entitlements.plist');
  entitlementsFor(ent);
  run('codesign', ['--force', '--sign', '-', '--entitlements', ent, '--identifier', SANDBOX_BUNDLE_ID, bundle]);
  // Read back what the kernel will enforce.
  const signed = run('codesign', ['-d', '--entitlements', ':-', bundle]);
  if (!signed.includes('com.apple.security.app-sandbox')) throw new Error('the signed test bundle carries no App Sandbox entitlement');
  prepared = exe;
  return exe;
}

/** The path as the sandbox sees it: symlinks resolved (/var is /private/var). A path that does not exist yet keeps its name. */
export function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.join(realpathSync(path.dirname(p)), path.basename(p));
  }
}

/**
 * Grants, as the panel would issue them, for each path (one token each). A
 * path that is a folder grants the folder's whole subtree; the journeys grant
 * only files, and the bridge folder the app needs to talk to the harness.
 */
export function grant(...paths: string[]): string[] {
  const tool = grantTool();
  if (!tool) throw new Error('sandbox_grant is not available');
  const out = run(tool, paths.map(canonical));
  return out.split('\n').filter((l) => l.length > 0);
}

export function readEntitlementsOf(file: string): Record<string, unknown> {
  return JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', file])) as Record<string, unknown>;
}

