// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What the licence policy says about our own crates.
//
// The engine is published as `AGPL-3.0-only OR LicenseRef-PDFluent-Commercial`.
// Regenerating THIRD_PARTY.md for the 1.0.0 bump turned that into
// "blocked: 20" — twenty AGPL dependencies, every one of them written here. The
// policy was reading the copyleft half of a choice we make, and the exception
// that used to cover it named a single crate, `pdfluent`, from before the engine
// was split into twenty-one.
//
// Mutation: drop the OR test and treat any expression mentioning the commercial
// licence as ours, and the AND case goes red — which is the case that matters,
// because a commercial grant beside a copyleft one releases us from nothing.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error — a plain .mjs script with no type declarations
import { evaluateLicensePolicy } from "../scripts/generate-third-party.mjs";

const policy = (expr: string, source = "cargo", name = "pdf-engine") =>
  (evaluateLicensePolicy(expr, source, name) as { policyStatus: string }).policyStatus;

describe("a licence we may choose is a licence we have", () => {
  it("counts a crate offered under our commercial licence as ours", () => {
    expect(policy("AGPL-3.0-only OR LicenseRef-PDFluent-Commercial")).toBe("internal");
    expect(policy("AGPL-3.0-only OR LicenseRef-PDFluent-Commercial", "cargo", "xfa-layout-engine")).toBe("internal");
  });

  it("still blocks the same copyleft licence on its own", () => {
    expect(policy("AGPL-3.0-only")).toBe("blocked");
    expect(policy("AGPL-3.0-only", "cargo", "pdfluent")).toBe("blocked");
  });

  it("does not let an AND release us from the copyleft half", () => {
    // Every conjunct applies. A commercial grant beside AGPL is both, not either.
    expect(policy("AGPL-3.0-only AND LicenseRef-PDFluent-Commercial")).toBe("blocked");
  });

  it("leaves an ordinary dual licence to a human", () => {
    expect(policy("MIT OR GPL-3.0")).toBe("needs-review");
  });

  it("is unchanged for the licences most dependencies carry", () => {
    expect(policy("MIT OR Apache-2.0")).toBe("allowed");
    expect(policy("LicenseRef-PDFluent-Proprietary")).toBe("internal");
  });
});

describe("importing the generator is not running it", () => {
  it("writes nothing when the module is only imported", () => {
    // The case above imports `evaluateLicensePolicy` from the generator. The
    // generator used to call main() at module scope, so that import rewrote
    // THIRD_PARTY.md, THIRD_PARTY_ATTRIBUTIONS.md and compliance-report.json in
    // whatever directory the suite happened to run in — a dirty working tree
    // after every gate run, and three files whose contents moved for no reason
    // anyone could point at.
    const dir = mkdtempSync(join(tmpdir(), "generator-import-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "0.0.0" }));
      const script = resolve(__dirname, "..", "scripts", "generate-third-party.mjs");
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(script)})`], {
        cwd: dir, encoding: "utf8",
      });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      expect(readdirSync(dir)).toEqual(["package.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the inventory is a function of the tree", () => {
  it("writes the same bytes twice over an unchanged checkout", () => {
    // Three files carried `new Date()`, so two runs over the same tree differed
    // in three lines and nothing could compare the committed inventory with a
    // fresh one. That is what let THIRD_PARTY.md sit six days stale, with twenty
    // of our own crates misclassified, in a file we publish.
    //
    // A fixture checkout with one commit, so the git path is the one exercised:
    // the stamp has to come from the commit, which does not move between runs.
    const dir = mkdtempSync(join(tmpdir(), "generator-determinism-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "0.0.0" }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        name: "fixture", lockfileVersion: 3, packages: { "": { name: "fixture", version: "0.0.0" } },
      }));
      for (const args of [["init", "-q", "-b", "main"], ["add", "-A"]]) spawnSync("git", args, { cwd: dir });
      spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=T", "-c", "commit.gpgsign=false",
        "commit", "-q", "-m", "fixture"], { cwd: dir });

      const script = resolve(__dirname, "..", "scripts", "generate-third-party.mjs");
      const generate = () => {
        const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
        expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
        return ["THIRD_PARTY.md", "THIRD_PARTY_ATTRIBUTIONS.md", "compliance-report.json"]
          .map((f) => readFileSync(join(dir, f), "utf8"));
      };

      const first = generate();
      const second = generate();
      expect(second).toEqual(first);
      // Nothing in the output says when it was made. A generated file that
      // reports its own time cannot be compared with a fresh run of the same
      // generator over the same tree, and a date git already records is a date
      // the file does not have to claim.
      for (const body of first) expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("and something checks that the committed copy is that function's output", () => {
  it("compares the committed inventory against a fresh run, in CI", () => {
    // The determinism above is what makes the comparison possible; this is the
    // comparison. It lives in the compliance workflow because that job already
    // runs the generator, and it fails with the command that fixes it.
    const wf = readFileSync(resolve(__dirname, "..", ".github", "workflows", "compliance.yml"), "utf8");
    expect(wf).toContain("npm run compliance:generate");
    expect(wf).toContain("git diff --exit-code -- THIRD_PARTY.md THIRD_PARTY_ATTRIBUTIONS.md compliance-report.json");
    expect(wf).toContain("npm run compliance:generate' and commit");
  });
});
