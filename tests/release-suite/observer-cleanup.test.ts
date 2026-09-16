// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// No observer outlives the launch it watches (#554).
//
// S3 watches the real run: `lsof` samples its sockets and `nettop` watches it
// continuously under a pty. Both used to be plain background jobs stopped on
// the happy path only, so any run that did not reach the happy path left them
// behind. On 15-09 that filled a shared machine twice — 17 parentless `nettop`
// processes, then 34, at 30–50 % CPU each — and nothing left on the machine
// said which run had started them.
//
// These cases are about the processes, not about what the samples mean. They
// start real observers against a real long-lived process, end the run in each
// of the ways a release evening actually ends it, and then ask the operating
// system what is still running. A source assertion cannot answer that.
//
// What runs where: `nettop` exists only on macOS, so that source names itself
// SKIPPED on any other platform and the case asserts the wording. Everything
// else here — the pid file, the wrapper's trap, the binding, the orphan
// reading — is exercised on every platform, and the orphan reading needs no
// tool at all beyond the shell.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT, stageCase, suiteArgs } from "./helpers";
import { runToFile } from "../ci/run";

const SUITE_DIR = path.join(REPO_ROOT, "scripts", "quality", "suite");
const OBSERVERS = path.join(SUITE_DIR, "observers.sh");
const PTY = path.join(SUITE_DIR, "observer_pty.sh");

/** Two seconds is the whole promise: an interrupted run leaves nothing behind. */
const GRACE_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Running, and not a zombie.
 *
 * `kill -0` says yes to a zombie, and a child of a shell that never waits is
 * exactly that — so a reaper built on `kill -0` waits out its whole grace
 * period on a process that ended long ago, and a case built on it never sees a
 * process end at all.
 */
function alive(pid: number): boolean {
  const r = spawnSync("ps", ["-p", String(pid), "-o", "state="], { encoding: "utf8" });
  const s = (r.stdout ?? "").trim();
  return s !== "" && !s.startsWith("Z");
}

async function waitGone(pids: number[], ms = GRACE_MS): Promise<number[]> {
  const deadline = Date.now() + ms;
  let left = pids.filter(alive);
  while (left.length > 0 && Date.now() < deadline) {
    await sleep(50);
    left = left.filter(alive);
  }
  return left;
}

/** Every process whose command line still names this run's pids. */
function survivors(appPid: number): string[] {
  const r = spawnSync("ps", ["-axo", "pid=,args="], { encoding: "utf8" });
  return (r.stdout ?? "")
    .split("\n")
    .filter((l) => l.includes(String(appPid)))
    .filter((l) => /observer_pty\.sh|nettop|lsof/.test(l))
    .map((l) => l.trim());
}

function recorded(work: string): { pid: number; kind: string }[] {
  const f = path.join(work, "observers");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [pid, kind] = l.split("\t");
      return { pid: Number.parseInt(pid, 10), kind: kind ?? "" };
    })
    .filter((r) => Number.isFinite(r.pid));
}

const have = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;

// A run of the suite, boiled down to what #554 is about: a process that starts
// the observers against a launch and then stays alive the way the suite does
// while S2 holds the app open.
const HARNESS = `#!/usr/bin/env bash
set -u
SUITE_DIR="$1"; WORK="$2"; APP_PID="$3"; OWNER="$4"; MODE="$5"
export SUITE_DIR WORK
mkdir -p "\${WORK}/probes"
# The owner is the suite process an observer has to see alive. It is a separate
# process here for the same reason it is in the real run: the step that starts
# the observers is a subshell of it and ends four steps before it does.
[ "\${OWNER}" = "0" ] && OWNER=$$
SUITE_PID="\${OWNER}"
export SUITE_PID
. "\${SUITE_DIR}/observers.sh"
observer_traps_install
observer_sampler_start "\${APP_PID}" "\${WORK}/probes/net_observe.out"
observer_nettop_start "\${APP_PID}" "\${WORK}/probes/net_nettop.out"
observer_pty_start "\${WORK}/probes/pty.out" "\${APP_PID}" /bin/sleep 600
printf 'ready\\n' > "\${WORK}/ready"
[ "\${MODE}" = "exit" ] && exit 0
while :; do /bin/sleep 0.2; done
`;

