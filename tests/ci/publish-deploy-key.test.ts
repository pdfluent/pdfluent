// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// `main` of the public repository accepts writes from one deploy key only
// (ruleset `main-only-via-publish-path`, pdfluent-internal#753). If the publisher
// pushed with the caller's own credentials, the ruleset would refuse every
// publication; if it pushed without IdentitiesOnly, ssh could offer another key.
// These cases pin the push to the deploy key with a stub in place of git.
//
// Mutation to check this is not vacuous: drop `-o IdentitiesOnly=yes` from
// deploySshCommand, or drop the GIT_SSH_COMMAND entry from pushSnapshot's env;
// the matching case goes red.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module
import * as publish from "../../scripts/ci/publish-public-snapshot.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function stub(status = 0) {
  const calls: { cmd: string; args: string[]; opts: { env: Record<string, string> } }[] = [];
  const run = (cmd: string, args: string[], opts: { env: Record<string, string> }) => {
    calls.push({ cmd, args, opts });
    return { status };
  };
  return { calls, run };
}

describe("publish pushes through the deploy key", () => {
  it("uses the default key path when the variable is unset", () => {
    expect(publish.deployKeyPath({})).toBe(publish.DEPLOY_KEY_DEFAULT);
    expect(publish.DEPLOY_KEY_DEFAULT.replaceAll("\\", "/").endsWith(".config/pdfluent/pdfluent-public-deploy-key")).toBe(true);
  });

  it("reads the key path from PDFLUENT_PUBLIC_DEPLOY_KEY", () => {
    expect(publish.deployKeyPath({ PDFLUENT_PUBLIC_DEPLOY_KEY: "/k/x" })).toBe("/k/x");
  });

  it("pushes the commit to main over ssh with the key and IdentitiesOnly", () => {
    const { calls, run } = stub();
    const env = { PDFLUENT_PUBLIC_DEPLOY_KEY: "/k/x", PATH: "/usr/bin" };
    const r = publish.pushSnapshot(COMMIT, { env, run, exists: () => true });
    expect(r.status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("git");
    expect(calls[0].args).toEqual(["push", "git@github.com:pdfluent/pdfluent.git", `${COMMIT}:refs/heads/main`]);
    expect(calls[0].opts.env.GIT_SSH_COMMAND).toBe("ssh -i /k/x -o IdentitiesOnly=yes");
  });

  it("never forces the push", () => {
    const { calls, run } = stub();
    publish.pushSnapshot(COMMIT, { env: {}, run, exists: () => true });
    expect(calls[0].args.filter((a) => a.startsWith("-") || a.includes("+"))).toEqual([]);
  });

  it("refuses without pushing when the key file is missing", () => {
    const { calls, run } = stub();
    const r = publish.pushSnapshot(COMMIT, { env: { PDFLUENT_PUBLIC_DEPLOY_KEY: "/k/none" }, run, exists: () => false });
    expect(r.status).toBe(1);
    expect(r.fault).toContain("/k/none");
    expect(calls).toHaveLength(0);
  });

  it("passes git's failure on", () => {
    const { run } = stub(1);
    expect(publish.pushSnapshot(COMMIT, { env: {}, run, exists: () => true }).status).toBe(1);
  });

  it("does not push unless asked", () => {
    const src = readFileSync(resolve(__dirname, "../../scripts/ci/publish-public-snapshot.mjs"), "utf8");
    const guard = src.indexOf('argv.includes("--push")');
    const call = src.indexOf("pushSnapshot(commit)");
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
});
