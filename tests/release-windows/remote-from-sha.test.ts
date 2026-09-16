// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What the Windows release orchestrator sends to the build host.
//
// The 2026-09-10 rehearsal found three things about this script, and none of
// them needed a Windows machine to find: it read `.env` from next to itself, so
// a cut from a worktree stopped on its first line; it ran `git pull` on the box
// and built whatever the trunk there was, which was beta.21 while 1.0.0 was the
// version under test; and it started a twenty-minute build before noticing the
// box could not read the pinned engine at all.
//
// So these cases stub `ssh` and `scp` on PATH and read back the commands the
// script would have sent. No build host is contacted, and none is needed: every
// claim here is about what this script decides, which is the half that was
// wrong.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync, existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runToFile } from "../ci/run";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = path.join(ROOT, "..", "scripts", "release-windows-remote.sh");

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";
const OTHER_SHA = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";
/** Distinct enough that a test never removes a real fetched installer. */
const MSI_WIN = "C:\\build\\bundle\\msi\\PDFluent_0.0.0-stub_x64_en-US.msi";
const LOCAL_MSI = "/tmp/PDFluent_0.0.0-stub_x64_en-US.msi";

const STUB_SSH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
all="$*"
case "$all" in
  *credential.helper*)
    echo "file:C:/ProgramData/Git/config  credential.helper=manager"
    echo "file:C:/Users/build/.gitconfig  credential.helper=store"
    exit 0 ;;
  *ls-remote*)
    echo "ENGINE_URL=https://example.invalid/engine"
    echo "ENGINE_REV=\${STUB_ENGINE_REV}"
    if [ "\${STUB_ENGINE_RC:-0}" != "0" ]; then
      echo "remote: read access to repository not granted"
      echo "ENGINE_UNREADABLE"
      exit "\${STUB_ENGINE_RC}"
    fi
    exit 0 ;;
  *Get-PSDrive*)
    echo "\${STUB_FREE_GB:-99}"; exit 0 ;;
  *release-windows.ps1*)
    echo "MSI_PATH=\${STUB_MSI_WIN}"; exit 0 ;;
  *"git fetch"*)
    if [ -n "\${STUB_WINCREDMAN:-}" ]; then
      echo "fatal: Unable to persist credentials with the 'wincredman' credential store."
      echo "fatal: Unable to persist credentials with the 'wincredman' credential store."
    fi
    case "\${STUB_CHECKOUT:-ok}" in
      not_on_origin) echo "SHA_NOT_ON_ORIGIN"; exit 13 ;;
      unknown)       echo "SHA_UNKNOWN"; exit 12 ;;
      dirty)         echo "CHECKOUT_FAILED"; exit 14 ;;
      *)             echo "HEAD is now at \${STUB_HEAD_SHA}"
                     echo "BUILD_SHA=\${STUB_HEAD_SHA}"
                     echo "BUILD_VERSION=\${STUB_VERSION}"
                     exit 0 ;;
    esac ;;
esac
exit 0
`;

const STUB_SCP = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
for dest; do :; done
if [ -d "$dest" ]; then dest="$dest/stub.sig"; fi
printf 'stub-installer-bytes' > "$dest"
exit 0
`;

let bin: string;

function writeStub(name: string, body: string): void {
  const p = path.join(bin, name);
  writeFileSync(p, body, "utf8");
  chmodSync(p, 0o755);
}

beforeAll(() => {
  bin = mkdtempSync(path.join(tmpdir(), "pdfluent-winremote-bin-"));
  writeStub("ssh", STUB_SSH);
  writeStub("scp", STUB_SCP);
});

afterAll(() => {
  rmSync(bin, { recursive: true, force: true });
  rmSync(LOCAL_MSI, { force: true });
});

interface Run { status: number; out: string; err: string; sent: string[] }

/** The script, with ssh/scp stubbed. `cwd`/`script` differ only for the
 *  worktree cases, which need a checkout of their own. */
