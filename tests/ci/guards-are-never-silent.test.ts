// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A guard that is run must never end in silence with exit 0.
//
// Every guard in scripts/ci and scripts/quality decided whether it was the
// command or an import by comparing `import.meta.url` with `process.argv[1]`
// as strings. Node resolves a symlinked entry point before it fills in
// `import.meta.url` and leaves argv[1] as typed, so through a symlink the
// comparison is false: the module loads, runs nothing, prints nothing, and
// exits 0 -- which is byte for byte a clean pass. Two guards were caught by
// this in the same week, each in a different way (a symlinked temporary
// directory; a checkout path containing a space).
//
// So these cases spawn every guard three times -- through its real path, through
// a symlinked checkout, and through a link that wears another name -- and assert
// that all three say the same thing and that none of them says nothing. The
// arguments are chosen to reach a cheap, certain verdict without a network, so
// what is asserted is that the guard RAN -- not what it thinks of this machine.
//
// Mutation to check this is not vacuous: put
// `import.meta.url === \`file://${process.argv[1]}\`` back into any one guard
// and its symlinked invocation goes silent with exit 0 while the real path
// still answers, so both the agreement case and the never-silent case go red
// for that guard. The last describe below keeps a fixture of that old spelling
// and pins it, so the reason this file exists cannot quietly stop being true.
//
// The same question has two other spellings, and #557 found eight guards using
// them outside this file's reach:
//
//   · `process.argv[1].endsWith("i18n-parity.mjs")` -- a question about a name.
//     A copy, a wrapper, a renamed link or a checkout reached through any path
//     that does not end in that name answers no, and the guard goes quiet with
//     exit 0. It is the string comparison with a different operator, and a
//     symlinked DIRECTORY does not expose it: the path still ends in the file's
//     own name. The third invocation above is the one that does.
//   · nothing at all: a straight-line `process.exitCode = main();` at the top
//     level, which runs on import as readily as on invocation.
//
// So the rule the last describe enforces is not "do not use that idiom" but
// "every command here asks scripts/lib/main-module.mjs, and none of them reads
// process.argv[1] itself".
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";

const repo = realpathSync(resolve(__dirname, "../.."));
const dir = realpathSync(mkdtempSync(join(tmpdir(), "guards-never-silent-")));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The symlinked view of this checkout. On macOS every temporary directory is
// already reached through /var -> /private/var and reproduces this on its own;
// on Linux nothing is symlinked unless it is made so, and the gate is Linux.
const linked = join(dir, "checkout-through-a-symlink");
symlinkSync(repo, linked);

// A hook exports GIT_DIR, and a guard that inherits it reads a repository
// other than the one it was pointed at.
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  return { ...env, ...extra };
}

// Fixtures the cases own, so no case depends on what this machine happens to
// hold: a partner list that is not this repository's, a repository with no
// tags in it, an empty directory of reports, and a path that is not there.
const terms = join(dir, "terms.txt");
writeFileSync(terms, "ZzqPartnerName\n");
const cleanMessage = join(dir, "message.txt");
writeFileSync(cleanMessage, "feat(protect): set an owner password\n");
const tagless = join(dir, "repo-without-tags");
mkdirSync(tagless);
execFileSync("git", ["init", "-q"], { cwd: tagless, env: cleanEnv() });
const noReports = join(dir, "reports-that-are-not-there");
mkdirSync(noReports);
const missing = join(dir, "no-such-directory");

interface Guard {
  script: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  says: RegExp;
}

