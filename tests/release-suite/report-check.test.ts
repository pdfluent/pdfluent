// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The markdown half of a report is generated from the JSON half. Both are
// committed with a release, and a person reading the markdown has to be reading
// the same run the guard read — so a hand edit to either is red, the same way
// the UI register's `--check` works.

import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { runToFile } from "../ci/run";
import { REPO_ROOT, stageCase, suiteArgs, readReport } from "./helpers";

const REPORT = path.join(REPO_ROOT, "scripts", "quality", "suite", "report.mjs");

describe("report --check", () => {
  it("agrees with a report it just rendered", () => {
    const s = stageCase("good");
    runToFile("bash", suiteArgs(s), { cwd: REPO_ROOT, env: process.env });
    const { base } = readReport(s);
    const r = runToFile("node", [REPORT, "--check", `${base}.json`], { cwd: REPO_ROOT, env: process.env });
    expect(r.status, r.err).toBe(0);
  });

  it("goes red when one number in the markdown is edited by hand", () => {
    const s = stageCase("good");
    runToFile("bash", suiteArgs(s), { cwd: REPO_ROOT, env: process.env });
    const { base } = readReport(s);
    const md = readFileSync(`${base}.md`, "utf8");
    const edited = md.replace(/\| bytes \| \d+ \|/, "| bytes | 1 |");
    expect(edited, "the fixture report has no bytes row to edit").not.toBe(md);
    writeFileSync(`${base}.md`, edited, "utf8");
    const r = runToFile("node", [REPORT, "--check", `${base}.json`], { cwd: REPO_ROOT, env: process.env });
    expect(r.status).toBe(1);
    expect(r.err).toContain("generated");
  });
});
