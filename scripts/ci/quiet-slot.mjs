#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// A timing axis measured on a busy machine measures the load, not the code (#730).
// This is the check the four-axes job runs before it measures anything:
//
//   node scripts/ci/quiet-slot.mjs [--max-per-core 0.25] [--wait-s 600]
//
// It reads the one-minute load average, divided by the core count. Quiet enough:
// exit 0. Not quiet within the wait: exit 3 and a sentence that says what the load
// was, what the limit was and what to do. A refusal is a red job with a reason, not
// a skip and not a measurement under load. QUIET_SLOT_LOAD overrides the reading so
// the refusal can be exercised on any machine.

import os from "node:os";
import { isMainModule } from "../lib/main-module.mjs";

/** Pure judgement: is `load1` on `cores` cores quiet enough to measure? */
export function judgeLoad({ load1, cores, maxPerCore }) {
  const perCore = load1 / Math.max(1, cores);
  const quiet = perCore <= maxPerCore;
  return {
    quiet,
    perCore,
    reason: quiet
      ? `load ${load1.toFixed(2)} on ${cores} cores (${perCore.toFixed(2)} per core) is within ${maxPerCore}`
      : `load ${load1.toFixed(2)} on ${cores} cores is ${perCore.toFixed(2)} per core, over the limit of ${maxPerCore}: other work is running, and a timing axis would measure that instead of the code. Not measuring. Re-run in the quiet slot or when the machine is idle.`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLoad() {
  const forced = process.env.QUIET_SLOT_LOAD;
  return forced !== undefined && forced !== "" ? Number(forced) : os.loadavg()[0];
}

export async function waitForQuiet({ maxPerCore = 0.25, waitS = 0, cores = os.cpus().length, read = readLoad, pauseMs = 15_000 } = {}) {
  const until = Date.now() + waitS * 1000;
  for (;;) {
    const verdict = judgeLoad({ load1: read(), cores, maxPerCore });
    if (verdict.quiet || Date.now() >= until) return verdict;
    await sleep(pauseMs);
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  const v = await waitForQuiet({ maxPerCore: opt("--max-per-core", 0.25), waitS: opt("--wait-s", 0) });
  if (v.quiet) {
    console.log(`quiet-slot: ${v.reason}`);
  } else {
    process.stderr.write(`quiet-slot: REFUSED — ${v.reason}\n`);
    process.exitCode = 3;
  }
}
