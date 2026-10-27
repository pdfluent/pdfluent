// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The sandboxed journeys (J-A3, J-B1, J-B2 on macOS) are only worth anything if
// the bundle they run is the store's sandbox and not a lookalike. This pins
// that: the entitlements the test bundle is signed with come from the Mac App
// Store file, lose only the two keys a provisioning profile vouches for, and
// still carry the sandbox. Nobody may weaken the sandbox to make a journey pass
// (GOV-001: the fix is in how the app saves, not in what it is allowed).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILE_ONLY_KEYS, REQUIRED_KEYS, entitlementsFor } from './journeys/lib/sandbox';

const MAS = 'src-tauri/Entitlements.appstore.plist';

if (process.platform !== 'darwin') {
  process.stderr.write('SKIPPED (not a pass): the derived-entitlements case needs macOS plutil; the store file itself is still checked\n');
}

describe('the sandboxed journeys run the store sandbox', () => {
  it('the store entitlements keep the sandbox and the user-selected grant', () => {
    const plist = readFileSync(MAS, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const key of REQUIRED_KEYS) {
      expect(plist, `${MAS} must carry ${key}`).toMatch(new RegExp(`<key>${key}</key>\\s*<true/>`));
    }
  });

  it('the store entitlements do not grant folder access, so a journey cannot lean on it', () => {
    const plist = readFileSync(MAS, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(plist).not.toMatch(/files\.(downloads|all|user-selected\.read-only)/);
    expect(plist).not.toMatch(/temporary-exception/);
  });

  it('only keys a provisioning profile vouches for are removed for the test bundle', () => {
    expect([...PROFILE_ONLY_KEYS].sort()).toEqual(['com.apple.application-identifier', 'com.apple.developer.team-identifier']);
  });

  it.runIf(process.platform === 'darwin')('the derived test entitlements are the store ones minus those two keys', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pdfluent-ent-'));
    const out = path.join(dir, 'e.plist');
    entitlementsFor(out);
    const read = (f: string): Record<string, unknown> =>
      JSON.parse(spawnSync('plutil', ['-convert', 'json', '-o', '-', f], { encoding: 'utf8' }).stdout) as Record<string, unknown>;
    const store = read(MAS);
    const test = read(out);
    for (const key of PROFILE_ONLY_KEYS) delete store[key];
    expect(test).toEqual(store);
  });

  it('the e2e sandbox seam exists on both sides: the grant example and the app command', () => {
    expect(readFileSync('src-tauri/examples/sandbox_grant.rs', 'utf8')).toContain('sandbox_extension_issue_file');
    expect(readFileSync('src-tauri/crates/macos-secure/src/lib.rs', 'utf8')).toContain('sandbox_extension_consume');
    expect(readFileSync('src-tauri/src/e2e.rs', 'utf8')).toContain('consume_sandbox_extension');
    expect(readFileSync('scripts/ci/build-e2e.sh', 'utf8')).toContain('--example sandbox_grant');
  });
});