const GUARDS: Guard[] = [
  {
    script: "scripts/ci/internal-terms.mjs",
    args: ["--message", cleanMessage],
    env: { CI: "", PDFLUENT_INTERNE_TERMEN: terms },
    says: /OK: 1 message carry nothing internal\./,
  },
  { script: "scripts/ci/public-tree.mjs", args: [], says: /usage: public-tree\.mjs/ },
  {
    script: "scripts/ci/repo-truth.mjs",
    args: ["--no-fetch", "--trunk", "zzq-no-such-ref"],
    says: /--trunk zzq-no-such-ref does not resolve to a commit/,
  },
  {
    script: "scripts/ci/remotes-agree.mjs",
    args: [],
    env: { CI_COMMIT_BRANCH: "zzq/not-the-trunk" },
    says: /SKIPPED \(not a pass\): this is zzq\/not-the-trunk/,
  },
  {
    // Refused on the identity, which is the first thing it reads and long
    // before it would reach for a network.
    script: "scripts/ci/publish-public-snapshot.mjs",
    args: ["--no-fetch"],
    env: {
      GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    },
    says: /which is not a\nGitHub noreply alias/,
  },
  {
    script: "scripts/ci/tags-are-pushable.mjs",
    args: [],
    env: { PDFLUENT_REPO_DIR: tagless },
    says: /no tags are visible here, so nothing was checked/,
  },
  {
    script: "scripts/ci/no-hosted-ci-on-auto-triggers.mjs",
    args: [missing],
    says: /no-hosted-ci-on-auto-triggers: cannot read /,
  },
  { script: "scripts/ci/offline-allowlist.mjs", args: ["--zzq"], says: /unknown argument --zzq/ },
  {
    script: "scripts/quality/nightly_summary.mjs",
    args: [noReports, "--platforms", "zzq"],
    says: /- zzq: MISSING — no report was written for this platform/,
  },
  { script: "scripts/quality/require-report.mjs", args: [], says: /--version is required/ },
  { script: "scripts/quality/suite/judge.mjs", args: [], says: /meta\.json/ },
  { script: "scripts/quality/suite/report.mjs", args: [], says: /meta\.json/ },
  { script: "scripts/quality/suite/startup_window.mjs", args: [repo], says: /^\d+ \d+$/m },
  { script: "scripts/quality/suite/ui_walk.mjs", args: [], says: /usage: ui_walk\.mjs/ },

  // #557: four that decided it on what argv[1] ends with, and four that never
  // asked. The first two read this checkout rather than a fixture -- they have
  // no argument that points them elsewhere -- so what is pinned there is the
  // shape of the verdict, which both of their outcomes carry, and not which
  // outcome this machine produces.
  { script: "scripts/quality/i18n-parity.mjs", args: [], says: /^i18n parity: \d+ /m },
  { script: "scripts/quality/ui-register.mjs", args: ["--check"], says: /UI register is (up to date|stale)/ },
  {
    script: "scripts/quality/declared-skips.mjs",
    args: [],
    says: /usage: node scripts\/quality\/declared-skips\.mjs/,
  },
  { script: "scripts/quality/no-silent-failures.mjs", args: ["--list"], says: /^\d+ hits, \d+ allow-list entries$/m },
  {
    script: "scripts/quality/baseline_commit_guard.mjs",
    args: [],
    says: /baseline_commit_guard: --range <A>\.\.<B> is required/,
  },
  { script: "scripts/quality/suite/golden_check.mjs", args: [missing], says: /baseline\.tsv is missing/ },
  { script: "scripts/quality/suite/updater_payload.mjs", args: [noReports], says: /no \.sig under / },
  { script: "scripts/quality/suite/write_meta.mjs", args: [], says: /write_meta: --repo is required/ },
];

function run(script: string, g: Guard) {
  const r = runToFile(process.execPath, [script, ...g.args], { cwd: dir, env: cleanEnv(g.env) });
  return { status: r.status, out: `${r.out}${r.err}` };
}

// A third way in, and the one that tells the two spellings apart. A symlinked
// DIRECTORY still ends in the guard's own file name, so a check that asks what
// argv[1] ends with survives it; a link that wears another name does not. Node
// resolves the link before it fills in import.meta.url, so the guard is the
// same file either way and the helper says so -- on the inode, not on the name.
// Relative imports resolve from the resolved path, so a link parked in a
// temporary directory still reaches scripts/lib and its siblings.
const renamed = join(dir, "links-wearing-another-name");
mkdirSync(renamed);
function underAnotherName(g: Guard): string {
  const link = join(renamed, `zzq-${g.script.replace(/[/.]/g, "-")}.mjs`);
  symlinkSync(join(repo, g.script), link);
  return link;
}

describe("every guard answers the same whichever path it is reached through", () => {
  for (const g of GUARDS) {
    it(`${g.script} runs whichever way it is reached, and says so`, () => {
      const real = run(join(repo, g.script), g);
      const through = run(join(linked, g.script), g);
      const named = run(underAnotherName(g), g);

      // The failure this replaces had one shape: nothing on either stream and
      // an exit code a pipeline reads as a pass. Silence is asserted against
      // first, because a guard that says nothing has judged nothing.
      const ways = [
        ["its own path", real], ["a symlinked path", through], ["a link under another name", named],
      ] as const;
      for (const [how, r] of ways) {
        expect(r.out.trim(), `${g.script} said nothing through ${how}`).not.toBe("");
        expect(r.out, `${g.script} did not reach its own verdict through ${how}`).toMatch(g.says);
      }
      for (const [how, r] of ways.slice(1)) {
        expect(r.status, `${g.script} disagrees with itself between its own path and ${how}`)
          .toBe(real.status);
      }
    }, 60_000);
  }
});

