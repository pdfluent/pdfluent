// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Run a command and read its output from files instead of from pipes.
//
// `spawnSync` returned a short stdout twice while these cases were being
// written — never on its own, only inside the full suite with three hundred
// other files running — and a truncated listing reads as a repository with
// fewer files in it, so a case failed for a reason that had nothing to do with
// the code under test. A file has no buffer to run out of.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Ran { status: number; out: string; err: string }

export function runToFile(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Ran {
  const dir = mkdtempSync(join(tmpdir(), "pdfluent-ci-run-"));
  const out = join(dir, "out");
  const err = join(dir, "err");
  try {
    const r = spawnSync("sh", ["-c", 'exec "$@" > "$PDFLUENT_RUN_OUT" 2> "$PDFLUENT_RUN_ERR"', "sh", command, ...args], {
      cwd: options.cwd,
      env: { ...(options.env ?? process.env), PDFLUENT_RUN_OUT: out, PDFLUENT_RUN_ERR: err },
    });
    return { status: r.status ?? 1, out: readFileSync(out, "utf8"), err: readFileSync(err, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
