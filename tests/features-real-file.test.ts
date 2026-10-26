// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The real product/editor-features.json, through the real command.
 *
 * The fixture cases in features-check and features-gate prove the guards; this
 * proves the file the site reads passes them, that the command exits non-zero
 * when a promise has no result behind it, and that publishing twice writes
 * the same bytes. It runs the script as CI does, so a module that loads and
 * does nothing (the main-module trap in scripts/lib/main-module.mjs) is red.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '..');
const SCRIPT = join(REPO, 'scripts', 'quality', 'features.mjs');
const TMP = mkdtempSync(join(tmpdir(), 'features-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function run(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

type Feature = { id: string; status: string; tests: { id: string; kind: string; platforms: string[] }[] };
const doc = JSON.parse(readFileSync(join(REPO, 'product', 'editor-features.json'), 'utf8')) as {
  features: Feature[];
  pending_proof_ceiling: string[];
};

describe('product/editor-features.json', () => {
  it('passes features.mjs --check', () => {
    const r = run(['--check']);
    expect(r.out).toMatch(/✓ features --check: \d+ features/);
    expect(r.code).toBe(0);
  });

  it('promises something and proves it on both shipping platforms', () => {
    const promised = doc.features.filter((f) => f.status === 'promised');
    expect(promised.length).toBeGreaterThan(0);
    for (const p of ['macos-arm64', 'windows-x64']) {
      for (const f of promised) expect(f.tests.some((t) => t.platforms.includes(p)), `${f.id} on ${p}`).toBe(true);
    }
  });

  it('pins every pending-proof feature in the ceiling', () => {
    const pending = doc.features.filter((f) => f.status === 'pending-proof').map((f) => f.id);
    expect([...doc.pending_proof_ceiling].sort()).toEqual([...pending].sort());
  });
});

describe('features.mjs --gate on the real file', () => {
  it('fails when a results file it was given does not exist', () => {
    const r = run(['--gate', '--platform', 'macos-arm64', '--junit', join(TMP, 'missing.xml')]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/missing\.xml does not exist/);
  });

  it('fails, naming a promised feature and its test, when the results do not contain the tests', () => {
    const junit = join(TMP, 'empty.xml');
    writeFileSync(junit, '<?xml version="1.0"?><testsuites></testsuites>');
    const r = run(['--gate', '--platform', 'windows-x64', '--junit', junit]);
    expect(r.code).toBe(1);
    const promised = doc.features.find((f) => f.status === 'promised');
    expect(r.out).toContain(`FAIL ${promised?.id} (promised) on windows-x64: test`);
    expect(r.out).toMatch(/PENDING-PROOF \(not a pass\)/);
  });

  it('refuses to run without a platform', () => {
    const r = run(['--gate', '--junit', join(TMP, 'empty.xml')]);
    expect(r.code).toBe(1);
  });
});

describe('features.mjs --publish on the real file', () => {
  it('writes the same bytes twice', () => {
    const a = join(TMP, 'a.json');
    const b = join(TMP, 'b.json');
    expect(run(['--publish', a, '--commit', 'fixed']).code).toBe(0);
    expect(run(['--publish', b, '--commit', 'fixed']).code).toBe(0);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
    const published = JSON.parse(readFileSync(a, 'utf8')) as { features: { status: string }[] };
    expect(published.features.every((f) => ['promised', 'preview', 'pending-proof', 'not-offered'].includes(f.status))).toBe(true);
  });
});
