// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A guard must not lose its own output on the way out.
//
// Every guard in scripts/ci and scripts/quality ended the same way:
//
//     if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
//
// and `main` had just written its verdict. That is safe to a terminal and to a
// file, and it is not safe to a pipe. Node writes to a pipe through libuv, and
// what libuv has queued but not yet handed to the kernel is gone the moment
// `process.exit()` runs. The consumer then sees a short listing, or no listing
// at all, with exit 0 -- which is byte for byte what a clean pass looks like.
//
// It has already happened twice here. The first nightly wrote an empty
// NIGHTLY.md (fixed in scripts/quality/nightly_summary.mjs, where the comment
// still stands), and `public-tree.mjs --list` writes some forty kilobytes that
// the snapshot publisher reads through a pipe.
//
// So these cases run each guard twice: once with stdout going straight to a
// file, and once with stdout going into a reader that takes eight bytes, sleeps
// while the pipe fills behind it, and only then drains the rest. Whatever the
// guard has to say on this machine, it must say all of it either way, and with
// the same exit code. Nothing is asserted about the content itself: the file
// run is the reference, so a case stays true on a checkout with other files in
// it.
//
// The proof that this is not vacuous is in THE IDIOM ITSELF, further down: two
// fixtures that differ in one line, one of which loses most of its output
// through the same reader. Restoring `process.exit(main(...))` in a real guard
// reproduces it -- with a payload over the pipe buffer, which is why the
// fixtures write two hundred kilobytes and the guards on this checkout, at
// forty, may still arrive whole on a platform with a roomier pipe.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";

const repo = realpathSync(resolve(__dirname, "../.."));
const dir = realpathSync(mkdtempSync(join(tmpdir(), "guards-flush-")));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A hook exports GIT_DIR, and a guard that inherits it reads a repository other
// than the one it was pointed at.
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  return { ...env, ...extra };
}

// ---------------------------------------------------------------------------
// THE SLOW READER
//
// Blocking reads on fd 0, no streams: it takes eight bytes, stops for most of a
// second, and only then drains what is left. A writer with more to say than the
// pipe holds is blocked for that whole second with output still in libuv's
// hands -- exactly the state `process.exit()` throws away.
const reader = join(dir, "slow-reader.mjs");
writeFileSync(reader, `
import { openSync, readSync, writeSync, closeSync } from "node:fs";

const out = openSync(process.env.SLOW_OUT, "w");
const buf = Buffer.alloc(1 << 16);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function take(n) {
  for (;;) {
    try { return readSync(0, buf, 0, n); }
    catch (e) {
      if (e.code === "EAGAIN") { sleep(5); continue; }
      if (e.code === "EOF") return 0;
      throw e;
    }
  }
}

const first = take(8);
if (first > 0) writeSync(out, buf, 0, first);
sleep(Number(process.env.SLOW_MS || 750));
for (;;) {
  const n = take(buf.length);
  if (n <= 0) break;
  writeSync(out, buf, 0, n);
}
closeSync(out);
`);

// The left-hand side of a pipeline is a subshell, so its status is written to a
// file rather than read from $? -- which would be the reader's.
const PIPED = 'exec 3>&1; { "$@" 2> "$SLOW_ERR"; echo $? > "$SLOW_STATUS"; } | "$SLOW_NODE" "$SLOW_READER"';
// The same, with the two streams swapped: stderr through the reader instead.
const PIPED_ERR = 'exec 3>&1; { "$@" 2>&1 1> "$SLOW_ERR"; echo $? > "$SLOW_STATUS"; } | "$SLOW_NODE" "$SLOW_READER"';

interface Ran { status: number; out: string; err: string }

