// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Where a public-only file is edited.
//
// SOURCES.md and the public repository's own guards exist only on that side, so
// the snapshot carried them over untouched — and there was no way to change one
// except a commit made directly on the public repository. That is how a public
// head came to carry no `Published-from:` trailer on 2026-09-09, leaving nothing
// able to say which trunk commit the public side held.
//
// Mutation: ignore the overlay, or let it carry a path the manifest does not
// call public-only, and a case here goes red.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs scripts with no type declarations
import { applyOverlay, OVERLAY_DIR } from "../../scripts/ci/publish-public-snapshot.mjs";
// @ts-expect-error — same
import { loadManifest, isPublicOnly } from "../../scripts/ci/public-tree.mjs";

const root = resolve(__dirname, "../..");
const manifest = loadManifest();
const scratch = mkdtempSync(join(tmpdir(), "overlay-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function overlayDir(files: Record<string, string>): string {
  const dir = join(scratch, `o${(n += 1)}`);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}
const read = (sha: string) => execFileSync("git", ["cat-file", "-p", sha], { cwd: root, encoding: "utf8" });

describe("public-only files are edited here, not there", () => {
  it("replaces what the public head carried", () => {
    const kept = new Map([["SOURCES.md", ["100644", "0".repeat(40)]]]);
    const err = applyOverlay(kept, manifest, { dir: overlayDir({ "SOURCES.md": "the new list\n" }) });
    expect(err).toBeNull();
    expect(read(kept.get("SOURCES.md")![1])).toBe("the new list\n");
  });

  it("adds one the public head did not have", () => {
    const kept = new Map<string, [string, string]>();
    const err = applyOverlay(kept, manifest, { dir: overlayDir({ "SOURCES.md": "a first list\n" }) });
    expect(err).toBeNull();
    expect(kept.has("SOURCES.md")).toBe(true);
  });

  it("refuses a path the manifest does not call public-only", () => {
    // Without this the directory is a second way to publish anything, which is
    // the one thing the manifest exists to prevent.
    const kept = new Map<string, [string, string]>();
    const err = applyOverlay(kept, manifest, { dir: overlayDir({ "src/secret-plan.md": "x\n" }) }) as string;
    expect(err).toContain("does not call public-only");
    expect(err).toContain("src/secret-plan.md");
    expect(kept.size).toBe(0);
  });

  it("leaves the public head alone when there is no overlay", () => {
    const kept = new Map([["SOURCES.md", ["100644", "abc"]]]);
    expect(applyOverlay(kept, manifest, { dir: join(scratch, "does-not-exist") })).toBeNull();
    expect(kept.get("SOURCES.md")![1]).toBe("abc");
  });

  it("carries the row the public sources guard was missing", () => {
    // The reason the overlay was built. The guard names the file; this is where
    // the answer now lives, on the trunk, in reach of review.
    const sources = readFileSync(resolve(root, OVERLAY_DIR, "SOURCES.md"), "utf8");
    expect(sources).toContain("xl_31_dynamic_multipage_overflow.pdf");
    expect(isPublicOnly("SOURCES.md", manifest)).toBe(true);
  });

  it("keeps the overlay directory out of the published tree", () => {
    // Otherwise every overlaid file appears twice: once where it belongs and
    // once under docs/public-only/.
    const internal = (manifest.internal as { path: string }[]).map((e) => e.path);
    expect(internal).toContain(OVERLAY_DIR);
  });
});