// ---------------------------------------------------------------------------
// THE ENTRY CHECK ITSELF
//
// Built on fixtures of its own rather than on a guard, so these cases say what
// scripts/lib/main-module.mjs does and keep saying it when a guard is added or
// removed.
const helper = pathToFileURL(join(repo, "scripts/lib/main-module.mjs")).href;
const fixtures = join(dir, "fixtures");
mkdirSync(join(fixtures, "elsewhere"), { recursive: true });

function fixture(name: string, body: string) {
  const file = join(fixtures, name);
  writeFileSync(file, body);
  return file;
}

const guardFixture = fixture("zzq-guard.mjs", [
  `import { isMainModule } from ${JSON.stringify(helper)};`,
  'if (isMainModule(import.meta.url)) console.log("ZZQ-GUARD RAN");',
  "",
].join("\n"));
fixture("zzq-caller.mjs", [
  'import "./zzq-guard.mjs";',
  'console.log("ZZQ-CALLER RAN");',
  "",
].join("\n"));
// A file with the guard's name that is NOT the guard: the shape the helper
// must refuse to guess about.
writeFileSync(join(fixtures, "elsewhere/zzq-liar.mjs"), "// another file wearing the name\n");
fixture("zzq-liar.mjs", [
  `import { isMainModule } from ${JSON.stringify(helper)};`,
  `import { pathToFileURL } from "node:url";`,
  `const other = pathToFileURL(${JSON.stringify(join(fixtures, "elsewhere/zzq-liar.mjs"))}).href;`,
  'if (isMainModule(other)) console.log("ZZQ-GUARD RAN");',
  "",
].join("\n"));
// The spelling this change replaces, kept as a fixture. It is the evidence
// that the helper is not decoration.
fixture("zzq-old-spelling.mjs", [
  'if (import.meta.url === `file://${process.argv[1]}`) console.log("ZZQ-GUARD RAN");',
  "",
].join("\n"));

const linkedFixtures = join(dir, "fixtures-through-a-symlink");
symlinkSync(fixtures, linkedFixtures);
symlinkSync(guardFixture, join(fixtures, "zzq-guard-under-another-name.mjs"));

function node(file: string) {
  const r = runToFile(process.execPath, [file], { cwd: dir, env: cleanEnv() });
  return { status: r.status, out: r.out, err: r.err };
}

