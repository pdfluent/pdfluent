// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The lint finds swallowed failures, and the list of the ones we accept cannot
 * rot.
 *
 * Every case here is built as a small checkout on disk rather than asserted
 * against the repo, so the test says what the rule is instead of what the tree
 * happened to contain the day it was written. The last block is the exception:
 * it runs the gate over the real checkout, which is what CI does.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit, collect, readAllowlist, REPO, ALLOWLIST_PATH } from '../scripts/quality/no-silent-failures.mjs';

const TS_FIXTURE = `
import { invoke } from '@tauri-apps/api/core';

export async function reportsIt() {
  try { await invoke('a'); } catch (e) { console.error('a failed', e); }
}

export async function rethrowsIt() {
  try { await invoke('b'); } catch { throw new Error('b failed'); }
}

export async function returnsTheError() {
  try { await invoke('c'); } catch (err) { return { ok: false, message: String(err) }; }
}

export async function swallowsIt() {
  try { await invoke('d'); } catch { /* nothing to be done */ }
}

export function swallowsTheRejection() {
  void invoke('e').catch(() => {});
}
`;

// `skip` is interpolated rather than written out: this file is scanned by the
// lint it tests, and a literal `test.skip(` in the fixture is a finding in the
// real checkout.
const SKIP = 'skip';

const SPEC_FIXTURE = `
import { test, expect } from '@playwright/test';

async function openAndExport(page) {
  await page.locator('[data-testid="export-btn"]').click();
}

test('this one runs', async ({ page }) => {
  await expect(page.locator('#live')).toBeVisible();
});

test('this one skips at runtime', async ({ page }) => {
  test.${SKIP}(true, 'the control it drives is not rendered any more');
  await openAndExport(page);
});

test.${SKIP}('this one skips at declaration', async ({ page }) => {
  await expect(page.locator('#dead')).toBeVisible();
});
`;

const RUST_FIXTURE = `
pub fn run(path: &str) -> String {
    let _ = std::fs::remove_file(path);
    std::fs::read_to_string(path).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_test_may_drop_a_result() {
        let _ = super::run("/tmp/x");
        let _ = String::from_utf8(vec![]).unwrap_or_default();
    }
}
`;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'nsf-'));
  mkdirSync(join(root, 'src/viewer'), { recursive: true });
  mkdirSync(join(root, 'src-tauri/src'), { recursive: true });
  writeFileSync(join(root, 'src/viewer/sample.ts'), TS_FIXTURE);
  mkdirSync(join(root, 'tests/e2e'), { recursive: true });
  writeFileSync(join(root, 'tests/e2e/sample.spec.ts'), SPEC_FIXTURE);
  writeFileSync(join(root, 'src-tauri/src/sample.rs'), RUST_FIXTURE);
  writeFileSync(join(root, 'docs-allowlist-placeholder'), '');
  mkdirSync(join(root, 'docs'), { recursive: true });
});

afterAll(() => { rmSync(root, { recursive: true, force: true }); });

/** Write an allow-list into the fixture checkout. */
function allow(entries: unknown[]) {
  writeFileSync(join(root, ALLOWLIST_PATH), JSON.stringify(entries, null, 2));
}

describe('what the lint calls a silent failure', () => {
  it('leaves alone a catch that reports, rethrows or returns the error', () => {
    const hits = collect(root).filter(h => h.kind === 'silent-catch');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.code).toContain("catch { /* nothing to be done */ }");
  });

  it('flags a rejection handler that does nothing', () => {
    const hits = collect(root).filter(h => h.kind === 'silent-rejection');
    expect(hits.map(h => h.code)).toEqual(["void invoke('e').catch(() => {});"]);
  });

  it('flags reaching the Tauri IPC outside the command bridge', () => {
    const hits = collect(root).filter(h => h.kind === 'raw-invoke');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.file).toBe('src/viewer/sample.ts');
  });

  it('flags a dropped Result and an unwrap_or_default in shipped Rust', () => {
    const kinds = collect(root).filter(h => h.file.endsWith('.rs')).map(h => h.kind);
    expect(kinds.sort()).toEqual(['discarded-result', 'unwrap-or-default']);
  });

  it('flags a test that does not run, at the declaration and at runtime', () => {
    const hits = collect(root).filter(h => h.kind === 'skipped-test');
    expect(hits).toHaveLength(2);
    expect(hits.map(h => h.line).sort((a, b) => a - b)).toEqual([13, 17]);
  });

  it('does not flag the same lines inside #[cfg(test)]', () => {
    // The fixture's test module drops a Result and calls unwrap_or_default too.
    const rust = collect(root).filter(h => h.file.endsWith('.rs'));
    expect(rust.every(h => h.line < 8)).toBe(true);
  });
});

describe('the allow-list', () => {
  const entries = () =>
    collect(root).map(h => ({
      file: h.file,
      kind: h.kind,
      code: h.code,
      count: 1,
      reason: 'fixture entry written by the lint test, long enough to count as a reason',
    }));

  it('passes when every hit is listed with a reason', () => {
    allow(entries());
    const result = audit(root);
    expect(result.unlisted).toHaveLength(0);
    expect(result.stale).toHaveLength(0);
    expect(result.miscounted).toHaveLength(0);
    expect(result.unreasoned).toHaveLength(0);
  });

  it('goes red when one line is taken off the list', () => {
    const kept = entries();
    const dropped = kept.pop()!;
    allow(kept);
    const result = audit(root);
    expect(result.unlisted).toHaveLength(1);
    expect(result.unlisted[0]!.code).toBe(dropped.code);
  });

  it('goes red on an entry that matches nothing any more', () => {
    allow([...entries(), {
      file: 'src/viewer/sample.ts',
      kind: 'silent-catch',
      code: '} catch { /* a line that was deleted long ago */ }',
      count: 1,
      reason: 'a decision about code that is no longer in the tree',
    }]);
    expect(audit(root).stale).toHaveLength(1);
  });

  it('goes red when a second identical line appears next to an accepted one', () => {
    const bumped = entries().map(e => ({ ...e, count: 2 }));
    allow(bumped);
    expect(audit(root).miscounted.length).toBeGreaterThan(0);
  });

  it('goes red on an entry whose reason is not one', () => {
    allow(entries().map(e => ({ ...e, reason: 'TODO' })));
    expect(audit(root).unreasoned.length).toBe(entries().length);
  });
});

describe('this checkout', () => {
  it('has every swallowed failure on the list, with a reason', () => {
    const result = audit(REPO);
    expect(result.unlisted).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.miscounted).toEqual([]);
    expect(result.unreasoned).toEqual([]);
  });

  it('reaches the Tauri IPC only through the command bridge', () => {
    expect(collect(REPO).filter(h => h.kind === 'raw-invoke')).toEqual([]);
  });

  it('keeps the list readable: no entry repeats another verbatim', () => {
    const entries = readAllowlist(REPO);
    const keys = entries.map((e: { file: string; kind: string; code: string }) => `${e.file}|${e.kind}|${e.code}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is wired into CI on our own runner', () => {
    const ci = readFileSync(join(REPO, '.github/workflows/quality.yml'), 'utf8');
    expect(ci).toContain('no-silent-failures.mjs --check');
    const job = ci.slice(ci.indexOf('quality-no-silent-failures:'));
    expect(job.slice(0, job.indexOf('steps:'))).toContain('self-hosted, linux, pdfluent-editor');
  });
});