function run(args: string[], env: Record<string, string> = {}, script = SCRIPT): Run {
  const log = path.join(mkdtempSync(path.join(tmpdir(), "pdfluent-winremote-log-")), "sent");
  writeFileSync(log, "", "utf8");
  const clean: Record<string, string> = {};
  // GIT_DIR and friends leak in from whatever ran this suite and would point
  // the script's `rev-parse` at the wrong repository.
  const drop = new Set(["WIN_BUILD_HOST", "WIN_EDITOR_PATH", "PDFLUENT_ENV"]);
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("GIT_") || drop.has(k) || v === undefined) continue;
    clean[k] = v;
  }
  const r = runToFile("bash", [script, ...args], {
    cwd: path.dirname(script),
    env: {
      ...clean,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      STUB_LOG: log,
      STUB_HEAD_SHA: SHA,
      STUB_VERSION: "1.0.0",
      STUB_ENGINE_REV: "5b2e506bbe957a9db8f21f43978c400621f8f1bf",
      STUB_MSI_WIN: MSI_WIN,
      WINREMOTE_LOG: path.join(path.dirname(log), "build.log"),
      ...env,
    },
  });
  return { ...r, sent: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

const HOST_ENV = { WIN_BUILD_HOST: "stub-target", WIN_EDITOR_PATH: "C:\\editor" };

describe("the commit to build", () => {
  it("is required, and nothing is sent to the build host without it", () => {
    const r = run([], HOST_ENV);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toContain("no commit given");
    expect(r.sent, "the build host was contacted before the script knew what to build").toEqual([]);
  });

  it("is refused when it is an abbreviation", () => {
    const r = run(["a1b2c3d"], HOST_ENV);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("not a full commit sha");
    expect(r.sent).toEqual([]);
  });

  it("is checked out detached on the box, exactly as given", () => {
    const r = run(["--sha", SHA], HOST_ENV);
    expect(r.status, r.out + r.err).toBe(0);
    const checkout = r.sent.find((c) => c.includes("git fetch"));
    expect(checkout, "no fetch/checkout command was sent").toBeDefined();
    expect(checkout).toContain("git fetch --prune --tags origin");
    expect(checkout).toContain(`git checkout --detach ${SHA}`);
  });

  it("is what the script says it is building, with the version that commit carries", () => {
    const r = run(["--sha", SHA], HOST_ENV);
    expect(r.out).toContain(SHA);
    expect(r.out, "the package.json version of the commit being built is not printed").toMatch(/package\.json:\s+1\.0\.0/);
  });

  // The rehearsal's actual failure: the box was on the trunk and said so only
  // in a cargo line halfway down a build log.
  it("refuses when the box reports a different HEAD than the one asked for", () => {
    const r = run(["--sha", SHA], { ...HOST_ENV, STUB_HEAD_SHA: OTHER_SHA });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("Refusing to build a commit nobody asked for");
    expect(r.sent.some((c) => c.includes("release-windows.ps1")), "it built anyway").toBe(false);
  });

  it("refuses before any build when the commit is not on origin", () => {
    const r = run(["--sha", SHA], { ...HOST_ENV, STUB_CHECKOUT: "not_on_origin" });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("not reachable from origin");
    expect(r.sent.some((c) => c.includes("release-windows.ps1")), "it built anyway").toBe(false);
  });

  it("is never pushed by this script", () => {
    // A push here would turn an orchestrator into a publisher, and "the box
    // could not see it" would stop being a real answer.
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/git\s+push/);
  });
});

describe("the pinned engine", () => {
  it("is proved readable from the box before the build starts", () => {
    const r = run(["--sha", SHA], HOST_ENV);
    expect(r.status, r.out).toBe(0);
    const engine = r.sent.find((c) => c.includes("ls-remote"));
    expect(engine, "the engine pin was never checked").toBeDefined();
    expect(engine).toContain("Cargo.toml");
    const order = r.sent.findIndex((c) => c.includes("ls-remote"));
    const build = r.sent.findIndex((c) => c.includes("release-windows.ps1"));
    expect(order).toBeLessThan(build);
  });

  it("turns an unreadable engine into one line instead of a build log", () => {
    const r = run(["--sha", SHA], { ...HOST_ENV, STUB_ENGINE_RC: "22" });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("cannot read the pinned engine repository");
    expect(r.sent.some((c) => c.includes("release-windows.ps1")), "it built against an engine it cannot fetch").toBe(false);
  });
});

