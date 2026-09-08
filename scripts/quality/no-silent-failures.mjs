// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Every failure the app swallows is on a list, and the list says why.
 *
 * A silent failure is the one bug class the test suite cannot see: the code
 * runs, returns, and the person in front of the app is left with a spinner
 * that stopped and no idea what happened. The editor had four shapes of it,
 * and none of them was a mistake anybody made twice -- they were the normal
 * way to write the line:
 *
 *   catch (e) { /* best effort *\/ }       the reason never leaves the function
 *   .catch(() => {})                       a rejected command becomes a no-op
 *   let _ = write_something();             a Result dropped on the floor
 *   .unwrap_or_default()                   a missing user path becomes ""
 *
 * `handleRunOcr` is the one that shows why a lint and not a review: it does
 * `console.error('OCR runtime unavailable') ; return`, so on a machine without
 * the Python bridge the OCR button spins once and stops. That line has been in
 * the shipped shell since OCR landed, and it reads as careful code.
 *
 * The rule is not "never swallow". Some of these are right: a localStorage
 * write that fails in a sandboxed webview must not take the document with it.
 * The rule is that swallowing is a decision, so it goes in
 * docs/silent_failure_allowlist.json with a reason a reviewer can disagree
 * with. A hit that is not on the list fails the build; an entry that no longer
 * matches anything fails too, so the list cannot rot into a wall of excuses
 * for code that is gone.
 *
 * Entries are anchored on (file, kind, code) -- the trimmed source line, not a
 * line number -- so an edit elsewhere in the file does not invalidate them and
 * a moved line does not need a new entry. Changing the line itself does, which
 * is the point: rewriting the catch means re-deciding.
 *
 * Usage:
 *   node scripts/quality/no-silent-failures.mjs --check   gate (CI)
 *   node scripts/quality/no-silent-failures.mjs --list    every hit, with status
 *   node scripts/quality/no-silent-failures.mjs --skeleton  new hits as JSON entries
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolvePath(HERE, '..', '..');

export const ALLOWLIST_PATH = 'docs/silent_failure_allowlist.json';

/** Where a silent failure costs a user something: all shipped frontend code.
 *  `src/legacy` is skipped -- it is the retired shell behind `?legacy`, which
 *  the release build never opens. */
export const TS_DIRS = ['src'];
export const RUST_DIRS = ['src-tauri/src'];

/** Where the tests live. A skipped test is the fourth shape of a silent pass. */
export const TEST_DIRS = ['tests', 'src'];

/**
 * `tests/e2e/legacy/` is left out: those 29 specs target the shell the release
 * build never opens and playwright.config.ts excludes them, so they are not
 * skips inside a suite that runs -- they are a suite that does not.
 */
const SKIP_SCAN_EXCLUDE = 'tests/e2e/legacy/';

/** The one module allowed to reach the Tauri IPC directly. Everything else
 *  goes through it, which is what makes "every command error reaches the user"
 *  a property of the code and not of the reviewer's memory. */
export const COMMAND_BRIDGE = 'src/lib/commandBridge.ts';

/** A reason shorter than this is not a reason. */
const MIN_REASON = 25;

const SKIP_DIRS = new Set(['node_modules', '__tests__', 'dist', 'target', '.git', 'legacy']);

/**
 * Identifiers that make a failure audible. A catch body naming one of these
 * has told somebody -- the user, the log, or the caller -- and is not silent.
 */
const REPORTERS = [
  'appendError', 'makeAppError', 'setAppErrors', 'reportCommandFailure',
  'reportFallback', 'applog', 'console.error', 'console.warn', 'notify',
  'setError', 'setStatus', 'setLastError', 'onError', 'toast',
];

function walkDir(dir, out, predicate) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a directory that is not in this checkout is not a finding
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkDir(full, out, predicate);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const isTsSource = (p) =>
  (p.endsWith('.ts') || p.endsWith('.tsx')) &&
  !p.endsWith('.d.ts') &&
  !/\.(test|spec)\.tsx?$/.test(p);

const isRustSource = (p) => p.endsWith('.rs');

const isTestFile = (p) => /\.(test|spec)\.tsx?$/.test(p);

function sourceFiles(root, dirs, predicate) {
  const files = [];
  for (const d of dirs) walkDir(join(root, d), files, predicate);
  return files.map((f) => [relative(root, f).split('\\').join('/'), readFileSync(f, 'utf8')]);
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end < 0) end = text.length;
  return text.slice(start, end).trim();
}

