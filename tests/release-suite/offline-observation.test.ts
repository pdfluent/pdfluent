// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// How the offline promise is measured on the artefact a user installs (#543).
//
// It used to be measured by squeezing: start the built app under a sandbox
// profile that denies the network and see whether it still works. On a
// sandboxed bundle that measured the harness — launchd puts the app in its
// container, a second sandbox leaves it unable to reach it, and it died before
// its own code ran, identically with a profile that allowed everything. So the
// suite watches the real run instead: while S2 has the app open, its sockets are
// sampled with `lsof` and `nettop`.
//
// Everything below is the reading half. It runs on any host, which is the point
// of splitting probes from judgement: the sampler needs a Mac, deciding what a
// sample means does not, and a wrong reading is caught on every push rather
// than on a release evening.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JUDGES, normalizePeer, remoteEndpoints } from "../../scripts/quality/suite/judge.mjs";

// 5 s is what src/lib/updater.ts waits today; the cases pass it explicitly so
// they say what they are about rather than moving with the product.
const STARTUP_CHECK_MS = 5_000;

const judge = (out: string, rc = 0, meta: Record<string, unknown> = {}) =>
  JUDGES["offline:observe"].run(
    { out, rc, missing: false, work: "" },
    { allowed_remotes: [], startup_check_delay_ms: STARTUP_CHECK_MS, ...meta },
    {},
  );

// One sample of each source, in the shape the tools actually write it.
const LSOF_LOCAL = ["p4711", "f18", "n127.0.0.1:51204", "f21", "n127.0.0.1:51205->127.0.0.1:51204"].join("\n");
const LSOF_REMOTE = ["p4711", "f21", "n10.0.0.9:52377->93.184.216.34:443"].join("\n");
const NETTOP_LOCAL =
  "10:14:02.118392,tcp4 127.0.0.1:51204<->*:*,lo0,Listen,,,,,,,,,,-,cubic,-,-,-,-,so,";
const NETTOP_REMOTE =
  "10:14:03.118392,tcp4 10.0.0.9:52377<->93.184.216.34:443,en0,Established,512,340,0,0,0,18.00 ms,131072,131328,BE,-,cubic,-,-,-,-,so,";

/**
 * A sampler file in the shape the driver writes one: samples, then a line per
 * document saying how long that launch was watched, then the span of the whole
 * run. `docs` defaults to a single launch that outlived the startup check,
 * which is what S2 now arranges.
 */
const run = (
  body: string,
  samples = 2,
  ms = 61240,
  docs: [string, number][] = [["fixture-acroform-1p", 8612]],
) =>
  [...Array(samples).keys()].map((i) => `--- sample ${i + 1} ---`).join("\n") +
  `\n${body}\n` +
  docs.map(([doc, w]) => `--- document ${doc} window ${w} ms ---\n`).join("") +
  `--- window ${ms} ms ---\n`;

describe("remoteEndpoints", () => {
  it("takes the peer of an lsof connection and not the near side", () => {
    // The near side of an outbound connection is this machine's own address.
    // Reading it as a remote would be true and useless; reading a LISTEN row's
    // local address as one turns "the app listens" into "the app called
    // somebody", which is a different accusation entirely.
    expect(remoteEndpoints(LSOF_REMOTE)).toEqual(["93.184.216.34:443"]);
  });

  it("takes the peer of a nettop row", () => {
    expect(remoteEndpoints(NETTOP_REMOTE)).toEqual(["93.184.216.34:443"]);
  });

  it("sees nothing in loopback traffic, in either spelling", () => {
    expect(remoteEndpoints(LSOF_LOCAL)).toEqual([]);
    expect(remoteEndpoints(NETTOP_LOCAL)).toEqual([]);
    expect(remoteEndpoints("n[::1]:5000->[::1]:5001")).toEqual([]);
    expect(remoteEndpoints("tcp6 ::1.5000<->::1.5001,lo0,Established,")).toEqual([]);
  });

  it("sees nothing in a listening socket that has no peer yet", () => {
    expect(remoteEndpoints("tcp4 0.0.0.0:1420<->*:*,en0,Listen,")).toEqual([]);
    expect(remoteEndpoints("n10.0.0.9:1420")).toEqual([]);
  });

  it("does not read a sample marker or a timestamp as an address", () => {
    expect(remoteEndpoints("--- sample 7 ---")).toEqual([]);
    expect(remoteEndpoints("10:14:03.118392,pdfluent-desktop.4711,,,0,0,")).toEqual([]);
  });
});

