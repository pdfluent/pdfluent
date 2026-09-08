// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * What the Mac App Store build actually signed.
 *
 * The MAS build signs three times: Tauri during the build, once per nested
 * helper, once more to re-seal the outer bundle. Handing any of those the wrong
 * entitlements file still produces an app that installs, launches and passes
 * `codesign --verify`; App Store review is where it surfaces, and a missing
 * `app-sandbox` or a stray `cs.*` exception is a rejection.
 *
 * `scripts/mas-entitlements.mjs` reads the signature back out of the `.app` or
 * the `.pkg` and compares it, entry by entry, with
 * `src-tauri/Entitlements.appstore.plist`. Make the comparison ignore an added
 * entry and these tests go red.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { diffEntitlements, parseEntitlements } from '../scripts/mas-entitlements.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_PLIST = join(ROOT, 'src-tauri', 'Entitlements.appstore.plist');
const VERIFIER = join(ROOT, 'scripts', 'mas-entitlements.mjs');

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mas-ent-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const PLIST = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`;

describe('MAS entitlements comparison', () => {
  const expected = () => parseEntitlements(readFileSync(EXPECTED_PLIST, 'utf8'));

  it('reads the shipped entitlements file', () => {
    const e = expected();
    expect(e.get('com.apple.security.app-sandbox')).toBe(true);
    expect(e.get('com.apple.application-identifier')).toBe('58Z6SVW7CN.com.pdfluent.app');
    expect(e.size).toBe(6);
  });

  it('reports nothing when the signature matches', () => {
    expect(diffEntitlements(expected(), expected())).toEqual([]);
  });

  it('catches a missing key', () => {
    const actual = expected();
    actual.delete('com.apple.security.app-sandbox');
    expect(diffEntitlements(expected(), actual)).toEqual([
      'missing: com.apple.security.app-sandbox (expected true)',
    ]);
  });

  it('catches an extra key — the cs.* exception that gets a build rejected', () => {
    const actual = expected();
    actual.set('com.apple.security.cs.disable-library-validation', true);
    expect(diffEntitlements(expected(), actual)).toEqual([
      'extra: com.apple.security.cs.disable-library-validation = true — not in the expected file',
    ]);
  });

  it('catches a changed value', () => {
    const actual = expected();
    actual.set('com.apple.security.app-sandbox', false);
    expect(diffEntitlements(expected(), actual)).toEqual([
      'changed: com.apple.security.app-sandbox — expected true, signed false',
    ]);
  });

  it('reads arrays of strings', () => {
    const p = parseEntitlements(
      PLIST('<key>keychain-access-groups</key><array><string>a</string><string>b</string></array><key>x</key><true/>'),
    );
    expect(p.get('keychain-access-groups')).toEqual(['a', 'b']);
    expect(p.get('x')).toBe(true);
  });

  it('refuses to read a plist shape it does not understand, rather than skipping it', () => {
    // A parser that shrugs at what it cannot read reports "equal" for two files
    // it never compared. Every one of these must throw.
    expect(() => parseEntitlements(PLIST('<key>a</key><dict><key>b</key><true/></dict>'))).toThrow();
    expect(() => parseEntitlements(PLIST('<key>a</key><data>AAAA</data>'))).toThrow();
    expect(() => parseEntitlements(PLIST('<key>a</key><true/><key>dangling</key>'))).toThrow();
    expect(() => parseEntitlements(PLIST('<key>a</key><true/><unknown>x</unknown>'))).toThrow();
  });

  it('fails the CLI when the signature carries an extra entitlement', () => {
    const actual = join(tmp, 'actual-extra.plist');
    writeFileSync(
      actual,
      PLIST(
        `${readFileSync(EXPECTED_PLIST, 'utf8').split('<dict>')[1].split('</dict>')[0]}` +
          '<key>com.apple.security.cs.allow-jit</key><true/>',
      ),
    );
    const run = spawnSync('node', [VERIFIER, '--actual', actual, '--expected', EXPECTED_PLIST], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('com.apple.security.cs.allow-jit');
  });

  it('passes the CLI when the signature matches', () => {
    const run = spawnSync('node', [VERIFIER, '--actual', EXPECTED_PLIST, '--expected', EXPECTED_PLIST], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('MAS ENTITLEMENTS OK');
  });

  it('matches the entitlements of the signed MAS artifact when one is present', () => {
    // The artifact is a local build product (dist-release/ and target/ are both
    // gitignored), so this leg cannot run on the Linux CI runner. It is the leg
    // that proves the signature itself, so its absence is announced rather than
    // counted as a pass.
    const app = join(
      ROOT,
      'src-tauri/target/universal-apple-darwin/release/bundle/macos/PDFluent.app',
    );
    const pkg = process.env.MAS_PKG ?? join(ROOT, 'dist-release', 'PDFluent_1.0.0_mas.pkg');
    const target = existsSync(app) ? ['--app', app] : existsSync(pkg) ? ['--pkg', pkg] : null;
    if (process.platform !== 'darwin' || target === null) {
      process.stderr.write(
        `SKIPPED (not a pass): no signed MAS artifact on this machine (${app}, ${pkg}) — ` +
          'run scripts/build-mas.sh first\n',
      );
      return;
    }
    const run = spawnSync('node', [VERIFIER, ...target], { encoding: 'utf8' });
    expect(`${run.stdout}${run.stderr}`).toContain('MAS ENTITLEMENTS OK');
    expect(run.status).toBe(0);
  });
});
