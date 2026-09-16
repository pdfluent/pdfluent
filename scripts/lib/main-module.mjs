// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Was this file the command, or did something else import it?
//
// Every guard in scripts/ci and scripts/quality is both: a module a test can
// import, and a command CI runs. The usual way of telling the two apart is
//
//     if (import.meta.url === `file://${process.argv[1]}`) main();
//
// and that line is wrong in three separate ways, each of which ends the same:
// the module loads, defines everything, runs nothing, prints nothing and exits
// 0 -- which is byte for byte what a clean pass looks like.
//
//   · Node resolves a symlinked entry point before it fills in
//     `import.meta.url`, but `process.argv[1]` keeps the path as typed. On
//     macOS every temporary directory is reached through /var -> /private/var,
//     so a guard spawned from one never ran. That is how this was found: the
//     cases for internal-terms had to realpath their own temporary directory
//     to make the guard start at all.
//   · One side is a URL and percent-encodes a space, the other is a path and
//     does not. The nightly keeps its checkout under "Application Support" and
//     made every probe, wrote no report and exited 0.
//   · `file://` is not how Node spells a URL for every path it accepts.
//
// So identity is not decided on the spelling of a path here. Two names are the
// same file when they are the same file: same device, same inode. That answer
// survives symlinks, /var against /private/var, a case-insensitive filesystem,
// a hard link and --preserve-symlinks, none of which the string comparison
// does.
//
// AND WHEN IT STILL CANNOT TELL, IT SAYS SO.
// A guard that decides it was imported while it was in fact invoked is the
// defect above. If the entry script carries this file's name and is still not
// this file, nothing is assumed: `<guard>: not run (<reason>)` on stderr and
// exit 2, because the one outcome that must never happen is the silent one.
import { statSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

function identity(path) {
  const s = statSync(path);
  // dev and ino are numbers or BigInts depending on the call; stringify both.
  return `${s.dev}:${s.ino}`;
}

/** The guard's own name, as its messages spell it: `internal-terms`, `judge`. */
export function guardName(moduleUrl) {
  return basename(fileURLToPath(moduleUrl)).replace(/\.[cm]?js$/, "");
}

/**
 * Was `moduleUrl` the entry script of this process?
 *
 * Pure, so the cases can drive it without spawning: `{ run }` says whether the
 * CLI block should execute, and a `reason` that is not null is the defect --
 * invoked as this guard, and still not recognised as it.
 *
 * @returns {{ run: boolean, reason: string | null }}
 */
export function entryVerdict(moduleUrl, argv1 = process.argv[1]) {
  const self = fileURLToPath(moduleUrl);
  // No entry script at all: `node --eval`, the REPL, a worker without a file.
  // Nothing was invoked, so there is nothing to be loud about.
  if (!argv1) return { run: false, reason: null };

  const named = basename(argv1) === basename(self);
  let mine;
  let theirs;
  try {
    mine = identity(self);
    theirs = identity(argv1);
  } catch (e) {
    // Only loud when the entry looks like this guard. A sibling script that
    // imports this module and was itself deleted mid-run is not our business.
    return named
      ? { run: false, reason: `cannot tell ${argv1} from ${self}: ${e.message}` }
      : { run: false, reason: null };
  }

  if (mine === theirs) return { run: true, reason: null };
  if (named) {
    return { run: false, reason: `invoked as ${argv1}, which is not this file (${self})` };
  }
  // A different script imported this module. That is not an invocation, and
  // staying quiet is the correct answer to it.
  return { run: false, reason: null };
}

/**
 * `if (isMainModule(import.meta.url)) { ...the CLI... }`
 *
 * Returns false for an ordinary import. Returns false for the defect too --
 * after saying so on stderr and setting the exit code to 2, so the caller's
 * CLI block stays a plain `if` and the process still cannot end in silence.
 */
export function isMainModule(moduleUrl) {
  const { run, reason } = entryVerdict(moduleUrl);
  if (run) return true;
  if (reason) {
    process.stderr.write(`${guardName(moduleUrl)}: not run (${reason})\n`);
    process.exitCode = 2;
  }
  return false;
}