function throughSlowReader(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; script?: string },
): Ran {
  const box = mkdtempSync(join(tmpdir(), "guards-flush-run-"));
  const out = join(box, "out");
  const err = join(box, "err");
  const status = join(box, "status");
  try {
    spawnSync("sh", ["-c", options.script ?? PIPED, "sh", command, ...args], {
      cwd: options.cwd,
      env: {
        ...(options.env ?? process.env),
        SLOW_OUT: out, SLOW_ERR: err, SLOW_STATUS: status,
        SLOW_NODE: process.execPath, SLOW_READER: reader,
      },
    });
    return {
      status: Number.parseInt(readFileSync(status, "utf8").trim(), 10),
      out: readFileSync(out, "utf8"),
      err: readFileSync(err, "utf8"),
    };
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fixtures the cases own, so that no case depends on what this machine happens
// to hold.
const terms = join(dir, "terms.txt");
writeFileSync(terms, "ZzqPartnerName\n");
const cleanMessage = join(dir, "message.txt");
writeFileSync(cleanMessage, "feat(protect): set an owner password\n");
const tagless = join(dir, "repo-without-tags");
mkdirSync(tagless);
execFileSync("git", ["init", "-q"], { cwd: tagless, env: cleanEnv() });
const empty = join(dir, "an-empty-directory");
mkdirSync(empty);
const missing = join(dir, "no-such-directory");

interface Guard {
  script: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

// Arguments chosen to reach a cheap, certain verdict without a network. The
// first two are the ones with something to lose: both write far more than a
// line.
const GUARDS: Guard[] = [
  { script: "scripts/ci/public-tree.mjs", args: ["--list"] },
  { script: "scripts/quality/no-silent-failures.mjs", args: ["--list"] },
  { script: "scripts/quality/i18n-parity.mjs", args: [] },
  { script: "scripts/quality/suite/golden_check.mjs", args: [repo] },
  {
    script: "scripts/ci/internal-terms.mjs",
    args: ["--message", cleanMessage],
    env: { CI: "", PDFLUENT_INTERNE_TERMEN: terms },
  },
  { script: "scripts/ci/tags-are-pushable.mjs", args: [], env: { PDFLUENT_REPO_DIR: tagless } },
  { script: "scripts/ci/repo-truth.mjs", args: ["--no-fetch", "--trunk", "zzq-no-such-ref"] },
  { script: "scripts/ci/no-hosted-ci-on-auto-triggers.mjs", args: [missing] },
  { script: "scripts/ci/offline-allowlist.mjs", args: ["--zzq"] },
  { script: "scripts/quality/declared-skips.mjs", args: [] },
  { script: "scripts/quality/baseline_commit_guard.mjs", args: [] },
  { script: "scripts/quality/require-report.mjs", args: [] },
  { script: "scripts/quality/suite/ui_walk.mjs", args: [] },
  { script: "scripts/quality/suite/updater_payload.mjs", args: [empty] },
];

describe("every guard says the same into a slow pipe as it does into a file", () => {
  for (const g of GUARDS) {
    it(`${g.script} loses nothing on the way out`, () => {
      const env = cleanEnv(g.env);
      const script = join(repo, g.script);
      const toFile = runToFile(process.execPath, [script, ...g.args], { cwd: repo, env });
      const toPipe = throughSlowReader(process.execPath, [script, ...g.args], { cwd: repo, env });

      // A guard that says nothing has judged nothing, and this case would then
      // be comparing two empty strings.
      expect(`${toFile.out}${toFile.err}`.trim(), `${g.script} said nothing at all`).not.toBe("");
      expect(toPipe.out, `${g.script} lost stdout into the pipe`).toBe(toFile.out);
      expect(toPipe.err, `${g.script} lost stderr into the pipe`).toBe(toFile.err);
      expect(toPipe.status, `${g.script} disagrees with itself about its verdict`).toBe(toFile.status);
    }, 120_000);
  }
});

// ---------------------------------------------------------------------------
// THE IDIOM ITSELF
//
// Two files that differ in one line, on a payload larger than any pipe buffer.
// This is what keeps the cases above from being decoration on a checkout whose
// guards happen to write less than the pipe holds.
const fixtures = join(dir, "fixtures");
mkdirSync(fixtures);
const PAYLOAD = 200_000;

function fixture(name: string, stream: "stdout" | "stderr", ending: string) {
  const file = join(fixtures, name);
  writeFileSync(file, [
    `const line = "z".repeat(79) + "\\n";`,
    `let text = ""; while (text.length < ${PAYLOAD}) text += line;`,
    `process.${stream}.write(text);`,
    ending,
    "",
  ].join("\n"));
  return file;
}

const hardExit = fixture("zzq-hard-exit.mjs", "stdout", "process.exit(0);");
const exitCode = fixture("zzq-exit-code.mjs", "stdout", "process.exitCode = 0;");
const hardExitErr = fixture("zzq-hard-exit-stderr.mjs", "stderr", "process.exit(0);");
const exitCodeErr = fixture("zzq-exit-code-stderr.mjs", "stderr", "process.exitCode = 0;");

describe("the ending this replaces really does drop output", () => {
  it("process.exit() after a write to stdout arrives short", () => {
    const whole = runToFile(process.execPath, [hardExit], { cwd: dir, env: cleanEnv() });
    expect(whole.out.length).toBeGreaterThanOrEqual(PAYLOAD);

    const piped = throughSlowReader(process.execPath, [hardExit], { cwd: dir, env: cleanEnv() });
    expect(piped.status).toBe(0);
    expect(piped.out.length, "a hard exit kept all of it, so this file proves nothing")
      .toBeLessThan(whole.out.length);
  }, 60_000);

  it("process.exitCode after the same write arrives whole", () => {
    const whole = runToFile(process.execPath, [exitCode], { cwd: dir, env: cleanEnv() });
    const piped = throughSlowReader(process.execPath, [exitCode], { cwd: dir, env: cleanEnv() });
    expect(piped.status).toBe(0);
    expect(piped.out).toBe(whole.out);
  }, 60_000);

  // Why the guards that only ever wrote to stderr moved too: the stream is a
  // different number, the defect is the same one.
  it("stderr is not the safe stream either", () => {
    const whole = runToFile(process.execPath, [hardExitErr], { cwd: dir, env: cleanEnv() });
    const lost = throughSlowReader(process.execPath, [hardExitErr], { cwd: dir, env: cleanEnv(), script: PIPED_ERR });
    expect(lost.out.length).toBeLessThan(whole.err.length);

    const kept = throughSlowReader(process.execPath, [exitCodeErr], { cwd: dir, env: cleanEnv(), script: PIPED_ERR });
    expect(kept.out).toBe(runToFile(process.execPath, [exitCodeErr], { cwd: dir, env: cleanEnv() }).err);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The measure, not the repair: a guard added tomorrow must not bring the
// ending back with it. `process.exitCode` and a return is the whole of the
// rule; a guard that genuinely cannot return has to make that case here first.
describe("no guard in scripts/ci or scripts/quality ends in a hard exit", () => {
  function mjsUnder(start: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(start, { withFileTypes: true })) {
      const p = join(start, e.name);
      if (e.isDirectory()) out.push(...mjsUnder(p));
      else if (e.name.endsWith(".mjs")) out.push(p);
    }
    return out;
  }

  it("they set process.exitCode and let node drain", () => {
    const files = [...mjsUnder(join(repo, "scripts/ci")), ...mjsUnder(join(repo, "scripts/quality"))];
    // A floor: an empty listing agrees with everything.
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        // Prose about the defect is not the defect, and several of these files
        // explain it at length.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (/process\.exit\s*\(/.test(line)) offenders.push(`${relative(repo, f)}:${i + 1}: ${trimmed}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
