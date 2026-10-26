// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// docs/JOURNEY_TESTS.json is what the feature gate reads to decide which
// promises are proven on the real app. It must name every spec that exists
// and no spec that does not, and every known gap must have an owner. The
// result judge that the journey jobs run is tested here too, on its edges.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { check, specsOnDisk } from '../scripts/quality/journey-map.mjs';
// @ts-expect-error plain ESM script without types
import { judge, mergeResults } from '../scripts/quality/journey-results.mjs';

const map = JSON.parse(readFileSync('docs/JOURNEY_TESTS.json', 'utf8'));

describe('docs/JOURNEY_TESTS.json', () => {
  it('matches the specs in tests/journeys', () => {
    expect(check(map, specsOnDisk())).toEqual([]);
  });

  // The plan's 90, plus J-97 (form scripts wait for permission, added 19-10-2026),
  // J-98 and J-99 (Markdown and table export, added 20-10-2026) and J-A9 (a clean
  // start shows no error, added 20-10-2026).
  it('lists all 94 journeys, 26 of them P0', () => {
    const all = Object.values(map.journeys) as Array<{ priority: string }>;
    expect(all).toHaveLength(94);
    expect(all.filter((j) => j.priority === 'P0')).toHaveLength(26);
  });

  it('targets the two release platforms only (Linux is not a release platform)', () => {
    for (const j of Object.values(map.journeys) as Array<{ platforms: string[] }>) {
      expect(j.platforms.length).toBeGreaterThan(0);
      for (const p of j.platforms) expect(['macos-arm64', 'windows-x64']).toContain(p);
    }
  });
});

describe('journey-results judge', () => {
  const tiny = {
    journeys: {
      'J-80': { spec: 'tests/journeys/a.e2e.ts', platforms: ['macos-arm64'], gaps: [] },
      'J-60': { spec: 'tests/journeys/b.e2e.ts', platforms: ['macos-arm64'], gaps: [{ id: 'ocr', owner: 'C', reason: 'r' }] },
      'J-01': { spec: null, platforms: ['macos-arm64'], gaps: [] },
    },
  };

  it('passes a pass and a listed gap', () => {
    const r = judge(tiny, 'macos-arm64', {
      'J-80': { id: 'J-80', status: 'pass', gaps: [] },
      'J-60': { id: 'J-60', status: 'known-gap', gaps: [{ id: 'ocr' }] },
    });
    expect(r.problems).toEqual([]);
  });

  it('fails a journey that did not run, a skip, a failure and an unlisted gap', () => {
    expect(judge(tiny, 'macos-arm64', { 'J-60': { id: 'J-60', status: 'known-gap', gaps: [{ id: 'ocr' }] } }).problems.join()).toMatch(/J-80: no result/);
    expect(judge(tiny, 'macos-arm64', { 'J-80': { id: 'J-80', status: 'skipped', reason: 'x' }, 'J-60': { id: 'J-60', status: 'pass' } }).problems.join()).toMatch(/J-80: skipped/);
    expect(judge(tiny, 'macos-arm64', { 'J-80': { id: 'J-80', status: 'fail', error: 'e' }, 'J-60': { id: 'J-60', status: 'pass' } }).problems.join()).toMatch(/J-80: fail/);
    expect(judge(tiny, 'macos-arm64', { 'J-80': { id: 'J-80', status: 'known-gap', gaps: [{ id: 'new' }] }, 'J-60': { id: 'J-60', status: 'pass' } }).problems.join()).toMatch(/not listed/);
  });

  it('fails a result for a journey the mapping does not know', () => {
    expect(judge(tiny, 'macos-arm64', { 'J-80': { id: 'J-80', status: 'pass' }, 'J-60': { id: 'J-60', status: 'pass' }, 'J-99': { id: 'J-99', status: 'pass' } }).problems.join()).toMatch(/J-99/);
  });
});

