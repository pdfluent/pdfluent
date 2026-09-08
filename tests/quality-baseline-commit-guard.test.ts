// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUARD = join(ROOT, "scripts/quality/baseline_commit_guard.mjs");

const COLUMNS = [
  "doc", "platform", "machine", "completes", "speed_p50_ms", "speed_p95_ms",
  "fidelity", "fidelity_metric", "size_ratio", "tol_speed_pct", "tol_speed_ms",
  "tol_fidelity", "tol_size_pct", "run_id", "why",
];

function row(overrides: Partial<Record<string, string>> = {}) {
  const base: Record<string, string> = {
    doc: "doc-a", platform: "darwin", machine: "dev-macbook-m1pro", completes: "true",
    speed_p50_ms: "100", speed_p95_ms: "200", fidelity: "100.0",
    fidelity_metric: "retention_chars_pct", size_ratio: "1.0", tol_speed_pct: "-",
    tol_speed_ms: "-", tol_fidelity: "-", tol_size_pct: "-", run_id: "r1", why: "-",
    ...overrides,
  };
  return COLUMNS.map((column) => base[column]).join("\t");
}

function tsv(rows: string[]) {
  return ["# methodology: golden-17-v1", COLUMNS.join("\t"), ...rows].join("\n") + "\n";
}

/** A throwaway repository with one baseline commit already in it. */
class Repo {
  readonly dir: string;

  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), "pdfluent-baseline-guard-"));
    this.git("init", "-q", "-b", "main");
    this.git("config", "user.email", "test@example.invalid");
    this.git("config", "user.name", "Test");
    this.write("quality/axes/pdfa.tsv", tsv([row()]));
    this.write("src/x.ts", "export const x = 1;\n");
    this.git("add", "-A");
    this.git("commit", "-q", "-m", "chore: start");
  }

  git(...argv: string[]) {
    return execFileSync("git", ["-C", this.dir, ...argv], { encoding: "utf8" });
  }

  write(path: string, body: string) {
    const full = join(this.dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }

  commit(message: string, files: Record<string, string>) {
    for (const [path, body] of Object.entries(files)) this.write(path, body);
    this.git("add", "-A");
    this.git("commit", "-q", "-m", message);
  }

  check() {
    const result = spawnSync(
      process.execPath,
      [GUARD, "--repo", this.dir, "--range", "HEAD~1..HEAD"],
      { encoding: "utf8" },
    );
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }
}

describe("a baseline may only move on its own, with a ticket and a reason", () => {
  let repo: Repo;
  beforeEach(() => {
    repo = new Repo();
  });

  it("refuses a baseline change that also touches source", () => {
    repo.commit("perf: make it smaller #412", {
      "quality/axes/pdfa.tsv": tsv([row({ size_ratio: "0.9", why: "#412 subsetting" })]),
      "src/x.ts": "export const x = 2;\n",
    });
    const { status, output } = repo.check();
    expect(status).toBe(1);
    expect(output).toContain("may not also change src/x.ts");
  });

  it("refuses a baseline change whose message names no ticket", () => {
    repo.commit("chore: update numbers", {
      "quality/axes/pdfa.tsv": tsv([row({ size_ratio: "0.9", why: "measured again" })]),
    });
    const { status, output } = repo.check();
    expect(status).toBe(1);
    expect(output).toContain("must name the ticket");
  });

  it("refuses a value that got worse with no why", () => {
    repo.commit("chore(quality): accept the new size #412", {
      "quality/axes/pdfa.tsv": tsv([row({ size_ratio: "1.4" })]),
    });
    const { status, output } = repo.check();
    expect(status).toBe(1);
    expect(output).toContain("size_ratio with no why");
  });

  it("refuses a document that stopped completing with no why", () => {
    repo.commit("chore(quality): re-record #412", {
      "quality/axes/pdfa.tsv": tsv([row({ completes: "false" })]),
    });
    const { status, output } = repo.check();
    expect(status).toBe(1);
    expect(output).toContain("completes with no why");
  });

  it("accepts a baseline change on its own, with a ticket and a reason", () => {
    repo.commit("chore(quality): trade size for conformance #412", {
      "quality/axes/pdfa.tsv": tsv([
        row({ size_ratio: "1.4", why: "#412 font subsetting off until #187 is understood" }),
      ]),
      "quality/runs/r2.json": "{}\n",
    });
    const { status, output } = repo.check();
    expect(status).toBe(0);
    expect(output).toContain("OK");
  });

  it("accepts an improvement recorded on its own", () => {
    repo.commit("chore(quality): raise the floor after #412", {
      "quality/axes/pdfa.tsv": tsv([row({ size_ratio: "0.8", run_id: "r2" })]),
    });
    expect(repo.check().status).toBe(0);
  });

  it("says nothing about a commit that touches no baseline", () => {
    repo.commit("feat: something else entirely", { "src/x.ts": "export const x = 3;\n" });
    const { status, output } = repo.check();
    expect(status).toBe(0);
    expect(output).toContain("OK");
  });
});
