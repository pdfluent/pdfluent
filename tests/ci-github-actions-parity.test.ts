// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOWS = join(ROOT, ".github/workflows");
const OUR_RUNNER = ["self-hosted", "linux", "pdfluent-editor"];

type Job = { key: string; name: string; body: string };

/**
 * The jobs of one workflow. Line-based, like the guard beside it: the files
 * carry shell that a permissive scan reads as configuration.
 */
function jobsOf(file: string): Job[] {
  const lines = readFileSync(join(WORKFLOWS, file), "utf8").split("\n");
  const jobs: Job[] = [];
  let inJobs = false;
  let current: { key: string; from: number } | null = null;

  const close = (until: number) => {
    if (!current) return;
    const body = lines.slice(current.from + 1, until).join("\n");
    const named = /^ {4}name:\s*(\S.*?)\s*$/m.exec(body);
    jobs.push({ key: current.key, name: named ? named[1] : current.key, body });
    current = null;
  };

  lines.forEach((line, index) => {
    if (line.trim() === "" || /^\s*#/.test(line)) return;
    const indent = line.search(/\S/);
    if (indent === 0) {
      close(index);
      inJobs = /^jobs:\s*$/.test(line);
      return;
    }
    if (!inJobs || indent !== 2) return;
    close(index);
    const key = /^ {2}([A-Za-z_][\w-]*):\s*$/.exec(line);
    if (key) current = { key: key[1], from: index };
  });
  close(lines.length);

  return jobs;
}

function runsOn(job: Job): string[] {
  const inline = /^ {4}runs-on:\s*\[(.*)\]\s*$/m.exec(job.body);
  if (inline) return inline[1].split(",").map((label) => label.trim());
  const block = /^ {4}runs-on:\s*\n((?: {6}- .*\n?)+)/m.exec(job.body);
  if (block) return block[1].split("\n").filter(Boolean).map((line) => line.replace(/^ {6}- /, "").trim());
  const scalar = /^ {4}runs-on:\s*(\S.*?)\s*$/m.exec(job.body);
  return scalar ? [scalar[1]] : [];
}

// The gates that must run on a push to a release branch. Every name here is a
// name a quality document already uses, and the list is what keeps those
// documents true. It is written out rather than derived from the workflow: a
// list read from the file it judges agrees with whatever that file says,
// including with a gate someone deleted.
const GATING_JOBS = [
  "quality-gates-fast",
  "repo-truth",
  "quality:ui-register",
  "quality:offline-allowlist",
  "quality:i18n-parity",
  "quality:no-silent-failures",
  "cargo-test",
  "quality:golden-roundtrip",
  "quality:golden-pdfa",
  "quality:axes",
  "clippy",
  "native-smoke",
  "playwright",
];

describe("the GitHub pipeline carries the whole gate set", () => {
  const quality = jobsOf("quality.yml");

  for (const name of GATING_JOBS) {
    it(`runs ${name} on our own runner`, () => {
      const job = quality.find((candidate) => candidate.name === name);
      expect(job, `${name} has no job in .github/workflows/quality.yml`).toBeDefined();
      expect(runsOn(job!)).toEqual(OUR_RUNNER);
      // A soft gate is not a gate. This is the GitHub spelling of the
      // allow_failure rule the GitLab side is held to.
      expect(job!.body, `${name} is continue-on-error — a soft gate is not a gate`).not.toContain(
        "continue-on-error: true",
      );
    });
  }

  // The trigger is the half that went missing on GitLab for two months: the
  // Rust, smoke and Playwright gates were tag-only, the last tag was
  // v1.0.0-beta.20, and beta.21 shipped without any of them ever running.
  it("runs on every push to a release branch and on every pull request", () => {
    const source = readFileSync(join(WORKFLOWS, "quality.yml"), "utf8");
    expect(source).toMatch(/^on:\n {2}push:\n {4}branches:\n {6}- main\n {6}- "release\/\*\*"\n {2}pull_request:$/m);
  });

  // Three jobs wait on another gate for the machine, not for its verdict:
  // playwright waits on native-smoke for port 1420, quality:axes waits on both
  // so it measures the code instead of the load. A `needs` alone would let a
  // failing smoke test turn those two into "skipped", and a skipped gate reads
  // as a gate that had nothing to say — which is the failure mode this whole
  // file exists for.
  for (const name of ["playwright", "quality:axes"]) {
    it(`does not let a machine fence turn ${name} into a skip`, () => {
      const job = quality.find((candidate) => candidate.name === name);
      expect(job!.body).toContain(
        "if: ${{ !cancelled() && needs.quality-gates-fast.result == 'success' }}",
      );
    });
  }

  // One runner, thirteen serial jobs, five terminals landing: without this the
  // queue only grows and the trunk's verdict is hours old. Cancelling is limited
  // to runs another run has overtaken -- the head that replaces one contains it,
  // and every landing has already been through the same steps locally.
  it("does not let the queue outrun the trunk", () => {
    const source = readFileSync(join(WORKFLOWS, "quality.yml"), "utf8");
    expect(source).toContain("group: quality-${{ github.ref }}");
    expect(source).toContain("cancel-in-progress: true");
  });

  it("runs the hosted-minutes guard inside the fast gate", () => {
    const fast = quality.find((job) => job.name === "quality-gates-fast");
    expect(fast!.body).toContain("scripts/ci/no-hosted-ci-on-auto-triggers.mjs");
  });

  // On 2026-09-08 a test landed carrying an internal host in a published file
  // and blocked the next snapshot. Nothing in CI saw it: the scan only ran at
  // publication time, which is days later and on someone else's branch.
  it("scans what goes public for internal names, on every push", () => {
    const fast = quality.find((job) => job.name === "quality-gates-fast");
    expect(fast!.body).toContain("scripts/ci/internal-terms.mjs --tree");
  });

  it("leaves no workflow behind on a hosted runner", () => {
    const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"));
    for (const file of files) {
      for (const job of jobsOf(file)) {
        // A reusable local workflow is scanned as its own file.
        if (/^ {4}uses:/m.test(job.body) && !/^ {4}runs-on:/m.test(job.body)) continue;
        expect(runsOn(job), `${file}: ${job.key}`).toContain("self-hosted");
      }
    }
  });
});

describe("the release train", () => {
  const release = jobsOf("release.yml");
  const named = (name: string) => release.find((job) => job.name === name);

  for (const name of ["build-linux", "release", "publish-updater"]) {
    it(`carries ${name}`, () => {
      expect(named(name), `${name} has no job in .github/workflows/release.yml`).toBeDefined();
      expect(runsOn(named(name)!)).toEqual(OUR_RUNNER);
    });
  }

  // Artifacts build on a tag; nothing reaches R2 or a user until a person
  // dispatches the workflow. A same-version artifact swap broke the beta.5
  // update signature, and this is the gate that made that a decision.
  it("publishes only when a person starts it", () => {
    expect(named("release")!.body).toContain("if: github.event_name == 'workflow_dispatch'");
  });

  // wrangler is provisioned on the build host, not by this repository, and it
  // is not on the runner account's PATH today. Finding that out half way
  // through the upload loop leaves a version part-published in the bucket with
  // the manifest still on the previous release.
  for (const name of ["release", "publish-updater"]) {
    it(`${name} refuses before it writes anything it cannot finish`, () => {
      expect(named(name)!.body).toContain("command -v wrangler >/dev/null");
    });
  }

  // Linux is out of scope for the shipped desktop release and must never redden
  // the pipeline or read as a macOS/Windows blocker.
  it("keeps Linux non-gating", () => {
    expect(named("build-linux")!.body).toContain("continue-on-error: true");
    expect(named("publish-updater")!.body).toContain("continue-on-error: true");
  });
});

// Re-measuring a baseline is a deliberate act with a diff to read, not a step
// that rides along with a gate. It has its own workflow so that dispatching the
// gate cannot bless anything, and it hands the file back instead of committing
// it.
describe("the PDF/A baseline is re-measured where it is judged", () => {
  const bless = jobsOf("golden-bless.yml").find((job) => job.name === "golden-pdfa-bless");

  it("exists, on the runner that judges the baseline", () => {
    expect(bless, "golden-pdfa-bless has no job in .github/workflows/golden-bless.yml").toBeDefined();
    expect(runsOn(bless!)).toEqual(OUR_RUNNER);
  });

  it("measures with the bless flag and hands the file back", () => {
    expect(bless!.body).toContain("PDFLUENT_GOLDEN_BLESS");
    expect(bless!.body).toContain("--test golden_pdfa");
    expect(bless!.body).toContain("src-tauri/tests/golden/pdfa-baseline.tsv");
  });

  // An empty column reads as "nothing moved", so a missing judge has to stop
  // the job rather than produce a baseline of nothing.
  it("refuses to measure without the tool that judges conformance", () => {
    expect(bless!.body).toContain("verapdf --version");
  });

  // tauri::generate_context! reads ../dist at compile time and there is no gate
  // job in front of this one to inherit a build from.
  it("builds the frontend it compiles against", () => {
    expect(bless!.body).toContain("npm ci");
    expect(bless!.body).toContain("npm run build");
  });

  // A workflow that could fire on a push is a baseline that rewrites itself.
  it("only ever runs because a person asked for it", () => {
    const source = readFileSync(join(WORKFLOWS, "golden-bless.yml"), "utf8");
    expect(source).toMatch(/^on:\n {2}workflow_dispatch:$/m);
  });
});

// A measured run is evidence. quality:axes judged one on this runner on every
// push for a day and kept none of them, which is why quality/axes/*.tsv still
// had no linux rows at all: there was nothing to seed them from.
describe("the axes job keeps the run it judged", () => {
  const axes = jobsOf("quality.yml").find((job) => job.name === "quality:axes");

  it("hands the run file back", () => {
    expect(axes, "quality:axes has no job in .github/workflows/quality.yml").toBeDefined();
    expect(axes!.body).toContain("actions/upload-artifact");
    expect(axes!.body).toContain("path: quality/runs/");
  });

  // The judgement is the interesting case. A run that came back red is the one
  // somebody has to read, and an upload that only happens after a green step
  // is an upload that is never there when it is needed.
  it("uploads the run even when the judgement was red", () => {
    expect(axes!.body).toContain("if: ${{ !cancelled() }}");
  });

  // Same silent failure as the bless job: no class, no run file, an artifact
  // step that warns, and a green job with nothing in it.
  it("fails rather than upload an empty directory", () => {
    expect(axes!.body).toContain("if-no-files-found: error");
  });

  // Judging is this job's work; blessing is a decision with a diff in front of
  // the person making it. A --bless inside the gate writes a floor nobody read.
  it("never blesses what it measured", () => {
    // Comments stripped: a comment saying the job does not bless is not a
    // bless, and this case is about the commands the runner executes.
    const commands = axes!.body.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    expect(commands).not.toContain("--bless");
  });
});

// The four axes have a linux column only if a run file measured on the runner
// comes back. quality:axes measures one on every push, judges it and throws it
// away; seeding or re-seeding the column needs the file itself in a hand, and
// this is the job that hands it over.
describe("the axes baselines are re-measured where their linux column is judged", () => {
  const bless = jobsOf("golden-bless.yml").find((job) => job.name === "golden-axes-bless");

  it("exists, on the runner whose numbers the linux column holds", () => {
    expect(bless, "golden-axes-bless has no job in .github/workflows/golden-bless.yml").toBeDefined();
    expect(runsOn(bless!)).toEqual(OUR_RUNNER);
  });

  // golden_axes writes nothing at all when the class is unset — it prints
  // SKIPPED and returns 0. A job without this line is green, empty and
  // indistinguishable from a measurement.
  it("names the machine class the linux rows are keyed on", () => {
    expect(bless!.body).toContain("PDFLUENT_MACHINE_CLASS: runner-desktop-wsl-4core");
  });

  // A debug number is not a number, and a baseline seeded from one would judge
  // every later release run as an improvement to be blessed.
  it("measures under the release profile", () => {
    expect(bless!.body).toMatch(/cargo test --release .*--test golden_axes/);
  });

  it("hands back the run file rather than a baseline it wrote itself", () => {
    expect(bless!.body).toContain("quality/runs");
    expect(bless!.body).not.toContain("ratchet.py --all --run");
  });

  // The way this job fails silently: no class, a crashed measurement, a moved
  // path — all of them leave quality/runs empty, and upload-artifact's default
  // is a warning nobody reads in a job that went green.
  it("fails rather than upload an empty directory", () => {
    expect(bless!.body).toContain("if-no-files-found: error");
  });

  it("builds the frontend it compiles against", () => {
    expect(bless!.body).toContain("npm ci");
    expect(bless!.body).toContain("npm run build");
  });
});

describe("no secret is written into a workflow", () => {
  // The rule from #465: a workflow file is editable in a pull request, so a
  // secret spelled out in one has left the building. Values come from the
  // repository secret store through ${{ secrets.* }} and nowhere else.
  const SECRET_NAMES = [
    "XFA_CLONE_TOKEN",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_R2_BUCKET_NAME",
    "CF_R2_PUBLIC_URL",
  ];

  const files = [
    ...readdirSync(WORKFLOWS)
      .filter((name) => name.endsWith(".yml"))
      .map((name) => join(WORKFLOWS, name)),
    join(ROOT, ".github/actions/sdk-pin/action.yml"),
  ];

  for (const file of files) {
    it(`${file.slice(ROOT.length)} names secrets without carrying them`, () => {
      const source = readFileSync(file, "utf8");
      for (const secret of SECRET_NAMES) {
        // `NAME: <literal>` is the shape a pasted value takes. `NAME:
        // ${{ secrets.NAME }}` and an `inputs.` reference are the two shapes
        // that are allowed to exist.
        const assignment = new RegExp(`${secret}:\\s*(\\S.*)$`, "gm");
        for (const match of source.matchAll(assignment)) {
          expect(match[1], `${secret} is assigned a literal in ${file}`).toMatch(
            /^\$\{\{\s*(secrets|inputs|env)\./,
          );
        }
      }
    });
  }
});

describe("the runner the workflows ask for is the runner we register", () => {
  const installer = readFileSync(join(ROOT, "scripts/ci/install-github-runner.sh"), "utf8");

  // A label the installer does not hand out is a job that sits pending forever,
  // and pending is the state that looks like nothing is wrong. `self-hosted` is
  // added by GitHub itself; the other two are ours to spell.
  it("registers the labels every job asks for", () => {
    const labels = /^RUNNER_LABELS="\$\{RUNNER_LABELS:-(.*)\}"$/m.exec(installer);
    expect(labels, "the installer no longer sets RUNNER_LABELS").not.toBeNull();
    const registered = new Set(["self-hosted", ...labels![1].split(",")]);
    for (const label of OUR_RUNNER) expect([...registered]).toContain(label);
  });

  // The two runners share a machine and its caches on purpose: a second cargo
  // home and a second browser download is how the disk filled up. If the GitLab
  // runner's environment moves, this moves with it.
  it("hands the jobs the caches the pipeline already uses", () => {
    for (const line of [
      "CARGO_HOME=/var/cache/cargo-home",
      "CARGO_TARGET_DIR=/var/cache/cargo-target-editor",
      "TMPDIR=/var/cache/ci-tmp",
      "PLAYWRIGHT_BROWSERS_PATH=/var/cache/ms-playwright",
    ]) {
      expect(installer).toContain(line);
    }
  });

  // The registration token is short-lived, but an argument is visible in `ps`
  // to every user on the machine for as long as the command runs.
  // Four cores, shared with the engine's runner and with hand-run measurements.
  // A cargo that takes the machine makes every number measured beside it
  // meaningless, and quality:axes is one of those numbers.
  it("leaves the build host room to do anything else", () => {
    expect(installer).toContain("CARGO_BUILD_JOBS=2");
  });

  it("takes the registration token from the environment, never from a literal", () => {
    expect(installer).toContain('if [ -z "${GITHUB_RUNNER_TOKEN:-}" ]; then');
    expect(installer).not.toMatch(/--token\s+[A-Z0-9]{20,}/);
  });
});
