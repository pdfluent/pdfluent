#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What goes out must not carry what only means something in here.
//
// This is the editor's copy of the rule the SDK repository enforces in
// `scripts/ci/geen_interne_zaken.py`; that file is where the reasoning lives and
// where a rule change starts. It exists twice because the two repositories
// publish separately and neither can import from the other, and it is in
// JavaScript here because this is a Node repository and a guard nobody can run
// is a guard nobody runs.
//
// WHAT IS REFUSED, AND WHAT IS NOT
// Most matches on a word list would be technique. `password` is a feature of
// this editor and `Adobe` is a fact about the world. A check that fires on those
// cries wolf often enough to be switched off inside a week. What is refused is
// what only has meaning internally: statements about revenue or pricing
// strategy, the names of customers and partners, and the map of our own
// machines and key stores.
//
// THE NAMES ARE NOT IN THIS FILE
// Customer and partner names live in a list outside the tree,
// `~/.config/pdfluent/interne-termen.txt` by default, `PDFLUENT_INTERNE_TERMEN`
// to point elsewhere. A denylist that publishes its own terms leaks exactly what
// it exists to stop, and worse than the message it caught: a message can be
// rewritten, a published file is in every clone. If the list is missing this
// exits non-zero and says so — it cannot judge that rule, and green would mean
// nobody looked.
//
// usage:
//   node scripts/ci/internal-terms.mjs --range <rev-range>
//   node scripts/ci/internal-terms.mjs --tree [<ref>]
//   node scripts/ci/internal-terms.mjs --message <file>   (a commit-msg hook)
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { loadManifest, isPublished, treeOf, root } from "./public-tree.mjs";

const RULES = [
  ["commercial", /\b(no customers yet|geen klanten|customer count|klantaantal|run ?rate|winstmarge|profit margin|revenue (that|which) does not exist|omzetdoel|verdienmodel|go-to-market|prijsstrategie|pricing strategy)\b/gi],
  // Case-sensitive on purpose: `arr` is a variable name, `ARR` is a revenue term.
  ["commercial", /\b(MRR|ARR)\b/g],
  // 10.x.x.x is not here: a Windows SDK version like 10.0.22621.0 is
  // indistinguishable from a private address and stands in every build script.
  ["infrastructure", /(\b192\.168\.\d+\.\d+\b|gitlab\.com\/pdfluent-group)/gi],
  // Case-sensitive, and long enough to be a real Windows host name. Without the
  // digit requirement this fired on DESKTOP-NATIVE, a constant in this code.
  ["infrastructure", /\bDESKTOP-(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,}\b/g],
];

// A keychain lookup is not a leak: the secret is IN the keychain and is being
// fetched, which is the behaviour you want to see. What can be sensitive is the
// label beside it, so the call passes and the operand is judged.
const KEYCHAIN = /find-(?:generic|internet)-password/;
const KEYCHAIN_LABEL = /-[as]\s+['"]?([A-Za-z0-9@._-]+)/g;
const EMAILISH = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

const LIST_PATH = process.env.PDFLUENT_INTERNE_TERMEN
  || resolve(homedir(), ".config/pdfluent/interne-termen.txt");

// This file names `pricing strategy` and `MRR` in its own rules, and its test
// names a host and an address that have to look real to be a test at all. That
// exemption is the same shape as the ones argued against above, and the
// difference is material: what is left in these two files is ordinary commercial
// vocabulary and invented examples -- DESKTOP-QQ7X1 is nobody's machine and
// 192.168.9.9 is nobody's address -- so publishing them leaks nothing. The names
// that did matter are not in the tree at all, which is why the exemption can be
// two named files rather than a pattern anyone could grow.
const OWN_FILES = new Set([
  "scripts/ci/internal-terms.mjs",
  "tests/ci/internal-terms.test.ts",
]);

let privatePattern = null;   // word-bounded, for text
let privateLoose = null;     // unbounded, for paths: `X_CONTRACT.md` has no \b

function rules() {
  if (!existsSync(LIST_PATH)) {
    throw new Error(
      `internal-terms: SKIPPED (not a pass) — the customer and partner list is not at\n${LIST_PATH}.\n` +
      "Point PDFLUENT_INTERNE_TERMEN at it. Without the list that rule cannot be judged,\n" +
      "and green here would mean nobody looked.",
    );
  }
  const terms = readFileSync(LIST_PATH, "utf8")
    .split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (terms.length === 0) {
    throw new Error(`internal-terms: SKIPPED (not a pass) — ${LIST_PATH} holds no terms.`);
  }
  // Case-insensitive is not decoration: these are names and a message spells
  // them however it feels like.
  //
  // A term is a regex alternative, so `Instantly\\.ai` escapes its own dot. It is
  // also a file written by hand, and one line of it that is not valid regex
  // takes the whole pattern down and with it every rule in this guard -- which
  // is a guard that stops working because of a typo in its input. Each term is
  // compiled on its own and falls back to a literal when it does not compile.
  const safe = terms.map((t) => {
    try { new RegExp(t); return t; } catch { return escapeRx(t); }
  });
  privatePattern = new RegExp(`\\b(${safe.join("|")})\\b`, "gi");
  privateLoose = new RegExp(`(${terms.map(escapeRx).join("|")})`, "gi");
  return [...RULES, ["partner", privatePattern]];
}

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function findAll(rx, text) {
  const out = [];
  const g = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = g.exec(text)) !== null) {
    out.push(m);
    if (m.index === g.lastIndex) g.lastIndex += 1;
  }
  return out;
}

