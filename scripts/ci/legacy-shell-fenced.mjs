#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Release gate: the retired V1 shell must not be inside a production bundle.
//
// `src/legacy/App.tsx` is 9,081 lines of a shell the product no longer opens.
// It stayed reachable through `?legacy`, and — the part that actually mattered —
// it stayed COMPILED IN: a top-level import in `src/main.tsx` put every line of
// it in the shipped binary, with its own dialogs and its own hosts, behind a URL
// parameter anyone can type.
//
// Fencing it means the import sits behind `import.meta.env.DEV`, which Vite
// replaces with `false` in a production build so Rollup drops the branch and the
// module with it. This gate proves that on the BUNDLE, not on the source: a
// source assertion says what the code intends, a bundle scan says what ships.
//
// The markers are DERIVED, never hard-coded. A hard-coded marker rots into a
// string nothing contains any more, and the gate then passes by finding nothing
// — indistinguishable from a clean bundle. If fewer than MIN_MARKERS literals
// turn out to be unique to the legacy shell, this exits non-zero and says why,
// because it could not judge. Same reason the build failing is not a pass.
//
// usage: node scripts/ci/legacy-shell-fenced.mjs [--keep]
import { readFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const legacyDir = resolve(root, "src/legacy");
const srcDir = resolve(root, "src");
const outName = process.env.PDFLUENT_LEGACY_GUARD_OUT || "dist-legacy-guard";
const outDir = resolve(root, outName);
const MIN_MARKERS = 10;
const keep = process.argv.includes("--keep");

function die(reason) {
  console.error(`\nLEGACY-SHELL-FENCED: ${reason}\n`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// String literals long enough to be prose and free of the characters that make
// a literal a path, a class list or a template hole — those recur everywhere and
// would make the marker set useless.
function literals(text) {
  const found = new Set();
  for (const rx of [/"([^"\\\n]{20,120})"/g, /'([^'\\\n]{20,120})'/g]) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const s = m[1];
      if (!/ /.test(s)) continue;
      if (!/[A-Za-z]/.test(s)) continue;
      if (/[/\\{}<>$`]/.test(s)) continue;
      found.add(s);
    }
  }
  return found;
}

if (!existsSync(legacyDir)) {
  // The shell is gone entirely, which is the end state this gate exists to
  // protect. Nothing to prove; say so rather than reporting a silent pass.
  console.log("legacy-shell-fenced: src/legacy/ does not exist — nothing can leak. OK");
  process.exit(0);
}

const legacyFiles = walk(legacyDir);
const legacyText = legacyFiles.map((p) => readFileSync(p, "utf8")).join("\n");
const otherText = walk(srcDir)
  .filter((p) => !p.startsWith(legacyDir))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const markers = [...literals(legacyText)].filter((s) => !otherText.includes(s));
if (markers.length < MIN_MARKERS) {
  die(
    `SKIPPED (not a pass): only ${markers.length} of the literals in src/legacy/ are\n` +
    `unique to it (need ${MIN_MARKERS}). Without unique markers this gate cannot tell a\n` +
    "fenced bundle from a bundle it failed to read.",
  );
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
const build = spawnSync(
  "npx",
  ["vite", "build", "--outDir", outName, "--emptyOutDir", "--logLevel", "warn"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } },
);
if (build.status !== 0) die(`the production build failed (exit ${build.status}) — a build that did not run proves nothing.`);

const emitted = walk(outDir).filter((p) => /\.(js|mjs|css|html)$/.test(p));
if (emitted.length === 0) die("the build emitted no js/css/html — nothing was scanned.");
const bundleBytes = emitted.reduce((n, p) => n + statSync(p).size, 0);
const bundleText = emitted.map((p) => readFileSync(p, "utf8")).join("\n");

const hits = markers.filter((s) => bundleText.includes(s));
console.log(
  `legacy-shell-fenced: ${emitted.length} emitted files, ${bundleBytes} bytes; ` +
  `${markers.length} legacy-only markers checked; ${hits.length} found in the bundle.`,
);
if (!keep) rmSync(outDir, { recursive: true, force: true });

if (hits.length > 0) {
  console.error(
    `\nLEGACY-SHELL-FENCED FAILED: ${hits.length} of ${markers.length} strings that exist only in\n` +
    "src/legacy/ are in the production bundle. The retired V1 shell ships to users.\n" +
    "Put the import behind `import.meta.env.DEV` in src/main.tsx.\n",
  );
  for (const s of hits.slice(0, 8)) console.error(`  · ${JSON.stringify(s)}`);
  if (hits.length > 8) console.error(`  … and ${hits.length - 8} more`);
  process.exit(1);
}
console.log("OK: the production bundle contains none of the legacy shell.");