describe("the offline:observe row", () => {
  it("passes a run whose samples held nothing but loopback", () => {
    const v = judge(run(`${LSOF_LOCAL}\n--- nettop ---\n${NETTOP_LOCAL}`));
    expect(v.status).toBe("PASS");
  });

  it("says how much it watched, so the claim can be weighed", () => {
    // The rule is "no outbound socket seen in N samples over M ms", not "the app
    // connects to nothing". Sampling is not watching: a connection opened and
    // closed between two samples — the shape of a startup update check — is one
    // this run cannot rule out, and the numbers are how a reader sees that.
    const v = judge(run(LSOF_LOCAL, 118, 61240));
    expect(v.numbers).toMatchObject({ samples: 118, window_ms: 61240, remotes: 0 });
  });

  it("counts the whole span, not the first launch of it", () => {
    // S2 opens every golden document in its own launch, so the sampler writes a
    // window line per launch, each the span since the first. Reading the first
    // one made a run that watched a minute claim five seconds.
    const v = judge(
      `--- sample 1 ---\n--- document a window 8612 ms ---\n--- window 5384 ms ---\n` +
        `--- sample 2 ---\n--- document b window 1180 ms ---\n--- window 61240 ms ---\n`,
    );
    expect(v.numbers).toMatchObject({ samples: 2, window_ms: 61240, remotes: 0 });
  });

  it("fails on a remote socket, and names it", () => {
    const v = judge(run(`${LSOF_LOCAL}\n${LSOF_REMOTE}`));
    expect(v.status).toBe("FAIL");
    expect(v.reason).toContain("93.184.216.34:443");
  });

  it("fails when only the second source saw it", () => {
    // The two samplers are not a vote. `lsof` costs tens of milliseconds a call
    // and misses whatever opens and closes between two of them; `nettop` runs
    // continuously to cover those gaps. A socket one of them saw is a socket.
    const v = judge(run(`${LSOF_LOCAL}\n--- nettop ---\n${NETTOP_REMOTE}`));
    expect(v.status).toBe("FAIL");
    expect(v.reason).toContain("93.184.216.34:443");
  });

  it("allows a remote the run was told to expect", () => {
    const v = judge(run(LSOF_REMOTE), 0, { allowed_remotes: ["93.184.216.34:443"] });
    expect(v.status).toBe("PASS");
  });

  it("skips, never passes, when the sampler wrote no sample", () => {
    // The dangerous shape: no socket seen because nothing looked reads exactly
    // like no socket to see. Three of this repository's regressions are that
    // sentence, so the row has to be a skip.
    const v = judge("");
    expect(v.status).toBe("SKIPPED");
    expect(v.reason).toContain("no sample");
  });

  it("repeats the sampler's own reason when it could not measure", () => {
    const v = judge("SKIPPED (not a pass): the application never showed a process id\n", 3);
    expect(v.status).toBe("SKIPPED");
    expect(v.reason).toBe("the application never showed a process id");
  });
});

