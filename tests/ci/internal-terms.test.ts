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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const guard = resolve(__dirname, "../../scripts/ci/internal-terms.mjs");
// Realpath is no longer what makes the guard start -- scripts/lib/main-module.mjs
// compares the files rather than the spelling of their paths, and
// tests/ci/guards-are-never-silent.test.ts holds that to it. It stays because a
// path that reads the same in a failure message as it does on disk is worth the
// one call.
const dir = realpathSync(mkdtempSync(join(tmpdir(), "internal-terms-test-")));
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

// ---------------------------------------------------------------------------
// THE PUBLISHED TREE, READ ONCE
//
// `--tree` used to ask git for every published blob twice: once to sniff it for
// NUL bytes and once to read it. On the editor's tree that is two thousand
// processes, and a measurement on 2026-09-16 put 99.9% of a 136 s run in fork
// and exec -- the regex work was 0.1 s of it. A guard that slow is a guard
// somebody trims out of the gate.
//
// These cases are built on a repository of their own rather than on this one.
// Which files this checkout happens to hold is not the subject, and a case that
// reads the surrounding tree passes or fails for reasons that have nothing to do
// with the guard. The fixture also holds what this tree cannot be made to hold
// on demand: two names sharing one blob, and a binary carrying a partner name.
//
// Mutation to check this is not vacuous: put the per-blob `execFileSync` pair
// back in scanTree and the invocation case goes red on the count, the stdin
// capture is empty, and the timing case loses its floor.
const FIXTURE_FILES = 1200;

// A hook exports GIT_DIR, and a fixture that inherits it commits into the
// repository the test is running in.
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  return env;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024,
  });
}

const repo = join(dir, "tree-fixture");
const shimDir = join(dir, "git-shim");
const callLog = join(dir, "git-calls.log");
const batchStdin = join(dir, "git-batch-stdin");
let cleanRef = "";
let leakyRef = "";

function fixtureGuard() { return join(repo, "scripts/ci/internal-terms.mjs"); }

/** What the guard should ask for: published paths, and the blobs behind them. */
function publishedAt(ref: string) {
  const listing = git(repo, ["ls-tree", "-r", "--format=%(objectname) %(path)", ref]);
  const rows = listing.split("\n").filter(Boolean).map((row) => {
    const sep = row.indexOf(" ");
    return { path: row.slice(sep + 1), sha: row.slice(0, sep) };
  });
  const paths = rows.filter((r) =>
    r.path !== "scripts/ci/internal-terms.mjs"
    && r.path !== "tests/ci/internal-terms.test.ts"
    && r.path !== "README-public.md"
    && !r.path.startsWith("private/"));
  return { paths, blobs: new Set(paths.map((r) => r.sha)) };
}

