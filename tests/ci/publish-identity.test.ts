// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The publisher must refuse to build a snapshot it signs with a personal
// address.
//
// The public repository already has this rule — `commits_use_the_noreply_alias.py`,
// which is public-only and runs in its own CI. It runs THERE, AFTER the push, so
// the address is published before anything objects and taking it back is a
// force-push on a public repository. The snapshot's identity is whatever the
// machine that builds it happens to be configured with, and nothing about that
// machine is checked anywhere else.
//
// Both cases run the publisher against a public ref that does not exist, so it
// cannot get past the identity check to anything that needs the network. That is
// also what makes the second case worth having: a check that refuses everything
// would look identical to a working one if only the first case existed.
//
// Mutation to check this is not vacuous: delete the identityFault call from
// scripts/ci/publish-public-snapshot.mjs — the first case goes red, because the
// run then fails on the missing ref instead and never names the address.
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runToFile } from "./run";

const root = resolve(__dirname, "../..");
const MISSING_REF = "refs/remotes/pdfluent-public-absent/main";

function publishAs(email: string) {
  return runToFile(
    process.execPath,
    [resolve(root, "scripts/ci/publish-public-snapshot.mjs"), "--no-fetch"],
    {
      cwd: root,
      env: {
        ...process.env,
        PDFLUENT_PUBLIC_REF: MISSING_REF,
        GIT_AUTHOR_NAME: "Publisher Under Test",
        GIT_COMMITTER_NAME: "Publisher Under Test",
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_EMAIL: email,
      },
    },
  );
}

describe("a snapshot is not signed with a personal address", () => {
  it("refuses to build one when git would sign it with a personal address", () => {
    const r = publishAs("someone@example.com");
    expect(r.status).not.toBe(0);
    expect(r.err).toContain("someone@example.com");
    expect(r.err).toContain("noreply");
    // And it stops there: nothing was fetched, listed or written.
    expect(r.out).not.toContain("snapshot commit");
  });

  it("lets a noreply alias through to the work behind it", () => {
    // Fails, but on the absent public ref — which is proof the identity check
    // passed rather than that it refuses whatever it is given.
    const r = publishAs("10383561+jasperdew@users.noreply.github.com");
    expect(r.status).not.toBe(0);
    expect(r.err).not.toContain("noreply github alias");
    expect(r.err + r.out).toContain(MISSING_REF);
  });
});
