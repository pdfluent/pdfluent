// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUR_RUNNER = "pdfluent-editor-linux";

// A GitLab job without `tags:` goes to whichever runner is available, and on
// this project that is the shared, billed SaaS fleet. quality:i18n-parity was
// written with `image: node:20` and no tags on 2026-09-07 and would have run
// there; nothing in the repo would have said so. Everything the pipeline runs
// automatically belongs on our own runner.
//
// The two exceptions are the SaaS desktop builds. They cannot run on our Linux
// runner (they need macOS and Windows hardware) and they are opt-in: their
// rules require DESKTOP_SAAS_BUILDS == "true", a variable that is not set, so
// they never start on their own. That gate is asserted below — an exception
// without its gate is not an exception.
const SAAS_EXCEPTIONS: Record<string, string> = {
  "build-macos": "macOS hardware; opt-in via DESKTOP_SAAS_BUILDS",
  "build-windows": "Windows hardware; opt-in via DESKTOP_SAAS_BUILDS",
};

// Top-level keys that configure the pipeline instead of defining a job. A key
// starting with "." is a hidden template and never runs on its own.
const NOT_A_JOB = new Set([
  "workflow",
  "stages",
  "variables",
  "default",
  "include",
  "image",
  "services",
  "cache",
  "before_script",
  "after_script",
]);

export type CiJob = { name: string; body: string; tags: string[] };

/**
 * Line-based on purpose: the file carries shell heredocs and `- if:` rule
 * strings that a permissive scan would read as configuration. Only a `tags:`
 * key at the job's own indent level counts.
 */
export function parseJobs(yaml: string): CiJob[] {
  const lines = yaml.split("\n");
  const jobs: CiJob[] = [];
  let current: { name: string; from: number } | null = null;

  const close = (until: number) => {
    if (!current) return;
    const body = lines.slice(current.from + 1, until).join("\n");
    jobs.push({ name: current.name, body, tags: tagsOf(body) });
    current = null;
  };

  lines.forEach((line, index) => {
    if (/^[\s#]/.test(line) || line === "") return;
    close(index);
    const match = /^([A-Za-z_][A-Za-z0-9_:.-]*):\s*$/.exec(line);
    if (!match || NOT_A_JOB.has(match[1])) return;
    current = { name: match[1], from: index };
  });
  close(lines.length);

  return jobs;
}

function tagsOf(body: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^ {2}tags:\s*$/.test(line));
  if (start === -1) return [];
  const tags: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^ {4}- (.+?)\s*$/.exec(line);
    if (!item) break;
    tags.push(item[1]);
  }
  return tags;
}

describe("every GitLab job runs on our own runner", () => {
  const ci = readFileSync(join(ROOT, ".gitlab-ci.yml"), "utf8");
  const jobs = parseJobs(ci);

  it("finds the jobs at all", () => {
    // Guards the guard: a parser that silently returns nothing would pass
    // every assertion below.
    expect(jobs.map((job) => job.name)).toContain("quality-gates-fast");
    expect(jobs.length).toBeGreaterThanOrEqual(9);
  });

  for (const job of jobs.filter((candidate) => !(candidate.name in SAAS_EXCEPTIONS))) {
    it(`${job.name} carries tags: [${OUR_RUNNER}]`, () => {
      expect(
        job.tags,
        `${job.name} has no runner tag and would run on the shared, billed fleet`,
      ).toContain(OUR_RUNNER);
    });
  }

  for (const [name, reason] of Object.entries(SAAS_EXCEPTIONS)) {
    it(`${name} is an exception with a reason and an opt-in gate: ${reason}`, () => {
      const job = jobs.find((candidate) => candidate.name === name);
      expect(job, `${name} is on the exception list but is not a job any more`).toBeDefined();
      expect(
        job?.body,
        `${name} may only start when someone sets DESKTOP_SAAS_BUILDS`,
      ).toContain('$DESKTOP_SAAS_BUILDS == "true"');
    });
  }
});

describe("every YAML anchor a job uses is defined", () => {
  // A rebase over a change that renamed *sdk-checkout to *sdk-pin left this
  // file referring to an anchor that no longer existed. GitLab rejects the
  // whole pipeline for that, so the job it protects does not fail — nothing
  // runs at all, which is the failure that looks most like nothing happened.
  const ci = readFileSync(join(ROOT, ".gitlab-ci.yml"), "utf8");

  it("defines every anchor that is referenced", () => {
    const defined = new Set(Array.from(ci.matchAll(/&([A-Za-z0-9_-]+)/g), (m) => m[1]));
    const used = Array.from(ci.matchAll(/^\s*-?\s*\*([A-Za-z0-9_-]+)\s*$/gm), (m) => m[1]);
    expect(used.length, "no anchor references found — the pattern stopped matching").toBeGreaterThan(0);
    for (const anchor of used) {
      expect(defined, `*${anchor} is used but never defined`).toContain(anchor);
    }
  });
});

describe("the runner-tag parser", () => {
  it("flags a job with no tags at all", () => {
    const jobs = parseJobs(["quality:i18n-parity:", "  stage: quality", "  image: node:20", "  script:", "    - npm run i18n"].join("\n"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].tags).toEqual([]);
  });

  it("flags a job tagged for a different runner", () => {
    const jobs = parseJobs(["a:", "  tags:", "    - saas-linux-medium-amd64", "  script:", "    - true"].join("\n"));
    expect(jobs[0].tags).toEqual(["saas-linux-medium-amd64"]);
    expect(jobs[0].tags).not.toContain(OUR_RUNNER);
  });

  it("accepts a tagged job", () => {
    const jobs = parseJobs(["a:", "  tags:", `    - ${OUR_RUNNER}`, "  script:", "    - true"].join("\n"));
    expect(jobs[0].tags).toContain(OUR_RUNNER);
  });

  it("ignores pipeline configuration and hidden templates", () => {
    const jobs = parseJobs(
      [
        "stages:",
        "  - quality",
        "variables:",
        "  X: y",
        ".sdk-checkout: &sdk-checkout",
        "  - echo hi",
        "a:",
        "  tags:",
        `    - ${OUR_RUNNER}`,
      ].join("\n"),
    );
    expect(jobs.map((job) => job.name)).toEqual(["a"]);
  });

  it("does not read a script line as a tag list", () => {
    const jobs = parseJobs(
      ["a:", "  script:", "    - echo 'tags:'", "    - echo '  - some-other-runner'"].join("\n"),
    );
    expect(jobs[0].tags).toEqual([]);
  });
});