function runTree(ref: string, { shim = false } = {}) {
  const env = { ...cleanEnv(), CI: "", PDFLUENT_INTERNE_TERMEN: terms };
  if (shim) env.PATH = `${shimDir}${delimiter}${env.PATH ?? ""}`;
  const started = Date.now();
  const r = spawnSync(process.execPath, [fixtureGuard(), "--tree", ref], {
    cwd: repo, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, ms: Date.now() - started };
}

beforeAll(() => {
  for (const d of ["scripts/ci", "scripts/lib", "docs", "src/gen"]) mkdirSync(join(repo, d), { recursive: true });
  copyFileSync(guard, fixtureGuard());
  copyFileSync(resolve(__dirname, "../../scripts/ci/public-tree.mjs"), join(repo, "scripts/ci/public-tree.mjs"));
  // The guard asks scripts/lib/main-module.mjs whether it is the command, so
  // the fixture carries that too -- a copy without it does not start at all.
  copyFileSync(resolve(__dirname, "../../scripts/lib/main-module.mjs"), join(repo, "scripts/lib/main-module.mjs"));
  writeFileSync(join(repo, "docs/PUBLIC_TREE.json"), JSON.stringify({
    internal: [{ path: "private", why: "fixture: a directory this repository would not publish" }],
    public_only: [{ path: "README-public.md", why: "fixture: a file the public side owns" }],
  }));
  // Enough files that a return to one process per blob is measurable rather
  // than a rounding error.
  for (let i = 0; i < FIXTURE_FILES; i += 1) {
    writeFileSync(join(repo, "src/gen", `f${i}.ts`), `export const n${i} = ${i};\n`);
  }
  // Two names, one blob. The reader must ask for it once and judge both names.
  writeFileSync(join(repo, "src/gen/twin-a.ts"), "export const twin = 1;\n");
  writeFileSync(join(repo, "src/gen/twin-b.ts"), "export const twin = 1;\n");
  // A binary that carries a listed name in its bytes. It is skipped on its
  // content, so this stays green only while the NUL sniff still sees the same
  // bytes the scan would have seen.
  writeFileSync(join(repo, "src/gen/icon.bin"), Buffer.concat([
    Buffer.from([0x00, 0x01, 0x02, 0x00]), Buffer.from("ZzqPartnerName"), Buffer.from([0x00]),
  ]));

  git(repo, ["init", "-q"]);
  git(repo, ["-c", "core.excludesFile=", "add", "."]);
  git(repo, ["-c", "user.name=fixture", "-c", "user.email=fixture@invalid", "commit", "-q", "-m", "fixture: a tree to read"]);
  cleanRef = git(repo, ["rev-parse", "HEAD"]).trim();

  writeFileSync(join(repo, "src/gen/leaky.ts"), 'export const owner = "ZzqPartnerName";\n');
  git(repo, ["-c", "core.excludesFile=", "add", "."]);
  git(repo, ["-c", "user.name=fixture", "-c", "user.email=fixture@invalid", "commit", "-q", "-m", "fixture: a name that must not go out"]);
  leakyRef = git(repo, ["rev-parse", "HEAD"]).trim();

  // A git that says what it was asked for, and keeps what was piped into the
  // batch. Counting processes is the only way to tell one read of a tree from
  // two thousand: both produce the same report.
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  mkdirSync(shimDir, { recursive: true });
  writeFileSync(join(shimDir, "git"), [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> ${JSON.stringify(callLog)}`,
    'case " $* " in',
    '  *" cat-file "*)',
    `    tee -a ${JSON.stringify(batchStdin)} | ${JSON.stringify(realGit)} "$@"`,
    "    exit $?",
    "    ;;",
    "esac",
    `exec ${JSON.stringify(realGit)} "$@"`,
    "",
  ].join("\n"), { mode: 0o755 });
}, 120_000);

describe("the published tree is read once, not once per blob", () => {
  it("asks git for every published blob in a single batch", () => {
    rmSync(callLog, { force: true });
    rmSync(batchStdin, { force: true });
    const expected = publishedAt(cleanRef);
    // The fixture carries a blob under two names on purpose: without it, one
    // request per path and one per blob are the same number.
    expect(expected.blobs.size).toBeLessThan(expected.paths.length);

    const r = runTree(cleanRef, { shim: true });
    expect(r.status).toBe(0);

    const calls = readFileSync(callLog, "utf8").split("\n").filter(Boolean);
    const reads = calls.filter((c) => c.includes("cat-file"));
    // Counted, not listed: a return to one process per blob puts thousands of
    // lines here and the number is the whole point.
    expect(reads.length).toBe(1);
    expect(reads[0]).toBe("cat-file --batch --buffer");

    const asked = readFileSync(batchStdin, "utf8").split("\n").filter(Boolean);
    expect(asked.length).toBe(expected.blobs.size);
    expect(new Set(asked)).toEqual(expected.blobs);
    // One file of the fixture is binary; every other published file is read.
    expect(r.out).toContain(`OK: ${expected.paths.length - 1} published text files`);
  }, 120_000);

  it("still skips a binary blob and still refuses a name in a text one", () => {
    // The binary carries the listed name. Green here means the sniff and the
    // scan are looking at the same bytes as before, not that nothing matched.
    const ok = runTree(cleanRef);
    expect(ok.status).toBe(0);
    expect(ok.out).toContain("OK");

    const bad = runTree(leakyRef);
    expect(bad.status).toBe(1);
    expect(bad.out).toContain("src/gen/leaky.ts");
    expect(bad.out).toContain("partner");
  }, 120_000);

  it("reads the whole tree well inside the time the gate allows it", () => {
    // Generous on purpose: this is a floor under a regression, not a benchmark.
    // A return to two processes per blob puts this fixture far past it on any
    // runner; the batch does it in about a second.
    const r = runTree(cleanRef);
    expect(r.status).toBe(0);
    expect(r.ms).toBeLessThan(30_000);
  }, 120_000);
});
