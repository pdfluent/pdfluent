#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The Rust toolchain is pinned, and nothing overrides the pin.
//
//   node scripts/ci/rust-toolchain-pinned.mjs
//
// A floating toolchain lets a new clippy lint turn a release branch red with no
// code change. rust-toolchain.toml must name an exact version (x.y.z, or a
// dated nightly), and no workflow or CI script may select another one with a
// `toolchain:` input, `rustup default`, `rustup override`, `cargo +x` or
// `--toolchain x`. A moving channel (stable, beta, nightly) is refused.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMainModule } from "../lib/main-module.mjs";

const EXACT = /^(\d+\.\d+\.\d+|nightly-\d{4}-\d{2}-\d{2})$/;

export function pinnedChannel(toml) {
  const m = /^\s*channel\s*=\s*"([^"]*)"/m.exec(toml);
  return m ? m[1] : null;
}

/** Returns a list of problems; empty means the pin holds. */
export function check({ toml, files }) {
  const problems = [];
  if (toml === null) return ["rust-toolchain.toml is missing: the toolchain floats with the runner's default."];
  const pin = pinnedChannel(toml);
  if (!pin) return ["rust-toolchain.toml has no [toolchain] channel."];
  if (!EXACT.test(pin)) problems.push(`rust-toolchain.toml channel "${pin}" is not an exact version (x.y.z or nightly-YYYY-MM-DD).`);
  const patterns = [
    [/toolchain:\s*['"]?([\w.\-]+)/g, "toolchain input"],
    [/rustup\s+(?:default|override\s+set)\s+([\w.\-]+)/g, "rustup default/override"],
    [/cargo\s+\+([\w.\-]+)/g, "cargo +toolchain"],
    [/--toolchain[ =]([\w.\-]+)/g, "--toolchain"],
    [/rustup\s+run\s+([\w.\-]+)/g, "rustup run"],
  ];
  for (const { name, text } of files) {
    text.split("\n").forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      for (const [re, what] of patterns) {
        for (const m of line.matchAll(re)) {
          if (m[1] !== pin) problems.push(`${name}:${i + 1}: ${what} "${m[1]}" differs from the pinned ${pin}.`);
        }
      }
    });
  }
  return problems;
}

function load(root) {
  let toml = null;
  try { toml = readFileSync(join(root, "rust-toolchain.toml"), "utf8"); } catch { /* reported by check */ }
  const files = [];
  for (const dir of [".github/workflows", ".github/actions", "scripts/ci"]) {
    const walk = (d) => {
      let entries = [];
      try { entries = readdirSync(join(root, d), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ya?ml|sh)$/.test(e.name)) files.push({ name: rel, text: readFileSync(join(root, rel), "utf8") });
      }
    };
    walk(dir);
  }
  return { toml, files };
}

if (isMainModule(import.meta.url)) {
  const problems = check(load(resolve(process.argv[2] ?? ".")));
  if (problems.length === 0) {
    console.log("rust-toolchain-pinned: the toolchain is pinned and nothing overrides it.");
  } else {
    process.stderr.write(`rust-toolchain-pinned: FAILED\n${problems.map((p) => `  ${p}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}