/** Comments removed, so a body that only explains itself still counts as silent. */
function stripComments(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Comment text blanked out, character for character, so offsets and line
 * numbers still line up with the original. Without this the module comment
 * explaining what a silent `.catch(() => {})` looks like is itself reported as
 * one, and the lint's own documentation needs an entry on its own list.
 */
function blankComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

function reports(body) {
  const code = stripComments(body);
  if (/\bthrow\b/.test(code)) return true;
  return REPORTERS.some((r) => code.includes(r));
}

/** Substring from `open` at `start` to its matching close, braces or parens. */
function balancedFrom(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(start + 1, i);
  }
  return text.slice(start + 1);
}

/**
 * Rust `#[cfg(test)] mod tests { … }` spans. A test that drops a Result is
 * dropping it in a test; there is no user on the other end.
 */
function rustTestSpans(text) {
  const spans = [];
  const re = /#\[cfg\(test\)\]/g;
  let m;
  while ((m = re.exec(text))) {
    const brace = text.indexOf('{', m.index);
    if (brace < 0) continue;
    let depth = 0;
    let end = text.length;
    for (let i = brace; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) { end = i; break; }
    }
    spans.push([m.index, end]);
  }
  return spans;
}

const inSpans = (spans, index) => spans.some(([a, b]) => index >= a && index <= b);

// ---------------------------------------------------------------------------
// The four shapes
// ---------------------------------------------------------------------------

/**
 * `catch (e) { … }` whose body tells nobody.
 *
 * A catch that names its error and uses it -- rethrows it, wraps it, returns
 * it as a typed failure, puts it on screen -- has not swallowed anything; the
 * reason travels on and some caller decides. The silent ones are the two that
 * cannot: a binding that is never read, and `catch {` with no binding at all,
 * where the reason is gone at the language level.
 */