describe("the check that decides whether a guard is the command", () => {
  it("runs through its own path", () => {
    const r = node(guardFixture);
    expect(r.status).toBe(0);
    expect(r.out).toContain("ZZQ-GUARD RAN");
  });

  it("runs through a symlinked directory", () => {
    const r = node(join(linkedFixtures, "zzq-guard.mjs"));
    expect(r.status).toBe(0);
    expect(r.out).toContain("ZZQ-GUARD RAN");
  });

  it("runs through a symlink that wears a different name", () => {
    const r = node(join(fixtures, "zzq-guard-under-another-name.mjs"));
    expect(r.status).toBe(0);
    expect(r.out).toContain("ZZQ-GUARD RAN");
  });

  it("stays quiet when another script imports it", () => {
    const r = node(join(fixtures, "zzq-caller.mjs"));
    expect(r.status).toBe(0);
    expect(r.out).toContain("ZZQ-CALLER RAN");
    expect(r.out).not.toContain("ZZQ-GUARD RAN");
    expect(r.err).toBe("");
  });

  it("refuses to guess: invoked under its own name and still not itself, it says so and exits 2", () => {
    const r = node(join(fixtures, "zzq-liar.mjs"));
    expect(r.out).not.toContain("ZZQ-GUARD RAN");
    expect(r.err).toContain("zzq-liar: not run (");
    expect(r.status).toBe(2);
  });

  it("is not decoration: the spelling it replaces is silent with exit 0 through a symlink", () => {
    const own = node(join(fixtures, "zzq-old-spelling.mjs"));
    expect(own.out).toContain("ZZQ-GUARD RAN");

    const through = node(join(linkedFixtures, "zzq-old-spelling.mjs"));
    expect(through.status).toBe(0);
    expect(`${through.out}${through.err}`).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The measure, not the repair: a guard added tomorrow must not bring any of the
// spellings back with it, and must not arrive without one. Four wrong forms are
// named -- the string comparison, the half-fix that resolves one side only, the
// question about what argv[1] ends with, and no question at all.
//
// `process.argv[1]` is refused outright rather than by spelling. Every wrong
// form so far has been a different operator on the same value, and the next one
// will be too; scripts/lib/main-module.mjs is the one place that reads it.
describe("no guard decides this for itself any more", () => {
  function mjsUnder(start: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(start, { withFileTypes: true })) {
      const p = join(start, e.name);
      if (e.isDirectory()) out.push(...mjsUnder(p));
      else if (e.name.endsWith(".mjs")) out.push(p);
    }
    return out;
  }

  // A .mjs under scripts/ci or scripts/quality is a command until it says
  // otherwise: CI, a driver or a hook runs each of them as `node <path>`. A file
  // that is genuinely only a library belongs here with the reason it is one, and
  // the case below holds that claim to two facts -- no shebang, and nothing in
  // the repository invoking it -- so the list cannot be used to excuse a guard
  // that went quiet. It is empty: every file under those two directories is a
  // command today.
  const PURE_LIBRARIES: Record<string, string> = {};

  function guardSources(): { rel: string; src: string }[] {
    const files = [...mjsUnder(join(repo, "scripts/ci")), ...mjsUnder(join(repo, "scripts/quality"))];
    // A floor: an empty listing agrees with everything.
    expect(files.length).toBeGreaterThan(10);
    return files.map((f) => ({ rel: relative(repo, f), src: readFileSync(f, "utf8") }));
  }

  // Prose about the defect is not the defect, and several of these files
  // explain it at length -- including the line each of them used to carry.
  function code(src: string): string {
    return src
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
  }

  it("scripts/ci and scripts/quality ask scripts/lib/main-module.mjs", () => {
    const offenders: string[] = [];
    for (const { rel, src } of guardSources()) {
      const body = code(src);
      if (/import\.meta\.url\s*===/.test(body)) offenders.push(`${rel}: compares import.meta.url as a string`);
      if (/===\s*fileURLToPath\(import\.meta\.url\)/.test(body)) offenders.push(`${rel}: compares one resolved side against one unresolved one`);
      if (/realpathSync\(process\.argv\[1\]\)/.test(body)) offenders.push(`${rel}: resolves argv[1] by hand`);
      if (/process\.argv\[1\][^\n]*\.endsWith\s*\(/.test(body)) offenders.push(`${rel}: asks what argv[1] ends with, which is a question about a name`);
      if (/process\.argv\[1\]/.test(body)) offenders.push(`${rel}: reads process.argv[1] itself`);
    }
    expect(offenders).toEqual([]);
  });

  // Whatever runs a script names it: the workflows, the suite's drivers and
  // steps, the hooks. A file excused as a library may appear in none of them.
  // Being imported by a sibling is what a library is for and is not counted.
  function whatRunsThings(): string[] {
    const out: string[] = [];
    for (const d of [".github/workflows", "scripts/quality/suite/drivers", "scripts/quality/suite/steps", ".githooks"]) {
      const at = join(repo, d);
      try {
        for (const e of readdirSync(at, { withFileTypes: true })) {
          if (e.isFile()) out.push(readFileSync(join(at, e.name), "utf8"));
        }
      } catch {
        // A directory this checkout does not have cannot name anything.
      }
    }
    return out;
  }

  it("and every one of them asks: none runs, or fails to run, by accident", () => {
    const callers = Object.keys(PURE_LIBRARIES).length ? whatRunsThings() : [];
    const offenders: string[] = [];
    for (const { rel, src } of guardSources()) {
      // An excused file has to earn it here, where the excuse is used: a claim
      // that something is only a library is checked against the two things that
      // would make it false.
      if (rel in PURE_LIBRARIES) {
        const reason = PURE_LIBRARIES[rel];
        if (reason.trim().length < 20) offenders.push(`${rel}: excused as a library without a reason`);
        if (src.startsWith("#!")) offenders.push(`${rel}: excused as a library and carries a shebang`);
        const run = callers.filter((c) => c.includes(rel));
        if (run.length) offenders.push(`${rel}: excused as a library and ${run.length} caller(s) run it`);
        continue;
      }
      const body = code(src);
      const imports = /from\s+["'][^"']*\/lib\/main-module\.mjs["']/.test(body);
      const asks = /isMainModule\(\s*import\.meta\.url\s*\)/.test(body);
      if (!imports || !asks) {
        offenders.push(`${rel}: nothing here decides whether it is the command, so it runs on import too`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
