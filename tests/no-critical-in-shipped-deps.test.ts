// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Dependabot counted 51 open advisories against this repository and nothing
// read them for months (#558). All 51 turned out to be dev-only tooling, which
// is the good outcome — but nothing was measuring that, so the next one to land
// in a shipped dependency would have gone unnoticed the same way.
//
// This is the measurement. The guard asks npm whether anything critical reaches
// the production dependency closure, and the fixture case proves the guard can
// actually go red: a package.json pinning shell-quote@1.7.2 (GHSA-g4rg-993r-mgx7,
// critical command injection) as a runtime dependency must fail it. Without that
// case the green run above would mean nothing.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUARD = join(ROOT, "scripts/ci/no-critical-in-shipped-deps.mjs");

interface GuardRun {
  status: number | null;
  stdout: string;
  stderr: string;
  skipped: boolean;
}

function runGuard(projectDir: string): GuardRun {
  const result = spawnSync(process.execPath, [GUARD, projectDir], {
    encoding: "utf8",
    // npm audit talks to the registry; a cold cache on a shared runner is slow.
    timeout: 180_000,
  });
  const stderr = result.stderr ?? "";
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr,
    skipped: stderr.includes("SKIPPED (not a pass)"),
  };
}

/**
 * A lockfile written by hand on purpose: `npm install` in a fixture would need
 * a tarball download and a writable cache, while `npm audit` needs only the
 * name and version to ask the advisory endpoint. The fixture therefore exercises
 * the guard, not npm's installer.
 */
function writeFixture(dependencies: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pdfluent-shipped-deps-"));
  mkdirSync(dir, { recursive: true });
  const manifest = { name: "shipped-deps-fixture", version: "1.0.0", dependencies };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2), "utf8");

  const packages: Record<string, unknown> = {
    "": { name: manifest.name, version: manifest.version, dependencies },
  };
  for (const [name, version] of Object.entries(dependencies)) {
    packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      license: "MIT",
    };
  }
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify(
      { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages },
      null,
      2,
    ),
    "utf8",
  );
  return dir;
}

describe("no critical advisory reaches what the desktop app ships", () => {
  it("passes on this repository's production dependency closure", () => {
    const run = runGuard(ROOT);
    if (run.skipped) {
      process.stderr.write(
        "SKIPPED (not a pass): npm audit could not reach the advisory registry from this machine\n",
      );
      return;
    }
    expect(run.stderr + run.stdout).not.toContain("CRITICAL advisories");
    expect(run.status).toBe(0);
  });

  // The red run. A guard that has never failed is a guard nobody has tested.
  it("fails on a runtime dependency pinned to a version with a critical advisory", () => {
    const fixture = writeFixture({ "shell-quote": "1.7.2" });
    const run = runGuard(fixture);
    if (run.skipped) {
      process.stderr.write(
        "SKIPPED (not a pass): npm audit could not reach the advisory registry from this machine\n",
      );
      return;
    }
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("CRITICAL advisories in shipped (non-dev) dependencies");
    expect(run.stderr).toContain("shell-quote");
  });

  // Dev-only tooling must not turn this gate red: vitest's own critical advisory
  // is real and is exactly what the gate has to stay quiet about, or it would be
  // red for months and get switched off.
  it("ignores a devDependency with a critical advisory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfluent-shipped-deps-dev-"));
    const manifest = {
      name: "shipped-deps-dev-fixture",
      version: "1.0.0",
      devDependencies: { "shell-quote": "1.7.2" },
    };
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2), "utf8");
    writeFileSync(
      join(dir, "package-lock.json"),
      JSON.stringify(
        {
          name: manifest.name,
          version: manifest.version,
          lockfileVersion: 3,
          requires: true,
          packages: {
            "": { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies },
            "node_modules/shell-quote": {
              version: "1.7.2",
              resolved: "https://registry.npmjs.org/shell-quote/-/shell-quote-1.7.2.tgz",
              dev: true,
              license: "MIT",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const run = runGuard(dir);
    if (run.skipped) {
      process.stderr.write(
        "SKIPPED (not a pass): npm audit could not reach the advisory registry from this machine\n",
      );
      return;
    }
    expect(run.status).toBe(0);
  });
});