function silentCatches(file, text, scan) {
  const hits = [];
  const re = /catch\s*(?:\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*)?\{/g;
  let m;
  while ((m = re.exec(scan))) {
    const body = balancedFrom(text, m.index + m[0].length - 1, '{', '}');
    if (reports(body)) continue;
    const binding = m[1];
    if (binding && new RegExp(`\\b${binding}\\b`).test(stripComments(body))) continue;
    hits.push({ file, kind: 'silent-catch', code: lineAt(text, m.index), line: lineOf(text, m.index) });
  }
  return hits;
}

/** `.catch(handler)` whose handler tells nobody -- the promise form of the above. */
function silentRejections(file, text, scan) {
  const hits = [];
  const re = /\.catch\s*\(/g;
  let m;
  while ((m = re.exec(scan))) {
    const handler = balancedFrom(text, m.index + m[0].length - 1, '(', ')');
    if (reports(handler)) continue;
    hits.push({ file, kind: 'silent-rejection', code: lineAt(text, m.index), line: lineOf(text, m.index) });
  }
  return hits;
}

/**
 * Reaching the Tauri IPC without going through the bridge. Not itself a
 * swallowed error -- it is how one gets written next: a call site with its own
 * invoke has its own idea of what a failure means, and the ones already in the
 * tree ranged from a toast to nothing at all.
 */
function rawInvokes(file, text, scan) {
  if (file === COMMAND_BRIDGE) return [];
  const hits = [];
  const re = /(?:from\s+['"]@tauri-apps\/api\/core['"]|import\(\s*['"]@tauri-apps\/api\/core['"]\s*\))/g;
  let m;
  while ((m = re.exec(scan))) {
    const line = lineAt(text, m.index);
    if (!/\binvoke\b/.test(line) && !/\binvoke\b/.test(text.slice(m.index - 120, m.index))) continue;
    hits.push({ file, kind: 'raw-invoke', code: line, line: lineOf(text, m.index) });
  }
  return hits;
}

/** Rust: a Result bound to `_` is a Result nobody will ever read. */
function discardedResults(file, text) {
  const spans = rustTestSpans(text);
  const hits = [];
  const re = /^[ \t]*let\s+_(?:\s*:[^=\n]+)?\s*=/gm;
  let m;
  while ((m = re.exec(text))) {
    if (inSpans(spans, m.index)) continue;
    hits.push({ file, kind: 'discarded-result', code: lineAt(text, m.index), line: lineOf(text, m.index) });
  }
  return hits;
}

/** Rust: a missing value becomes an empty one, and the caller cannot tell. */
function unwrapOrDefaults(file, text) {
  const spans = rustTestSpans(text);
  const hits = [];
  const re = /\.unwrap_or_default\(\)/g;
  let m;
  while ((m = re.exec(text))) {
    if (inSpans(spans, m.index)) continue;
    hits.push({ file, kind: 'unwrap-or-default', code: lineAt(text, m.index), line: lineOf(text, m.index) });
  }
  return hits;
}

/**
 * A test that does not run, counted as if it did.
 *
 * `visual-e2e-beta-blockers.spec.ts` is the case: 23 tests, 19 of them
 * `test.skip(true, 'v3-arch-gap: …')`, and the UI register read `button:export-btn`
 * as `wired` because its only proof was one of the skipped ones. Playwright
 * prints the skips and exits 0, so the job was green and the register was wrong.
 *
 * Every skip is listed with a reason, the same as every swallowed error. The
 * reason on the list is not the string in the call: one says why the test cannot
 * run, the other says why shipping without it is acceptable.
 */
function skippedTests(file, text, scan) {
  const hits = [];
  const re = /\b(?:describe|test|it)\s*\.\s*(?:skip|fixme|failing)\s*\(/g;
  let m;
  while ((m = re.exec(scan))) {
    hits.push({ file, kind: 'skipped-test', code: lineAt(text, m.index), line: lineOf(text, m.index) });
  }
  return hits;
}

/** Every hit in the checkout, in file order. */
export function collect(root = REPO) {
  const hits = [];
  for (const [file, text] of sourceFiles(root, TS_DIRS, isTsSource)) {
    const scan = blankComments(text);
    hits.push(...silentCatches(file, text, scan), ...silentRejections(file, text, scan), ...rawInvokes(file, text, scan));
  }
  for (const [file, text] of sourceFiles(root, RUST_DIRS, isRustSource)) {
    hits.push(...discardedResults(file, text), ...unwrapOrDefaults(file, text));
  }
  for (const [file, text] of sourceFiles(root, TEST_DIRS, isTestFile)) {
    if (file.startsWith(SKIP_SCAN_EXCLUDE)) continue;
    hits.push(...skippedTests(file, text, blankComments(text)));
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** The accepted entries. `_readme` in the same file explains the rule to a reader. */
export function readAllowlist(root = REPO) {
  const raw = JSON.parse(readFileSync(join(root, ALLOWLIST_PATH), 'utf8'));
  return Array.isArray(raw) ? raw : raw.accepted;
}

const keyOf = (e) => `${e.file}\u0000${e.kind}\u0000${e.code}`;

/** How many hits share one entry's anchor. Counted, because identical lines in
 *  one file collapse onto one entry and a new one would otherwise arrive under
 *  a decision made about a different line. */
function countByKey(hits) {
  const counts = new Map();
  for (const h of hits) counts.set(keyOf(h), (counts.get(keyOf(h)) ?? 0) + 1);
  return counts;
}

/**
 * Hits with no entry, entries matching nothing, and entries whose reason is
 * too short to be one. All three are failures: the first lets a new silent
 * failure in, the second lets the list outlive the code, the third lets
 * "TODO" pass for a decision.
 */
export function audit(root = REPO) {
  const hits = collect(root);
  const entries = readAllowlist(root);
  const allowed = new Map();
  for (const entry of entries) allowed.set(keyOf(entry), entry);

  const counts = countByKey(hits);
  const seen = new Set();
  const unlisted = [];
  for (const hit of hits) {
    const key = keyOf(hit);
    if (allowed.has(key)) { seen.add(key); continue; }
    unlisted.push(hit);
  }
  const stale = entries.filter((e) => !seen.has(keyOf(e)));
  const miscounted = entries
    .filter((e) => seen.has(keyOf(e)) && (e.count ?? 1) !== counts.get(keyOf(e)))
    .map((e) => ({ ...e, actual: counts.get(keyOf(e)) }));
  const unreasoned = entries.filter((e) => typeof e.reason !== 'string' || e.reason.trim().length < MIN_REASON);
  return { hits, entries, unlisted, stale, miscounted, unreasoned };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Unlisted hits collapsed onto their anchor, with the count the entry needs. */
function dedupe(hits) {
  const out = new Map();
  for (const h of hits) {
    const key = keyOf(h);
    if (out.has(key)) out.get(key).count += 1;
    else out.set(key, { ...h, count: 1 });
  }
  return [...out.values()];
}

function main() {
  const mode = process.argv[2] ?? '--check';
  const { hits, entries, unlisted, stale, miscounted, unreasoned } = audit();

  if (mode === '--list') {
    const allowed = new Set(entries.map(keyOf));
    for (const h of hits) {
      console.log(`${allowed.has(keyOf(h)) ? 'allowed ' : 'UNLISTED'} ${h.kind.padEnd(18)} ${h.file}:${h.line}  ${h.code}`);
    }
    console.log(`\n${hits.length} hits, ${entries.length} allow-list entries`);
    return;
  }

  if (mode === '--skeleton') {
    console.log(JSON.stringify(
      dedupe(unlisted).map((h) => ({ file: h.file, kind: h.kind, code: h.code, count: h.count, reason: '' })),
      null, 2));
    return;
  }

  let failed = false;
  if (unlisted.length) {
    failed = true;
    console.error(`\n${unlisted.length} swallowed failure(s) not on the list.`);
    console.error('Fix the call site, or add it to ' + ALLOWLIST_PATH + ' with a reason:\n');
    for (const h of unlisted) console.error(`  ${h.file}:${h.line}  [${h.kind}]  ${h.code}`);
    console.error('\n  node scripts/quality/no-silent-failures.mjs --skeleton   prints the entries');
  }
  if (miscounted.length) {
    failed = true;
    console.error(`\n${miscounted.length} allow-list entr(ies) cover a different number of lines than they did.`);
    console.error('An identical line was added or removed next to a decision made about another one:\n');
    for (const e of miscounted) console.error(`  ${e.file}  [${e.kind}]  count ${e.count ?? 1} -> ${e.actual}  ${e.code}`);
  }
  if (stale.length) {
    failed = true;
    console.error(`\n${stale.length} allow-list entr(ies) match nothing any more. Remove them:\n`);
    for (const e of stale) console.error(`  ${e.file}  [${e.kind}]  ${e.code}`);
  }
  if (unreasoned.length) {
    failed = true;
    console.error(`\n${unreasoned.length} allow-list entr(ies) without a reason (min ${MIN_REASON} chars):\n`);
    for (const e of unreasoned) console.error(`  ${e.file}  [${e.kind}]  ${e.code}`);
  }
  if (failed) process.exit(1);
  console.log(`no-silent-failures: ${hits.length} swallowed failure(s), all ${entries.length} on the list with a reason.`);
}

if (process.argv[1] && process.argv[1].endsWith('no-silent-failures.mjs')) main();
