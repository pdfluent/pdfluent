// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The guard is run as a process, on purpose: what CI invokes is the command
// line, and a test that imports the module leaves the argument handling and the
// exit codes — the parts that decide whether a pipeline goes red — untested.
//
// Mutation to check this is not vacuous: delete a rule from RULES in
// scripts/ci/internal-terms.mjs and the case for it goes green where it should
// go red; make the missing-list path return 0 and the last case fails.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const guard = resolve(__dirname, "../../scripts/ci/internal-terms.mjs");
const dir = mkdtempSync(join(tmpdir(), "internal-terms-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The real list lives outside the tree; these stand-ins keep the test from
// depending on a file this repository must never contain.
const terms = join(dir, "terms.txt");
writeFileSync(terms, "# a comment\nZzqPartnerName\n");

function run(message: string, list = terms) {
  const file = join(dir, `msg-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(file, message);
  const r = spawnSync(process.execPath, [guard, "--message", file], {
    encoding: "utf8",
    env: { ...process.env, CI: "", PDFLUENT_INTERNE_TERMEN: list },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("nothing internal goes out with a commit message", () => {
  it("refuses a build host, a private address and a pricing statement", () => {
    const r = run("ci: sign on DESKTOP-QQ7X1 at 192.168.9.9, per the pricing strategy\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("DESKTOP-QQ7X1");
    expect(r.out).toContain("192.168.9.9");
    expect(r.out).toContain("pricing strategy");
  });

  it("refuses a partner name from the list that is not in this repository", () => {
    const r = run("feat: ship the export ZzqPartnerName asked for\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("partner");
  });

  it("lets technique through", () => {
    // The whole design rests on this: a guard that fires on `password` or
    // `Adobe` in a PDF editor is switched off within a week, and then it guards
    // nothing at all.
    const r = run(
      "feat(protect): set an owner password and match Adobe's permission bits\n\n" +
      "Built against DESKTOP-NATIVE and Windows SDK 10.0.22621.0; arr.push() stays.\n",
    );
    expect(r.status).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("fails loudly when the list of names is missing, instead of passing", () => {
    // The failure this replaces: no list, no partner rule, green. That is
    // indistinguishable from a clean message and it is the one rule whose terms
    // cannot be read off this file.
    const r = run("chore: anything\n", join(dir, "there-is-no-list.txt"));
    expect(r.status).toBe(1);
    expect(r.out).toContain("SKIPPED (not a pass)");
  });
});