/** Findings in one blob of text. */
export function violations(text, activeRules) {
  const out = [];
  for (const [name, rx] of activeRules) {
    for (const m of findAll(rx, text)) {
      const from = Math.max(0, m.index - 40);
      out.push({ rule: name, what: m[0], context: text.slice(from, m.index + m[0].length + 30).replace(/\n/g, " ").trim() });
    }
  }
  return out;
}

function keychainViolations(line, activeRules) {
  if (!KEYCHAIN.test(line)) return [];
  const out = [];
  for (const m of findAll(KEYCHAIN_LABEL, line)) {
    const label = m[1];
    if (EMAILISH.test(label) || activeRules.some(([, rx]) => findAll(rx, label).length)) {
      out.push({ rule: "keychain-label", what: label, context: line.trim().slice(0, 90) });
    }
  }
  return out;
}

// A failing run's log is as public as the tree is, so on CI a hit on the private
// rule is reported by position only. `::add-mask::` does not cover it: the rule
// matches case-insensitively and masking is exact. No digest either — a hash
// with the length beside it is reversible with a word list.
function showable(field) {
  if (!process.env.CI || !privateLoose) return field;
  return findAll(privateLoose, field || "").length ? "<a private term matched here>" : field;
}

// FLOORS: an empty range or an empty listing approves everything without
// reading anything, and that is indistinguishable from a clean result.
const MIN_COMMITS = 1;
const MIN_FILES = 100;

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function scanRange(range, activeRules) {
  const n = Number(git(["rev-list", "--count", range]).trim() || 0);
  if (n < MIN_COMMITS) {
    throw new Error(`internal-terms: ${range} holds ${n} commits. The reference is wrong — an empty range approves everything.`);
  }
  const text = git(["log", "--format=%s%n%b", range]);
  return { findings: violations(text, activeRules), inspected: n, unit: "commits" };
}

function isText(sha) {
  const buf = execFileSync("git", ["cat-file", "blob", sha], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  return !buf.subarray(0, 8192).includes(0);
}

function scanTree(ref, activeRules) {
  const manifest = loadManifest();
  const tree = treeOf(ref);
  const paths = [...tree].filter(([p]) => isPublished(p, manifest) && !OWN_FILES.has(p));
  if (paths.length < MIN_FILES) {
    throw new Error(`internal-terms: ${ref} publishes ${paths.length} files, fewer than ${MIN_FILES}. The invocation is wrong.`);
  }
  const findings = [];
  let read = 0;
  for (const [path, sha] of paths) {
    // THE NAME IS PART OF THE TREE. A file called after a customer publishes
    // that customer whatever its contents say, so the path is judged before the
    // text filter — a binary named after a partner is exactly as public as a
    // text one.
    for (const [name, rx] of activeRules) {
      const search = name === "partner" && privateLoose ? privateLoose : rx;
      const m = findAll(search, path)[0];
      if (m) findings.push({ rule: name, what: m[0], where: path, context: "<in the file name>" });
    }
    if (!isText(sha)) continue;
    read += 1;
    const text = execFileSync("git", ["cat-file", "blob", sha], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    // Whole blob at a time, then the line number from the offset. Line by line
    // was the obvious shape and it ran the partner alternation once per line of
    // package-lock.json; on this tree that alone was minutes per run, and a
    // guard slow enough to skip is a guard that gets skipped.
    const lineAt = (index) => {
      let n = 1;
      for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) n += 1;
      return n;
    };
    for (const [name, rx] of activeRules) {
      for (const m of findAll(rx, text)) {
        const line = text.slice(text.lastIndexOf("\n", m.index) + 1, (text.indexOf("\n", m.index) + 1 || text.length + 1) - 1);
        // A keychain lookup is judged on its label, not on the call.
        if (KEYCHAIN.test(line)) continue;
        findings.push({
          rule: name, what: m[0], where: `${path}:${lineAt(m.index)}`,
          context: line.trim().slice(0, 90),
        });
      }
    }
    if (KEYCHAIN.test(text)) {
      text.split("\n").forEach((line, i) => {
        for (const f of keychainViolations(line, activeRules)) findings.push({ ...f, where: `${path}:${i + 1}` });
      });
    }
  }
  return { findings, inspected: read, unit: "published text files" };
}

function main(argv) {
  let activeRules;
  try { activeRules = rules(); } catch (e) { console.error(`\n${e.message}\n`); return 1; }

  let result;
  try {
    if (argv[0] === "--tree") result = scanTree(argv[1] || "HEAD", activeRules);
    else if (argv[0] === "--range") result = scanRange(argv[1] || "HEAD", activeRules);
    else if (argv[0] === "--message") {
      if (!argv[1]) { console.error("usage: internal-terms.mjs --message <file>"); return 2; }
      // git's own comment lines are not part of the message.
      const text = readFileSync(argv[1], "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n");
      result = { findings: violations(text, activeRules), inspected: 1, unit: "message" };
    }
    else { console.error("usage: internal-terms.mjs --range <rev-range> | --tree [<ref>] | --message <file>"); return 2; }
  } catch (e) { console.error(`\n${e.message}\n`); return 1; }

  if (result.findings.length === 0) {
    console.log(`OK: ${result.inspected} ${result.unit} carry nothing internal.`);
    return 0;
  }
  console.error(
    `\ninternal-terms: ${result.findings.length} place(s) in ${result.inspected} ${result.unit} do not\n` +
    "belong in something that goes public. What happened technically may be said;\n" +
    "what it was worth commercially, for which customer, and on whose machine may not.\n",
  );
  for (const f of result.findings.slice(0, 25)) {
    console.error(`  [${f.rule}] ${showable(f.what)}  --  ${showable(f.where || "")}: ${showable(f.context)}`);
  }
  if (result.findings.length > 25) console.error(`  … and ${result.findings.length - 25} more`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
