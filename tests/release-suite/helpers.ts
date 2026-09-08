// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Staging for the release-suite cases.
//
// Every case is `good/` with a few probe files replaced, so a fixture says
// exactly what it changes and nothing else. The artefact is written here rather
// than committed: 64 KiB of deterministic bytes is a file to hash, and the
// point of the case is that the suite hashes the file it was given.

import { cpSync, mkdtempSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkTargets } from "../../scripts/quality/suite/ui_walk.mjs";

export const REPO_ROOT = process.cwd();
export const SUITE = path.join(REPO_ROOT, "scripts", "quality", "release_suite.sh");
const FIXTURES = path.join(REPO_ROOT, "tests", "fixtures", "release-suite");

/** 64 KiB that is the same on every machine, so its sha256 is a fixed fact. */
export function artefactBytes(): Buffer {
  const b = Buffer.alloc(64 * 1024);
  for (let i = 0; i < b.length; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
}

export interface Staged {
  dir: string;
  artefact: string;
  reports: string;
  work: string;
  sha256: string;
}

/**
 * @param overlay extra probe files written after the fixture is copied — the
 *        place a case tampers with what a probe claims.
 */
export function stageCase(name: string, overlay: Record<string, string> = {}): Staged {
  const dir = mkdtempSync(path.join(tmpdir(), "pdfluent-suite-case-"));
  cpSync(path.join(FIXTURES, "good", "probes"), path.join(dir, "probes"), { recursive: true });
  const caseProbes = path.join(FIXTURES, name, "probes");
  if (name !== "good") {
    if (!existsSync(caseProbes)) throw new Error(`no fixture named ${name}`);
    cpSync(caseProbes, path.join(dir, "probes"), { recursive: true, force: true });
  }
  writeFullWalk(path.join(dir, "probes"));
  // The probes record what the app said about itself, and what it says includes
  // its version. Writing that version into the fixtures put a copy of
  // package.json in seven files, so bumping to 1.0.0 turned the `good` case red
  // on the S1 version check: a fixture problem wearing the costume of a real
  // one, and the second bump that would have done it. `__VERSION__` is
  // substituted here instead, so a bump moves the fixtures with it.
  // `version-drift` carries a literal older version on purpose -- a mismatch is
  // the whole of what that case is.
  const version = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version as string;
  for (const file of readdirSync(path.join(dir, "probes"))) {
    const p = path.join(dir, "probes", file);
    if (!statSync(p).isFile()) continue;
    const body = readFileSync(p, "utf8");
    if (body.includes("__VERSION__")) writeFileSync(p, body.split("__VERSION__").join(version), "utf8");
  }
  for (const [file, body] of Object.entries(overlay)) {
    writeFileSync(path.join(dir, "probes", file), body, "utf8");
  }
  const artefact = path.join(dir, "artefact.bin");
  const bytes = artefactBytes();
  writeFileSync(artefact, bytes);
  mkdirSync(path.join(dir, "reports"), { recursive: true });
  return {
    dir,
    artefact,
    reports: path.join(dir, "reports"),
    work: path.join(dir, "work"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function suiteArgs(s: Staged, extra: string[] = []): string[] {
  return [
    SUITE,
    "--platform", "fake",
    "--artefact", s.artefact,
    "--work", s.work,
    "--report-dir", s.reports,
    "--machine", "test-fake",
    ...extra,
  ];
}

export function readReport(s: Staged): { json: Record<string, unknown>; md: string; base: string } {
  const version = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version as string;
  const base = path.join(s.reports, `${version}-fake`);
  return {
    json: JSON.parse(readFileSync(`${base}.json`, "utf8")),
    md: readFileSync(`${base}.md`, "utf8"),
    base,
  };
}

export interface Row {
  step: string; id: string; capability: string; status: string;
  numbers: Record<string, unknown>; reason: string; evidence: string[];
}

export function rows(json: Record<string, unknown>): Row[] {
  return (json.steps ?? []) as Row[];
}

export function row(json: Record<string, unknown>, id: string): Row | undefined {
  return rows(json).find((r) => r.id === id);
}

/**
 * A UI walk that reached every control docs/UI_REGISTER.md lists, written into
 * a staged case's probe directory.
 *
 * It is generated rather than committed on purpose. The register changes
 * whenever the interface does, and a fixture listing 130 control ids by hand
 * would be stale by the next tile — which is the exact failure the register was
 * written to end. Generating it also keeps the cases honest in the other
 * direction: a case that wants a gap has to make one, instead of inheriting one
 * from a fixture nobody has read in months.
 */
export function writeFullWalk(probesDir: string): void {
  const walk = {
    driver: "fake",
    walked: walkTargets(REPO_ROOT).map((t: { id: string; commands: string[] }) => ({
      id: t.id, found: true, activated: true, reached: t.commands,
    })),
    not_probed: [] as { id: string; reason: string }[],
  };
  writeFileSync(path.join(probesDir, "ui_walk.out"), JSON.stringify(walk, null, 2) + "\n", "utf8");
  writeFileSync(path.join(probesDir, "ui_walk.rc"), "0\n", "utf8");
}
