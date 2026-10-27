// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Drift-guard: the app does not start child processes from its own Rust code
// unless the file is listed below with a reason.
//
// Why: the form-scripts policy was read by running `/usr/bin/defaults read`
// from a command handler on the main thread. On macOS 15 and later a child
// process reading the preferences of the App Store build raises the "wants to
// access data from other apps" prompt, and the window stayed frozen until the
// user answered. Reading settings, policy and registry values has an in-process
// API on both platforms; a subprocess for that is a bug.
//
// Every entry is a file and the number of `Command::new(` calls it may hold.
// A new call in a listed file, or any call in another file, fails this test
// until the entry (with its reason) is changed in review.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** file (relative to the repo root) -> allowed `Command::new(` calls and why. */
export const ALLOWED: Record<string, { calls: number; reason: string }> = {
  'src-tauri/src/lib.rs': {
    calls: 5,
    reason:
      'Text-to-speech: `say` (macOS, twice: speak and list voices), PowerShell speech (Windows), `spd-say` (Linux), and `kill` to pause/resume the speech child. The speech engines have no in-process API we link, and none of this reads a setting.',
  },
  'src-tauri/src/atomic_file.rs': {
    calls: 1,
    reason:
      'A unit test only (`granted_path_only`): it runs the test binary again under `/usr/bin/sandbox-exec` with a profile that grants one path, to prove a save works with the access the Mac sandbox gives after a Save As. Nothing in the app calls it.',
  },
  'src-tauri/src/ocr.rs': {
    calls: 1,
    reason:
      'Runs the bundled, signed Tesseract executable. Its own binary shipped inside the app, not the OS.',
  },
};

const CALL = /\bCommand::new\s*\(/g;
const IMPORT = /\bprocess::(?:\{[^}]*\bCommand\b[^}]*\}|Command\b)/;

function rustFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'target' ? [] : rustFiles(path);
    return name.endsWith('.rs') ? [path] : [];
  });
}

/** Code lines only: comments may talk about `Command::new` freely. */
export function codeOf(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

export function scan(files: Record<string, string>) {
  const found: Record<string, number> = {};
  for (const [file, source] of Object.entries(files)) {
    const code = codeOf(source);
    const calls = (code.match(CALL) ?? []).length;
    if (calls > 0 || IMPORT.test(code)) found[file] = calls;
  }
  return found;
}

function violations(found: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [file, calls] of Object.entries(found)) {
    const allowed = ALLOWED[file];
    if (!allowed) out.push(`${file}: starts a child process (${calls} call(s)); not on the allowlist`);
    else if (calls > allowed.calls) out.push(`${file}: ${calls} calls, allowed ${allowed.calls}`);
  }
  return out;
}

describe('the app starts no child process without a reason', () => {
  const dirs = [join(ROOT, 'src-tauri/src'), join(ROOT, 'src-tauri/crates')];
  const files: Record<string, string> = {};
  for (const dir of dirs) {
    // Allowlist keys use `/`; on Windows `relative` returns `\`, which matched nothing.
    for (const path of rustFiles(dir)) {
      files[relative(ROOT, path).split(sep).join('/')] = readFileSync(path, 'utf8');
    }
  }

  it('finds no unlisted subprocess in src-tauri', () => {
    expect(violations(scan(files))).toEqual([]);
  });

  it('keeps every allowlist entry honest: file exists, reason given, budget used', () => {
    const found = scan(files);
    for (const [file, { calls, reason }] of Object.entries(ALLOWED)) {
      expect(files[file], `${file} is on the allowlist but does not exist`).toBeDefined();
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
      expect(found[file] ?? 0, `${file}: allowlist says ${calls}, source has fewer; lower it`).toBe(calls);
    }
  });

  it('bites: the policy reader going back to `defaults` is caught', () => {
    const regression = {
      'src-tauri/src/form_scripts_policy.rs':
        'let out = std::process::Command::new("/usr/bin/defaults").output();',
    };
    expect(violations(scan(regression))).toHaveLength(1);
  });

  it('bites: a second call in an allowed file is caught, a comment is not', () => {
    const lib = 'src-tauri/src/ocr.rs';
    const two = { [lib]: 'Command::new(a);\nCommand::new(b);' };
    expect(violations(scan(two))).toHaveLength(1);
    expect(violations(scan({ [lib]: '// Command::new(a) in a comment\nCommand::new(a);' }))).toEqual([]);
  });
});