describe("one peer, one spelling", () => {
  // The declared endpoint is resolved to bare addresses and the samplers write
  // them three different ways. Until the window was long enough to see the
  // startup update check nothing compared them, so nothing noticed.
  it("reads the same address out of every spelling the run can produce", () => {
    const want = "2606:4700:3034::ac43:b5cb:443";
    expect(normalizePeer("[2606:4700:3034::ac43:b5cb]:443"), "lsof").toBe(want);
    expect(normalizePeer("2606:4700:3034::ac43:b5cb.443"), "nettop").toBe(want);
    expect(normalizePeer("2606:4700:3034::AC43:B5CB:443"), "a resolver, upper case").toBe(want);
  });

  it("does the same for IPv4, in both separators", () => {
    expect(normalizePeer("104.21.18.116:443")).toBe("104.21.18.116:443");
    expect(normalizePeer("104.21.18.116.443")).toBe("104.21.18.116:443");
  });

  it("clears the declared endpoint however the sampler wrote it", () => {
    // The whole point: a run whose only outbound socket is the update check it
    // is documented to make must pass, and must say that it saw it.
    const v = judge(
      run("n10.0.0.9:52377->[2606:4700:3034::ac43:b5cb]:443", 43, 45174),
      0,
      { allowed_remotes: ["2606:4700:3034::ac43:b5cb:443"] },
    );
    expect(v.status).toBe("PASS");
    expect(v.numbers.remotes).toBe(0);
    expect(v.numbers.declared_remotes, "the check it did make is not on the row").toBe(1);
  });

  it("says when a peer could not be cleared because a host would not resolve", () => {
    const v = judge(run(LSOF_REMOTE), 0, { allowed_remotes_unresolved: ["pdfluent.com"] });
    expect(v.status).toBe("FAIL");
    expect(v.reason).toContain("pdfluent.com");
    expect(v.reason).toContain("could not be resolved");
  });
});

describe("the window the row covered", () => {
  it("reports what each document was watched for, by name", () => {
    // Per document, not only in total. Seventeen launches adding up to a minute
    // and seventeen launches of a second each are the same `window_ms`, and only
    // one of them can have reached the moment the check fires.
    const v = judge(run(LSOF_LOCAL, 43, 45174, [
      ["fixture-acroform-1p", 8612],
      ["fixture-sample-text-3p", 1180],
    ]));
    expect(v.status).toBe("PASS");
    expect(v.numbers.documents).toBe(2);
    expect(v.numbers.covered_ms).toBe(8612);
    expect(v.numbers.startup_check_ms).toBe(STARTUP_CHECK_MS);
    expect(String(v.numbers.windows_ms)).toBe("fixture-acroform-1p:8612,fixture-sample-text-3p:1180");
  });

  it("passes on the one launch that outlived the check, not on the average", () => {
    // Holding every document would cost two minutes a release evening for the
    // same fact measured seventeen times. One launch long enough is the claim;
    // the row has to accept exactly that and no less.
    const v = judge(run(LSOF_LOCAL, 43, 45174, [
      ["a", 1180],
      ["b", 7400],
      ["c", 1203],
    ]));
    expect(v.status).toBe("PASS");
    expect(v.numbers.covered_ms).toBe(7400);
  });

  it("refuses to pass a run whose every launch ended before the check fires", () => {
    // The #551 shape exactly: 43 samples over 45 s, none of the seventeen
    // launches longer than a second and a half, and a PASS reading as "the app
    // stayed quiet" about a window in which its own timer had not yet fired.
    const v = judge(run(LSOF_LOCAL, 43, 45174, [["a", 1180], ["b", 1520]]));
    expect(v.status).toBe("SKIPPED");
    expect(v.reason).toContain("1520");
    expect(v.reason).toContain(String(STARTUP_CHECK_MS));
    // The numbers stay on the row: a skip that drops them tells a reader
    // nothing about how far short it fell.
    expect(v.numbers.covered_ms).toBe(1520);
    expect(v.numbers.startup_check_ms).toBe(STARTUP_CHECK_MS);
  });

  it("refuses to pass a run that recorded no per-document window at all", () => {
    // An older driver, or one whose sampler stopped writing the line. No window
    // recorded is not a window that was long enough.
    const v = judge(`--- sample 1 ---\n${LSOF_LOCAL}\n--- window 45174 ms ---\n`);
    expect(v.status).toBe("SKIPPED");
    expect(v.numbers.documents).toBe(0);
  });

  it("refuses to judge coverage the run never recorded a bar for", () => {
    // meta carries the product's own delay. Without it the row cannot say
    // whether the window covered anything, and guessing a bar would be the
    // second copy of the constant this was arranged to avoid.
    const v = judge(run(LSOF_LOCAL), 0, { startup_check_delay_ms: undefined });
    expect(v.status).toBe("SKIPPED");
    expect(v.reason).toMatch(/startup update check/i);
  });

  it("still fails a socket it saw, however short the window was", () => {
    // A finding outranks a gap. "We did not watch long enough" must never
    // become a reason to stop reporting what was seen inside the window.
    const v = judge(run(LSOF_REMOTE, 2, 45174, [["a", 900]]));
    expect(v.status).toBe("FAIL");
    expect(v.reason).toContain("93.184.216.34:443");
  });
});

