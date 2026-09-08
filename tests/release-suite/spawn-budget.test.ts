// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// How many interpreters one run of the suite is allowed to start.
//
// The suite is shell and its judgement is node, so for a while every judged
// check, every declared gap and every fact the preflight needed cost a whole
// node start: ten of them for a run against the fake driver, which touches no
// tool and only reads files. A bare `node -e ""` is around half a second of CPU
// on this machine, so those starts were not overhead around the work — they
// were the work. The suite's own cases drive the orchestrator fifteen times, and
// the bill landed on every gate on a shared machine.
//
// This is a budget, not a benchmark: it counts starts, which is the same number
// on a fast machine and a loaded one, so it cannot go flaky the way a timing
// assertion does. Raising it is allowed and is a decision — it should show up in
// a diff with a reason, which is the whole point of writing it down.
import { describe, it, expect } from "vitest";
import { runToFile } from "../ci/run";
import { REPO_ROOT, stageCase, suiteArgs } from "./helpers";

/** Four: preflight facts, meta, the judgement flush, and the renderer. */
const BUDGET = 5;

describe("one run of the suite starts few interpreters", () => {
  it(`spawns at most ${BUDGET} node processes against the fake driver`, () => {
    // Staged the same way every other case is, so this counts a run that
    // actually passes rather than one that died early with few spawns to its
    // name — and so it does not quietly miss whatever staging learns to do next.
    // `bash -x` names every command it runs, so the count is what the run did
    // rather than what the source appears to say.
    const staged = stageCase("good");
    const r = runToFile("bash", ["-x", ...suiteArgs(staged)], { cwd: REPO_ROOT, env: process.env });

    expect(r.status, r.err.slice(-2000)).toBe(0);
    const starts = r.err.split("\n").filter((l) => /^\++ node(\s|$)/.test(l));
    expect(starts.length, `node starts:\n${starts.join("\n")}`).toBeLessThanOrEqual(BUDGET);
    // And it did start some: a run that judged nothing would also count zero.
    expect(starts.length).toBeGreaterThan(0);
  });
});
