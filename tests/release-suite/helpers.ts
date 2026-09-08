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

import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

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