describe("who the run is allowed to see the app call", () => {
  // meta.json is where the row learns which peer is the product doing what it
  // says it does. It is written once, before the launch, because resolving a
  // name during the run would put a lookup inside the window being measured.
  const REPO_ROOT = process.cwd();
  let cached: Record<string, unknown> | null = null;
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function meta(): Record<string, unknown> {
    if (cached) return cached;
    const w = mkdtempSync(path.join(tmpdir(), "pdfluent-meta-"));
    dirs.push(w);
    const artefact = path.join(w, "artefact.bin");
    writeFileSync(artefact, "x");
    execFileSync("node", [
      path.join(REPO_ROOT, "scripts/quality/suite/write_meta.mjs"),
      "--work", w, "--repo", REPO_ROOT, "--artefact", artefact,
      "--platform", "fake", "--machine", "test-fake", "--os", "fake", "--load1", "0",
    ], { cwd: REPO_ROOT, encoding: "utf8" });
    cached = JSON.parse(readFileSync(path.join(w, "meta.json"), "utf8"));
    return cached!;
  }

  it("takes the host from the updater endpoint the app actually dials", () => {
    // Not a host name written down here. The app dials what tauri.conf.json
    // says, and a second copy of that name is a copy that drifts.
    const conf = JSON.parse(readFileSync(path.join(REPO_ROOT, "src-tauri/tauri.conf.json"), "utf8")) as {
      plugins: { updater: { endpoints: string[] } };
    };
    const want = [...new Set(conf.plugins.updater.endpoints.map((e) => new URL(e).hostname))];
    expect(want.length, "the app declares no updater endpoint to allow").toBeGreaterThan(0);
    expect(meta().allowed_remotes_hosts).toEqual(want);
  });

  it("records addresses with a port, and says so when it could not resolve one", () => {
    // Host-independent on purpose: a runner with a resolver produces addresses,
    // one without produces the unresolved host. What must never happen is an
    // empty list and nothing said — that is the shape where the declared call
    // reads as an intruder and no reader can tell why.
    const m = meta();
    const remotes = m.allowed_remotes as string[];
    const blind = m.allowed_remotes_unresolved as string[];
    for (const r of remotes) expect(r, `${r} is not an address and a port`).toMatch(/:\d+$/);
    expect(remotes.length + blind.length).toBeGreaterThan(0);
  });

  it("records the delay S2 has to outlive and the hold it takes", () => {
    const m = meta();
    expect(m.startup_check_delay_ms).toBeGreaterThan(0);
    expect(m.s2_hold_ms as number).toBeGreaterThan(m.startup_check_delay_ms as number);
  });
});

describe("the sandbox route is gone, not merely unused", () => {
  it("has no judge left that could resurrect it", () => {
    // It measured the harness and reported a product failure. A rule kept "just
    // in case" is a rule the next driver wires back up.
    expect(Object.keys(JUDGES)).not.toContain("offline:denied");
  });
});