interface Bench {
  work: string;
  app: ChildProcess;
  harness: ChildProcess;
  owner?: ChildProcess;
}

const benches: Bench[] = [];
const dirs: string[] = [];

afterEach(async () => {
  // Belt and braces, and it is also a check: if the code under test did its
  // job there is nothing here left to kill. Nothing in this file may leave a
  // watcher on the machine it ran on — that is the bug, not the fixture.
  for (const b of benches.splice(0)) {
    for (const { pid } of recorded(b.work)) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
    for (const p of [b.harness, b.app, b.owner]) { try { if (p?.pid) process.kill(p.pid, "SIGKILL"); } catch { /* gone */ } }
  }
  await sleep(50);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const idle = (name: string): ChildProcess =>
  spawn("bash", ["-c", "while :; do /bin/sleep 0.2; done", name], { stdio: "ignore" });

/**
 * A long-lived stand-in for the application, a suite process that owns the
 * run, and a step that starts the observers.
 *
 * `mode: "exit"` is the step ending while the suite carries on — S2 finishing
 * and S3 starting. The app is still up and so is the owner, so nothing an
 * observer polls has changed: only the step's own EXIT trap can stop them.
 */
async function bench({ mode = "hold" }: { mode?: "hold" | "exit" } = {}): Promise<Bench> {
  const work = mkdtempSync(path.join(tmpdir(), "pdfluent-observers-"));
  dirs.push(work);
  mkdirSync(path.join(work, "probes"), { recursive: true });

  const app = idle("pdfluent-observer-case-app");
  const owner = mode === "exit" ? idle("pdfluent-observer-case-suite") : undefined;
  const harnessFile = path.join(work, "harness.sh");
  writeFileSync(harnessFile, HARNESS, { mode: 0o755 });
  const harness = spawn(
    "bash",
    [harnessFile, SUITE_DIR, work, String(app.pid), String(owner ? owner.pid : "0"), mode],
    { stdio: "ignore" },
  );

  const b: Bench = { work, app, harness, owner };
  benches.push(b);

  const deadline = Date.now() + 10_000;
  while (!existsSync(path.join(work, "ready")) && Date.now() < deadline) await sleep(50);
  expect(existsSync(path.join(work, "ready")), "the harness never finished starting its observers").toBe(true);
  // The pty wrapper writes its own two pids, so give the chain a moment to
  // have written them all down before a case reads the file.
  await sleep(400);
  return b;
}

describe("an interrupted run leaves no observer behind", () => {
  it("survives nothing when the suite process is killed outright", async () => {
    // SIGKILL runs no trap anywhere — not in the suite, not in the wrapper.
    // What has to stop the observers here is the binding: each of them asks
    // whether the suite that wanted this watching is still there.
    const b = await bench();
    const pids = recorded(b.work);
    expect(pids.length, "no observer pid was written down").toBeGreaterThan(0);

    process.kill(b.harness.pid!, "SIGKILL");

    const left = await waitGone(pids.map((p) => p.pid));
    expect(left, `still running ${GRACE_MS} ms after the suite was killed: ${left.join(", ")}`).toEqual([]);
    expect(survivors(b.app.pid!), "a watcher of this launch is still on the machine").toEqual([]);
    // The launch itself is untouched: the observers stop, the thing they were
    // watching does not.
    expect(alive(b.app.pid!), "killing the suite must not kill the app it was watching").toBe(true);
  }, 30_000);

  it("follows the app down when the app exits on its own", async () => {
    // The other end of the binding, and the one that matters on a normal
    // evening: the app quits, and every watcher of it ends without anybody
    // having to remember to say so.
    const b = await bench();
    const pids = recorded(b.work);
    expect(pids.length).toBeGreaterThan(0);

    process.kill(b.app.pid!, "SIGKILL");

    const left = await waitGone(pids.map((p) => p.pid));
    expect(left, `still watching a launch that ended: ${left.join(", ")}`).toEqual([]);
    expect(alive(b.harness.pid!), "the suite itself must still be running").toBe(true);
  }, 30_000);

  it("reaps when the step that started them ends, with everything else still up", async () => {
    // The layer the other two cases cannot reach. The app is open and the
    // suite is running, so every binding an observer polls still says yes;
    // what has to end them here is the EXIT trap of the step that started
    // them. Without it a watcher started for S2 runs through S3, S4 and S5 —
    // which on a release evening is a `nettop` per launch, for minutes.
    const b = await bench({ mode: "exit" });
    const pids = recorded(b.work);
    expect(pids.length, "no observer pid was written down").toBeGreaterThan(0);
    // Generous, because the step ending is this case's setup and not its
    // claim. The claim is the 2 s below: the observers are gone once it has.
    // The gate runs this beside a full test suite on a shared machine, and a
    // tight bound on the setup turns load into a failure that reads like a
    // leak.
    expect(await waitGone([b.harness.pid!], 20_000), "the step never ended").toEqual([]);

    const left = await waitGone(pids.map((p) => p.pid));
    expect(left, `the step ended and these kept watching: ${left.join(", ")}`).toEqual([]);
    expect(alive(b.app.pid!), "the launch is still open").toBe(true);
    expect(alive(b.owner!.pid!), "the suite is still running").toBe(true);
  }, 30_000);

  it("writes down every pid it started, the ones inside the pty included", async () => {
    // The wrapper and what it wrapped are two processes the shell that spawned
    // `script` never learns the pid of. Before #554 nothing wrote them down,
    // which is why an orphan could not be traced to the run that made it.
    const b = await bench();
    const kinds = recorded(b.work).map((r) => r.kind);
    expect(kinds).toContain("pty");
    expect(kinds, "the pty wrapper did not record itself").toContain("wrapper");
    expect(kinds, "the process inside the pty was not written down").toContain("watcher");
  }, 30_000);
});

describe("the pty wrapper takes its watcher with it", () => {
  it("kills what it wrapped when it is asked to stop", async () => {
    // This is the trap on its own. The app is alive and so is the owner, so
    // the binding has nothing to say: only the TERM handler can end the
    // watcher here. Drop that trap and the wrapper dies while the watcher is
    // reparented to init and keeps running — which is the exact shape of the
    // 34 processes found on 15-09.
    const work = mkdtempSync(path.join(tmpdir(), "pdfluent-pty-"));
    dirs.push(work);
    const app = spawn("bash", ["-c", "while :; do /bin/sleep 0.2; done", "pdfluent-observer-case-app"], {
      stdio: "ignore",
    });
    const wrapper = spawn("bash", [PTY, String(app.pid), String(process.pid), "/bin/sleep", "600"], {
      stdio: "ignore",
      env: { ...process.env, OBSERVERS_FILE: path.join(work, "observers") },
    });
    benches.push({ work, app, harness: wrapper });

    const deadline = Date.now() + 10_000;
    while (recorded(work).length < 2 && Date.now() < deadline) await sleep(50);
    const watcher = recorded(work).find((r) => r.kind === "watcher");
    expect(watcher, "the wrapper never recorded the process it started").toBeDefined();
    expect(alive(watcher!.pid), "the watcher was not running to begin with").toBe(true);

    process.kill(wrapper.pid!, "SIGTERM");

    const left = await waitGone([watcher!.pid, wrapper.pid!]);
    expect(left, `the wrapper was stopped and this outlived it: ${left.join(", ")}`).toEqual([]);
    expect(alive(app.pid!), "the launch must be untouched").toBe(true);
  }, 30_000);
});

describe("the continuous source says which platform it ran on", () => {
  it(
    have("nettop")
      ? "starts nettop under a pty and leaves none of it running"
      : "names nettop skipped rather than leaving the gap unsaid",
    async () => {
      const b = await bench();
      const out = readFileSync(path.join(b.work, "probes", "net_nettop.out"), "utf8");
      if (!have("nettop")) {
        const reason = "nettop is not on this platform";
        process.stderr.write(`SKIPPED (not a pass): ${reason}, so this run watched with lsof alone\n`);
        expect(out, "a source that did not run must say so in the evidence").toContain("SKIPPED (not a pass)");
        expect(out).toContain(reason);
        return;
      }
      // A real nettop, started the way a release evening starts it, and gone
      // when the run that started it is gone.
      const before = survivors(b.app.pid!).filter((l) => l.includes("nettop"));
      expect(before.length, "nettop was not started against this launch").toBeGreaterThan(0);
      process.kill(b.harness.pid!, "SIGKILL");
      const left = await waitGone(recorded(b.work).map((p) => p.pid));
      expect(left).toEqual([]);
      expect(survivors(b.app.pid!).filter((l) => l.includes("nettop"))).toEqual([]);
    },
    30_000,
  );

  it("names lsof skipped when the machine has no lsof", async () => {
    // Host-independent by construction: the sampler is asked for its behaviour
    // with `lsof` taken off the path, so the case reads the same on a machine
    // that has it and on one that does not.
    const work = mkdtempSync(path.join(tmpdir(), "pdfluent-nolsof-"));
    dirs.push(work);
    const out = path.join(work, "sample.out");
    const r = spawnSync(
      "bash",
      ["-c", `PATH=/nonexistent; . "$1"; observer_sampler_start $$ "$2"`, "bash", OBSERVERS, out],
      { encoding: "utf8", env: { ...process.env, WORK: work } },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("SKIPPED (not a pass): lsof is not on this machine");
  });
});

describe("what an earlier run left behind is reported, not killed", () => {
  // The only case here that needs no process and no tool: a listing goes in,
  // lines come out. That is deliberate — the reading has to be checkable on a
  // machine where none of these watchers exists, which is every CI runner.
  const scan = (listing: string): string =>
    spawnSync("bash", ["-c", `. "$1"; observer_orphan_scan`, "bash", OBSERVERS], {
      input: listing,
      encoding: "utf8",
    }).stdout;

  const LISTING = [
    "  4711     1    03:41:12 /usr/bin/nettop",
    "  4712  4711    03:41:12 /usr/bin/nettop",
    "  4820     1       05:02 lsof",
    "  4900     1    01:00:00 /usr/bin/ssh",
    "  4901   882       00:04 /usr/bin/nettop",
  ].join("\n");

  it("names each parentless watcher by pid and age", () => {
    const out = scan(LISTING);
    expect(out).toContain("orphan observer: nettop pid 4711, age 03:41:12, parent 1");
    expect(out).toContain("orphan observer: lsof pid 4820, age 05:02, parent 1");
    expect(out, "the report must say it left them alone").toContain("reported, not killed");
  });

  it("leaves alone what is not a stray watcher", () => {
    const out = scan(LISTING);
    expect(out, "a watcher with a living parent belongs to a run in progress").not.toContain("4901");
    expect(out, "a nettop whose parent is another nettop is not parentless").not.toContain("4712");
    expect(out, "only the two watchers this suite starts are its business").not.toContain("4900");
  });

  it("says nothing but the count when the machine is clean", () => {
    expect(scan("  4900     1    01:00:00 /usr/bin/ssh\n").trim()).toBe("");
  });

  it("runs the sweep at the start of S3 and writes what it found", () => {
    // The sweep has to be in the run, not merely available to it. A suite that
    // could report orphans and does not is the same as one that cannot.
    const staged = stageCase("good");
    const r = runToFile("bash", suiteArgs(staged, ["--keep"]), { cwd: REPO_ROOT, env: process.env });
    expect(r.status, r.err.slice(-2000)).toBe(0);
    expect(r.err, "the sweep said nothing on stderr").toContain("orphan observer sweep:");
    expect(readFileSync(path.join(staged.work, "probes", "observer_orphans.out"), "utf8"))
      .toContain("orphan observer sweep:");
    rmSync(staged.dir, { recursive: true, force: true });
  }, 60_000);
});