describe("the wincredman line the box prints", () => {
  it("does not fail the run, and is answered with the config that causes it", () => {
    const r = run(["--sha", SHA], { ...HOST_ENV, STUB_WINCREDMAN: "1" });
    expect(r.status, r.out).toBe(0);
    expect(r.sent.some((c) => c.includes("credential.helper")),
      "the script reported the noise without looking at what configures it").toBe(true);
    expect(r.out).toContain("credential.helper=manager");
  });

  it("is not asked about when the box did not print it", () => {
    const r = run(["--sha", SHA], HOST_ENV);
    expect(r.sent.some((c) => c.includes("credential.helper"))).toBe(false);
  });
});

describe("the host configuration", () => {
  let main: string;
  let wt: string;

  beforeAll(() => {
    // A real main checkout with a real linked worktree: `.env` exists in one and
    // not the other, which is the whole of the bug.
    const dir = mkdtempSync(path.join(tmpdir(), "pdfluent-winremote-repo-"));
    main = path.join(dir, "main");
    wt = path.join(dir, "wt");
    mkdirSync(path.join(main, "scripts"), { recursive: true });
    copyFileSync(SCRIPT, path.join(main, "scripts", "release-windows-remote.sh"));
    const git = (...a: string[]) =>
      execFileSync("git", ["-C", main, "-c", "user.email=t@example.invalid", "-c", "user.name=t", ...a], {
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))) as NodeJS.ProcessEnv,
      });
    execFileSync("git", ["init", "-q", "-b", "main", main]);
    git("add", "-A");
    git("commit", "-q", "-m", "stub");
    git("worktree", "add", "-q", "-b", "wt", wt);
    writeFileSync(path.join(main, ".env"), "WIN_BUILD_HOST=host-from-main-env\nWIN_EDITOR_PATH=C:\\editor\n", "utf8");
  });

  const inWorktree = (env: Record<string, string> = {}) =>
    run(["--sha", SHA], { STUB_CHECKOUT: "not_on_origin", ...env },
      path.join(wt, "scripts", "release-windows-remote.sh"));

  it("is found in the main checkout when the release runs from a worktree", () => {
    expect(existsSync(path.join(wt, ".env")), "the fixture worktree has its own .env, so it proves nothing").toBe(false);
    const r = inWorktree();
    expect(r.sent[0], "no ssh was sent, so the script never resolved a host").toBeDefined();
    expect(r.sent[0]).toContain("host-from-main-env");
    expect(r.out).toContain(path.join(main, ".env"));
  });

  it("comes from PDFLUENT_ENV when that is set", () => {
    const other = path.join(mkdtempSync(path.join(tmpdir(), "pdfluent-winremote-env-")), ".env");
    writeFileSync(other, "WIN_BUILD_HOST=host-from-explicit-env\nWIN_EDITOR_PATH=C:\\editor\n", "utf8");
    const r = inWorktree({ PDFLUENT_ENV: other });
    expect(r.sent[0]).toContain("host-from-explicit-env");
  });

  it("names every path it tried when there is none", () => {
    const bare = mkdtempSync(path.join(tmpdir(), "pdfluent-winremote-bare-"));
    mkdirSync(path.join(bare, "scripts"), { recursive: true });
    copyFileSync(SCRIPT, path.join(bare, "scripts", "release-windows-remote.sh"));
    const r = run(["--sha", SHA], {}, path.join(bare, "scripts", "release-windows-remote.sh"));
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("no build-host configuration");
    expect(r.out, "the error does not say which path was looked at").toContain(path.join(bare, ".env"));
    expect(r.sent).toEqual([]);
  });
});