// A run split over shards is judged once, on the union of the shards' results.
// The split must not be able to hide a journey: a missing or red one still
// fails, whichever shard it was in, and so does a shard that never reported.
describe('journey-results over shards', () => {
  const PLATFORM = 'windows-x64';
  const expected = Object.entries(map.journeys as Record<string, { spec: string | null; platforms: string[] }>)
    .filter(([, j]) => j.spec && j.platforms.includes(PLATFORM))
    .map(([id]) => id)
    .sort();

  function writeShard(root: string, name: string, results: Array<Record<string, unknown>>): string {
    const dir = path.join(root, name);
    mkdirSync(path.join(dir, PLATFORM), { recursive: true });
    for (const r of results) writeFileSync(path.join(dir, PLATFORM, `${String(r.id)}.json`), JSON.stringify(r));
    return dir;
  }

  const pass = (id: string): Record<string, unknown> => ({ id, status: 'pass', gaps: [] });

  // A listed gap is a pass only while it is the declared one.
  function result(id: string): Record<string, unknown> {
    const gaps = (map.journeys[id].gaps ?? []).filter((g: { platforms?: string[] }) => !g.platforms || g.platforms.includes(PLATFORM));
    return gaps.length > 0 ? { id, status: 'known-gap', gaps: gaps.map((g: { id: string }) => ({ id: g.id })) } : pass(id);
  }

  function cli(dirs: string[]): { code: number | null; out: string } {
    const args = ['scripts/quality/journey-results.mjs', '--platform', PLATFORM];
    for (const d of dirs) args.push('--results', d);
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  }

  const split = (ids: string[]): [string[], string[]] => [ids.filter((_, i) => i % 2 === 0), ids.filter((_, i) => i % 2 === 1)];

  it('has journeys to split on this platform', () => {
    expect(expected.length).toBeGreaterThan(10);
  });

  it('mergeResults unions the shards and flags an empty slot and an overlap', () => {
    expect(mergeResults([{ 'J-10': pass('J-10') }, { 'J-11': pass('J-11') }])).toEqual({
      results: { 'J-10': pass('J-10'), 'J-11': pass('J-11') },
      problems: [],
    });
    expect(mergeResults([{ 'J-10': pass('J-10') }, null]).problems.join()).toMatch(/did not report/);
    expect(mergeResults([{ 'J-10': pass('J-10') }, { 'J-10': pass('J-10') }]).problems.join()).toMatch(/J-10: a result in more than one shard/);
  });

  it('is green when the shards together hold every journey', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'journey-shards-'));
    const [a, b] = split(expected);
    const r = cli([writeShard(root, 's1', a.map(result)), writeShard(root, 's2', b.map(result))]);
    expect(r.out).toMatch(/journey-results: OK on windows-x64/);
    expect(r.code).toBe(0);
  });

  it('fails when one journey is in no shard', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'journey-shards-'));
    const [a, b] = split(expected);
    const lost = b.pop() as string;
    const r = cli([writeShard(root, 's1', a.map(result)), writeShard(root, 's2', b.map(result))]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${lost}: no result`);
  });

  it('fails when a journey in one shard is red or skipped', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'journey-shards-'));
    const [a, b] = split(expected);
    const red = (b[0] as string);
    const skipped = (a[0] as string);
    const r = cli([
      writeShard(root, 's1', a.map((id) => (id === skipped ? { id, status: 'skipped', reason: 'x' } : result(id)))),
      writeShard(root, 's2', b.map((id) => (id === red ? { id, status: 'fail', error: 'boom' } : result(id)))),
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${red}: fail`);
    expect(r.out).toContain(`${skipped}: skipped`);
  });

  it('fails when a shard never reported', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'journey-shards-'));
    const [a] = split(expected);
    const r = cli([writeShard(root, 's1', a.map(result)), path.join(root, 'never-uploaded')]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/did not report/);
  });

  it('fails when two shards ran the same journey', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'journey-shards-'));
    const [a, b] = split(expected);
    const r = cli([writeShard(root, 's1', [...a, b[0] as string].map(result)), writeShard(root, 's2', b.map(result))]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${b[0]}: a result in more than one shard`);
  });
});
