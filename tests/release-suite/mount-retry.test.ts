// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A busy disk arbiter is not a broken artefact.
//
// On 23-10 the macOS quality job failed its S1 mount with "hdiutil: attach
// failed - Resource temporarily unavailable" while no image was attached at
// all. The suite now tries the attach three times. These cases hold it to
// both halves: a transient refusal recovers, a lasting one still fails.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SUITE_DIR = path.join(REPO_ROOT, "scripts", "quality", "suite");

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Runs _mount_artefact with an hdiutil that refuses `failures` times. */
function mount(failures: number): { rc: string; attempts: number } {
  const w = mkdtempSync(path.join(tmpdir(), "pdfluent-suite-mount-"));
  made.push(w);
  execFileSync(
    "bash",
    [
      "-c",
      `
      set -u
      WORK=${JSON.stringify(w)}; SUITE_DIR=${JSON.stringify(SUITE_DIR)}
      ARTEFACT="\${WORK}/PDFluent_0.0.0_universal.dmg"; export WORK SUITE_DIR ARTEFACT
      mkdir -p "\${WORK}/probes"
      . "\${SUITE_DIR}/state.sh"
      . "\${SUITE_DIR}/drivers/macos.sh"
      sleep() { :; }
      hdiutil() {
        [ "$1" = attach ] || return 0
        n=$(cat "\${WORK}/n" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "\${WORK}/n"
        if [ "$n" -le ${failures} ]; then
          echo "hdiutil: attach failed - Resource temporarily unavailable" >&2; return 1
        fi
        echo "/dev/disk9s1 mounted"
      }
      _mount_artefact "\${WORK}/mnt"
      `,
    ],
    { encoding: "utf8", cwd: REPO_ROOT },
  );
  const rc = readFileSync(path.join(w, "probes", "mount.rc"), "utf8").trim();
  const attempts = Number(readFileSync(path.join(w, "n"), "utf8").trim());
  return { rc, attempts };
}

describe("the S1 mount survives a busy disk arbiter", () => {
  it("mounts on the first try when nothing refuses", () => {
    expect(mount(0)).toEqual({ rc: "0", attempts: 1 });
  });

  it("recovers from two transient refusals", () => {
    expect(mount(2)).toEqual({ rc: "0", attempts: 3 });
  });

  it("still fails after three refusals, and stops there", () => {
    const r = mount(5);
    expect(r.rc).not.toBe("0");
    expect(r.attempts).toBe(3);
  });
});
