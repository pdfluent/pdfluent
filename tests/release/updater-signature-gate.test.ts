// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The gate that keeps a wrong signing key out of the updater feed.
//
// It runs as step 1 of stage-latest-json.sh, immediately before a feed is built
// from the same files, and it used to answer "verified" for a directory with
// nothing in it. Today the generator refuses a moment later, so that was a soft
// spot rather than a hole — but "nothing to verify" reported as success is the
// exact shape that let a green run mean nothing three times in this repository,
// and the next caller need not be so lucky.
//
// Mutation: turn the empty case back into exit 0, or accept any key id, and a
// case here goes red.
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");
const GATE = resolve(root, "scripts/verify-updater-sigs.sh");
const TRUSTED = "9E2BAD9AABF995DD";
// One of the local keys the runbook calls stale. If this ever verifies, the
// thing this gate exists to stop has happened.
const STALE = "4477C8918941A763";

const scratch = mkdtempSync(join(tmpdir(), "updater-sig-gate-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A Tauri .sig for a given key id: base64 of a minisign block whose payload
 * carries the id little-endian at bytes 2..10, which is where the gate reads it.
 */
function sigFor(displayId: string): string {
  const bytes = Buffer.alloc(74);
  bytes.write("Ed", 0, "ascii");
  Buffer.from(displayId, "hex").reverse().copy(bytes, 2);
  const blob = `untrusted comment: signature from minisign\n${bytes.toString("base64")}\ntrusted comment: t\n`;
  return Buffer.from(blob).toString("base64");
}

let n = 0;
function artefacts(sigs: Record<string, string> = {}): string {
  const dir = join(scratch, `case-${(n += 1)}`);
  mkdirSync(join(dir, "macos"), { recursive: true });
  for (const [name, id] of Object.entries(sigs)) writeFileSync(join(dir, "macos", name), sigFor(id));
  return dir;
}

const run = (dir: string) => {
  const r = spawnSync("bash", [GATE, dir], { cwd: root, encoding: "utf8" });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
};

describe("the updater signature gate", () => {
  it("accepts a payload signed with the trusted key", () => {
    const { status, output } = run(artefacts({ "PDFluent.app.tar.gz.sig": TRUSTED }));
    expect(output, output).toContain(`OK  all updater signatures match the trusted key ${TRUSTED}`);
    expect(status).toBe(0);
  });

  it("refuses a payload signed with a stale key, naming it", () => {
    const { status, output } = run(artefacts({ "PDFluent.app.tar.gz.sig": STALE }));
    expect(status).toBe(1);
    expect(output).toContain(STALE);
    expect(output).toContain("DO NOT upload");
  });

  it("refuses one wrong signature among right ones", () => {
    const { status, output } = run(artefacts({ "a.sig": TRUSTED, "b.sig": STALE }));
    expect(status).toBe(1);
    expect(output).toContain("BAD b.sig");
  });

  it("does not report an empty directory as verified", () => {
    // The case this file was written for. Exit 0 here reads as "the signatures
    // are trusted" about artefacts that do not exist.
    const { status, output } = run(artefacts());
    expect(status).not.toBe(0);
    expect(output).toContain("SKIPPED (not a pass)");
    expect(output).toContain("nothing was verified");
  });
});
