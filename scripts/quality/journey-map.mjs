// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Keep docs/JOURNEY_TESTS.json and tests/journeys/*.e2e.ts in step.
//
//   node scripts/quality/journey-map.mjs --check   (CI, via tests/journey-map.test.ts)
//   node scripts/quality/journey-map.mjs --write   (after adding or renaming a spec)
//
// The mapping is what the feature gate reads, so it may not claim a spec that
// does not exist, miss one that does, or carry a gap without an owner.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMainModule } from '../lib/main-module.mjs';

const MAP = 'docs/JOURNEY_TESTS.json';
const DIR = 'tests/journeys';

export function specsOnDisk(root = '.') {
  const found = {};
  for (const f of readdirSync(path.join(root, DIR)).sort()) {
    if (!f.endsWith('.e2e.ts')) continue;
    const src = readFileSync(path.join(root, DIR, f), 'utf8');
    for (const m of src.matchAll(/\bjourney\(\s*'(J-[0-9A-F]{2})'/g)) {
      (found[m[1]] ??= []).push(`${DIR}/${f}`);
    }
  }
  return found;
}

export function check(map, found) {
  const problems = [];
  for (const [id, files] of Object.entries(found)) {
    if (!map.journeys[id]) problems.push(`${files[0]} registers ${id}, which is not in ${MAP}`);
    if (files.length > 1) problems.push(`${id} is registered by more than one spec: ${files.join(', ')}`);
  }
  for (const [id, j] of Object.entries(map.journeys)) {
    const files = found[id] ?? [];
    if (j.spec && !files.includes(j.spec)) problems.push(`${id}: ${MAP} names ${j.spec}, which does not register it`);
    if (!j.spec && files.length > 0) problems.push(`${id}: ${files[0]} proves it, but ${MAP} has spec null (run --write)`);
    for (const g of j.gaps ?? []) {
      if (!g.id || !g.owner || !g.reason) problems.push(`${id}: a gap needs id, owner and reason: ${JSON.stringify(g)}`);
    }
    if (!['P0', 'P1', 'P2'].includes(j.priority)) problems.push(`${id}: priority ${j.priority}`);
  }
  return problems;
}

function main() {
  const map = JSON.parse(readFileSync(MAP, 'utf8'));
  const found = specsOnDisk();
  if (process.argv.includes('--write')) {
    for (const [id, j] of Object.entries(map.journeys)) j.spec = found[id]?.[0] ?? null;
    writeFileSync(MAP, `${JSON.stringify(map, null, 2)}\n`);
  }
  const problems = check(map, found);
  for (const p of problems) console.error(`journey-map: ${p}`);
  const covered = Object.values(map.journeys).filter((j) => j.spec).length;
  console.log(`journey-map: ${covered} of ${Object.keys(map.journeys).length} journeys have a real-app spec`);
  return problems.length ? 1 : 0;
}

// See scripts/lib/main-module.mjs.
if (isMainModule(import.meta.url)) process.exitCode = main();
