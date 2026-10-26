// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Judge one platform's journey run against docs/JOURNEY_TESTS.json.
//
//   node scripts/quality/journey-results.mjs --platform macos-arm64 [--results journey-results]
//   node scripts/quality/journey-results.mjs --platform windows-x64 --results shard-1 --results shard-2
//
// A run split over shards (vitest --shard i/n, one job each) is judged once, on
// the union of the shards' result directories: every --results directory must
// exist, a journey that ran in two shards is a problem, and a journey that ran
// in none is "no result" like any other. A shard that never reported cannot
// make the run look complete.
//
// Red when, for a journey that has a spec and lists this platform:
//   * there is no result file: the test never ran (a silent skip, or a file
//     vitest did not pick up);
//   * the result is fail or skipped: SKIPPED is not a pass;
//   * it hit a gap docs/JOURNEY_TESTS.json does not list.
// Also red on a result for a journey the mapping does not know. A known gap
// is reported, never counted as proven. Writes <results>/<platform>/summary.json
// for the feature gate (editor-features.json v2).

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMainModule } from '../lib/main-module.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function args(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === name && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]);
  });
  return out;
}

/**
 * Union of per-shard result maps ({ id: result }, one per --results directory,
 * `null` for a directory that does not exist). Returns the merged map and the
 * problems the merge itself found.
 */
export function mergeResults(parts) {
  const results = {};
  const problems = [];
  parts.forEach((part, n) => {
    if (part === null) {
      problems.push(`results directory ${n + 1} of ${parts.length} is missing — that shard did not report`);
      return;
    }
    for (const [id, r] of Object.entries(part)) {
      if (results[id]) problems.push(`${id}: a result in more than one shard — the shards overlap`);
      else results[id] = r;
    }
  });
  return { results, problems };
}

function readResults(dir, platform) {
  const pdir = path.join(dir, platform);
  if (!existsSync(pdir)) return null;
  const results = {};
  for (const f of readdirSync(pdir)) {
    if (!/^J-[0-9A-F]{2}\.json$/.test(f)) continue;
    const r = JSON.parse(readFileSync(path.join(pdir, f), 'utf8'));
    results[r.id] = r;
  }
  return results;
}

export function judge(map, platform, results) {
  const problems = [];
  const rows = [];
  for (const [id, j] of Object.entries(map.journeys)) {
    if (!j.spec || !j.platforms.includes(platform)) continue;
    const r = results[id];
    if (!r) {
      problems.push(`${id}: no result — the test did not run on ${platform}`);
      rows.push({ id, status: 'missing' });
      continue;
    }
    const declared = new Set((j.gaps ?? []).filter((g) => !g.platforms || g.platforms.includes(platform)).map((g) => g.id));
    for (const g of r.gaps ?? []) {
      if (!declared.has(g.id)) problems.push(`${id}: gap ${g.id} is not listed in docs/JOURNEY_TESTS.json`);
    }
    if (r.status !== 'pass' && r.status !== 'known-gap') {
      problems.push(`${id}: ${r.status}${r.reason ? ` (${r.reason})` : ''}${r.error ? `: ${String(r.error).slice(0, 300)}` : ''}`);
    }
    rows.push({ id, status: r.status, gaps: (r.gaps ?? []).map((g) => g.id), ms: r.ms, build: r.build });
  }
  for (const id of Object.keys(results)) {
    if (!map.journeys[id]) problems.push(`${id}: a result for a journey docs/JOURNEY_TESTS.json does not list`);
  }
  return { problems, rows };
}

function main() {
  const platform = arg('--platform');
  const dirs = args('--results');
  if (dirs.length === 0) dirs.push('journey-results');
  if (!platform) {
    console.error('journey-results: --platform is required');
    return 2;
  }
  const map = JSON.parse(readFileSync('docs/JOURNEY_TESTS.json', 'utf8'));
  const merged = mergeResults(dirs.map((d) => readResults(d, platform)));
  const { problems: judged, rows } = judge(map, platform, merged.results);
  const problems = [...merged.problems, ...judged];
  for (const row of rows) {
    const gaps = row.gaps && row.gaps.length ? ` KNOWN-GAP (not a pass): ${row.gaps.join(', ')}` : '';
    console.log(`${row.id.padEnd(5)} ${String(row.status).padEnd(9)}${gaps}`);
  }
  const summary = {
    platform,
    judged_at: new Date().toISOString(),
    proven: rows.filter((r) => r.status === 'pass').map((r) => r.id),
    known_gap: rows.filter((r) => r.status === 'known-gap').map((r) => r.id),
    problems,
  };
  // One directory: next to its results, as before. Several: in the first, which the merge job uploads.
  const pdir = path.join(dirs[0], platform);
  if (existsSync(pdir)) writeFileSync(path.join(pdir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (problems.length > 0) {
    console.error(`\njourney-results: FAIL on ${platform}`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`\njourney-results: OK on ${platform} — ${summary.proven.length} proven, ${summary.known_gap.length} with a known gap`);
  return 0;
}

// See scripts/lib/main-module.mjs.
if (isMainModule(import.meta.url)) process.exitCode = main();
