// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The register of every affordance the shipped shell offers, and what is
 * behind it.
 *
 * WHY THIS EXISTS
 *
 * The interface promised more than the code delivered, in both directions, and
 * nothing was checking. `getWiredTools()` enabled 12 of 42 tiles from a
 * hand-written list, and that list reported on a dispatch switch inside a
 * component the app has not rendered for months. The shortcut sheet promised
 * Cmd+S and no key handler anywhere answered it. The Sign panel advertised
 * "PAdES compliant" over an in-memory overlay. The one document that described
 * all this, WORKFLOW_READINESS_MATRIX.md, was written by hand in May 2026 and
 * still read as fact in September.
 *
 * A hand-maintained account of a moving interface is wrong within weeks and
 * says nothing about which weeks. So this file walks the source and answers,
 * for every tile, rail tool, panel, palette command, menu button, mode tab and
 * advertised shortcut:
 *
 *     1. Where does the user see it?   file + line, and whether the running
 *                                      app renders that file at all
 *     2. What does activating it do?   the Tauri command or UI function it
 *                                      reaches, by following calls, imports,
 *                                      JSX props and child components
 *     3. What proves it?               the tests that name it, what kind of
 *                                      test they are, and which CI job runs them
 *
 * An affordance that reaches nothing is not a feature, it is a lie in the
 * toolbar. `--gate` fails on one unless docs/ui_register_exceptions.json
 * records it with a reason, and the tile set the All-tools panel renders is
 * generated from this walk, so an unproven tile disappears instead of sitting
 * there greyed out and inviting a click.
 *
 * Usage:
 *   node scripts/quality/ui-register.mjs           regenerate the register
 *   node scripts/quality/ui-register.mjs --check   fail if the committed copy is stale
 *   node scripts/quality/ui-register.mjs --gate    fail on an unrecorded gap
 *
 * Exit codes: 0 ok · 1 stale or gap · 2 could not run.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolvePath(HERE, '..', '..');

const SRC_DIRS = ['src'];
const TEST_DIRS = ['tests'];
const SKIP_DIRS = new Set(['node_modules', 'legacy', 'dist', 'target', '.git', 'archive']);

export const REGISTER_PATH = 'docs/UI_REGISTER.md';
export const EXCEPTIONS_PATH = 'docs/ui_register_exceptions.json';
export const GENERATED_TS_PATH = 'src/viewer/tools/wiredTools.generated.ts';

// A lower bound on what the walk must find. When an extractor stops matching --
// a renamed array, a reformatted switch -- the register goes quiet and green
// rather than red, which is the one failure it cannot afford.
export const MIN_AFFORDANCES = 100;

// ---------------------------------------------------------------------------
// File index
// ---------------------------------------------------------------------------

function walkDir(dir, out, predicate) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkDir(full, out, predicate);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const isSource = (p) =>
  (p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.d.ts') && !p.includes('__tests__');
const isTest = (p) => /\.(test|spec)\.tsx?$/.test(p);

/** Every shipped (non-test) source file, keyed by repo-relative path. */
export function readSources(root = REPO) {
  const files = [];
  for (const d of SRC_DIRS) walkDir(join(root, d), files, isSource);
  return new Map(files.map((f) => [relative(root, f), readFileSync(f, 'utf8')]));
}

/**
 * Every test file, keyed by repo-relative path.
 *
 * The register's own tests are left out. They quote command names and label
 * keys as fixtures, and counting those as proof let the walker certify an
 * affordance because its own test suite mentioned it — a measurement that
 * reads its own output.
 */
export function readTests(root = REPO) {
  const files = [];
  for (const d of [...SRC_DIRS, ...TEST_DIRS]) walkDir(join(root, d), files, isTest);
  return new Map(
    files
      .map((f) => [relative(root, f), readFileSync(f, 'utf8')])
      .filter(([, text]) => !text.includes('scripts/quality/ui-register'))
  );
}

// ---------------------------------------------------------------------------
// Tiny TS readers
//
// Not a parser. Every shape read here is a literal array, a switch or a JSX
// attribute, and MIN_AFFORDANCES makes a silent miss loud.
// ---------------------------------------------------------------------------

/** Substring from the first `open` at or after `from` to its matching close. */
export function sliceBalanced(text, from, open = '{', close = '}') {
  const start = text.indexOf(open, from);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * `case 'x': …` bodies of the switch inside `fnName`, keyed by case value.
 * A bare fall-through borrows the body of the case that carries it.
 */
export function switchCases(text, fnName) {
  const at = text.search(new RegExp(`(function\\s+${fnName}\\s*\\(|const\\s+${fnName}\\s*=)`));
  if (at < 0) return new Map();
  const body = sliceBalanced(text, at);
  const marks = [];
  const re = /case\s+'([^']+)'\s*:/g;
  let m;
  while ((m = re.exec(body))) marks.push({ value: m[1], start: m.index, end: m.index + m[0].length });
  const out = new Map();
  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
    let slice = body.slice(marks[i].end, stop);
    if (!slice.trim() && i + 1 < marks.length) {
      slice = body.slice(marks[i + 1].end, i + 2 < marks.length ? marks[i + 2].start : body.length);
    }
    out.set(marks[i].value, slice);
  }
  return out;
}

/**
 * The body after a parameter list that starts at `from`.
 *
 * Skipping the parameters is not cosmetic: `function Panel({ onApplied })` has
 * its first `{` in the destructuring, and slicing from there returns the
 * parameter object as if it were the function. Every component that
 * destructures its props then reads as empty, which is how four panels that
 * call encrypt_pdf, add_watermark and run_paddle_ocr came out inert.
 */
function bodyAfterParams(text, from) {
  const open = text.indexOf('(', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return sliceBalanced(text, i + 1);
  }
  return '';
}

/** `function f(){}`, `const f = () => {}` and nested handlers, by name. */
export function namedFunctions(text) {
  const out = new Map();
  let m;
  const re1 = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/g;
  while ((m = re1.exec(text))) out.set(m[1], bodyAfterParams(text, m.index + m[0].length - 1));
  const re2 = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:useCallback\(\s*|useMemo\(\s*)?(?:async\s*)?\(/g;
  while ((m = re2.exec(text))) {
    if (out.has(m[1])) continue;
    const body = bodyAfterParams(text, m.index + m[0].length - 1);
    if (body) out.set(m[1], body);
  }
  // Handlers declared inside a component body are the norm here and the two
  // regexes above only see declarations at the start of a line.
  const re3 = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re3.exec(text))) if (!out.has(m[1])) out.set(m[1], bodyAfterParams(text, m.index + m[0].length - 1));
  return out;
}

/** `import { a, b } from './x'` → name → module specifier. */
export function importMap(text) {
  const out = new Map();
  let m;
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(text))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) out.set(name, m[2]);
    }
  }
  const re2 = /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(text))) out.set(m[1], m[2]);
  return out;
}

/**
 * JSX callback bindings: `<Comp onFoo={bar}>` → {component, prop, expr}.
 *
 * Only attributes inside the component's own open tag count. Attributing every
 * `on*` in the file to the nearest component above it makes `onClick` on a
 * plain <button> read as a binding on that component, and since the resolver
 * looks props up by name, one such mistake pulled the entire application's
 * click handlers into every panel: the All-tools panel came out calling the
 * text-to-speech commands.
 */
export function propBindings(text) {
  const out = [];
  const tagRe = /<([A-Z][\w.]*)/g;
  let m;
  while ((m = tagRe.exec(text))) {
    let depth = 0;
    let end = text.length;
    for (let i = m.index; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      else if (text[i] === '>' && depth === 0) { end = i; break; }
    }
    const openTag = text.slice(m.index, end);
    for (const attr of openTag.matchAll(/\b(on[A-Z][\w]*)=(?=\{)/g)) {
      // Balanced, because the value is often an inline arrow with its own
      // braces: `onRunOcr={() => { void handleRunOcr({ … }); }}`.
      const expr = sliceBalanced(openTag, attr.index + attr[0].length).slice(1, -1).trim();
      if (expr) out.push({ component: m[1], prop: attr[1], expr });
    }
  }
  return out;
}

function exportedComponents(text) {
  return [...text.matchAll(/export\s+function\s+([A-Z][\w]*)/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// Effect resolution
// ---------------------------------------------------------------------------

const CALL_NOISE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await',
  'new', 'super', 'require', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Set',
  'Map', 'JSON', 'Math', 'Promise', 'Error', 'Date', 't', 'useState', 'useEffect',
  'useMemo', 'useCallback', 'useRef', 'expect', 'describe', 'it', 'console',
  'parseInt', 'parseFloat',
]);

const UI_EFFECTS = [
  [/window\.print\s*\(/, 'window.print'],
  [/requestFullscreen\s*\(/, 'Fullscreen API'],
  [/exitFullscreen\s*\(/, 'Fullscreen API'],
  [/window\.open\s*\(/, 'window.open'],
];

const EFFECTFUL_NAME = /^(set|on|handle|toggle|open|close|show|go|run|apply|start|commit|save|load)[A-Z]/;

/**
 * Names this body hands control to, each with the string literal it is called
 * with: calls, and handlers passed by reference.
 *
 * `onClick={handleSplit}` never calls anything on this line, and reading only
 * call syntax made the split, merge and compress panels look inert while their
 * handlers were right there in the same file. The literal is what tells one
 * item of a menu from the next when they all call the same dispatcher.
 */
function calleeCalls(body) {
  const out = new Map();
  let m;
  const call = /\b([A-Za-z_$][\w$]*)\s*(?:\?\.)?\(/g;
  while ((m = call.exec(body))) {
    if (CALL_NOISE.has(m[1])) continue;
    const lit = /^\s*'([\w-]+)'\s*[),]/.exec(body.slice(call.lastIndex, call.lastIndex + 64));
    // A name called twice keeps the argument of the first call that carries
    // one; a menu item calls its dispatcher exactly once.
    if (!out.has(m[1]) || (out.get(m[1]) === null && lit)) out.set(m[1], lit ? lit[1] : null);
  }
  const ref = /\b(?:on[A-Z][\w]*|action|handler)=\{\s*(?:props\.)?([A-Za-z_$][\w$]*)\s*\}/g;
  while ((m = ref.exec(body))) if (!CALL_NOISE.has(m[1]) && !out.has(m[1])) out.set(m[1], null);
  return out;
}

/**
 * The part of a dispatcher's body that runs for one action.
 *
 * Seven items of the rail's More menu call one `handleMoreTool(action)`, and
 * reading the whole handler for each of them gave "Insert date" -- whose branch
 * is a bare `return` -- credit for the attachment dialog its sibling opens, and
 * "Ruler", which has no branch at all, credit for everything. A control is
 * judged on the code that runs when it is the one activated.
 *
 * The prelude every branch shares is deliberately left out: closing the menu is
 * not what "Insert date" does. A dispatcher that does its work before the
 * branches will therefore read as a gap, which is the honest answer -- the
 * register cannot tell that apart from a control that does nothing.
 *
 * Returns the body unchanged when nothing in it discriminates on a string
 * literal, `''` when the dispatcher has no branch for this one, and the branch
 * otherwise.
 */
export function dispatchBranch(body, literal) {
  if (!literal || !body) return body;

  const branches = [];
  // `if (action === 'x')` — the literal has to sit in the condition. A ternary
  // in the middle of a handler (`direction === 'left' ? 270 : 90`) chooses a
  // value, not a code path, and reading it as a branch turned both page-rotate
  // buttons into gaps.
  for (const m of body.matchAll(/\bif\s*\(/g)) {
    const openParen = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = openParen; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')' && --depth === 0) { close = i; break; }
    }
    if (close < 0) continue;
    const lits = [...body.slice(openParen + 1, close).matchAll(/([=!])==\s*'([\w-]+)'/g)]
      .filter((c) => c[1] === '=')
      .map((c) => c[2]);
    if (!lits.length) continue;
    const rest = body.slice(close + 1);
    branches.push({
      lits: new Set(lits),
      body: /^\s*\{/.test(rest) ? sliceBalanced(rest, 0) : rest.slice(0, rest.indexOf(';') + 1),
    });
  }

  // `case 'x':` — up to the next case that has a body of its own, so a bare
  // fall-through keeps the code it falls through to.
  for (const m of body.matchAll(/\bcase\s+'([\w-]+)'\s*:/g)) {
    const from = m.index + m[0].length;
    const next = [...body.slice(from).matchAll(/\bcase\s+'[\w-]+'\s*:|\bdefault\s*:/g)]
      .find((c) => body.slice(from, from + c.index).trim().length > 0);
    branches.push({
      lits: new Set([m[1]]),
      body: body.slice(from, next ? from + next.index : undefined),
    });
  }

  if (!branches.length) return body;

  // A branch that only returns or breaks runs no code: `if (action === 'date')
  // { return; }` is how "Insert date" shipped, and it is a gap, not a handler.
  const joined = branches.filter((b) => b.lits.has(literal)).map((b) => b.body).join('\n');
  const runs = joined
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\b(?:return|break|continue)\s*;/g, '')
    .replace(/[{};\s]/g, '');
  return runs ? joined : '';
}

/**
 * Tauri commands called in this body.
 *
 * Scans rather than matches one regex: `invoke<{ pages: number[] }>('x')`
 * carries a `>` inside its type argument, and a lazy `<...>` group stops
 * there and misses the call — which silently drops the commands behind the
 * redact, split and merge panels.
 */
function invokesIn(body) {
  const out = new Set();
  const re = /\binvoke\b/g;
  let m;
  while ((m = re.exec(body))) {
    let i = m.index + 6;
    let angle = 0;
    for (; i < body.length && i < m.index + 2000; i++) {
      const c = body[i];
      if (c === '<') angle++;
      else if (c === '>') { if (angle > 0) angle--; }
      else if (angle === 0 && c === '(') break;
      else if (angle === 0 && !/\s/.test(c)) { i = -1; break; }
    }
    if (i < 0) continue;
    const call = /^\(\s*'([a-z0-9_]+)'/.exec(body.slice(i, i + 80));
    if (call) out.add(call[1]);
  }
  return out;
}

function resolveModule(fromFile, spec, hasFile) {
  if (!spec.startsWith('.')) return null;
  const base = resolvePath(dirname(fromFile), spec);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (hasFile(base + ext)) return base + ext;
  }
  return null;
}

export function buildIndex(sources) {
  const functions = new Map();
  const imports = new Map();
  const components = new Map();
  const propsByName = new Map();
  const globalFunctions = new Map();
  const absPaths = new Set([...sources.keys()].map((k) => join(REPO, k)));

  for (const [file, text] of sources) {
    const fns = namedFunctions(text);
    functions.set(file, fns);
    imports.set(file, importMap(text));
    components.set(file, new Set([...fns.keys()].filter((n) => /^[A-Z]/.test(n))));
    for (const [name, body] of fns) {
      if (!globalFunctions.has(name)) globalFunctions.set(name, []);
      globalFunctions.get(name).push({ file, body });
    }
    for (const b of propBindings(text)) {

      if (!propsByName.has(b.prop)) propsByName.set(b.prop, []);
      propsByName.get(b.prop).push({ ...b, file });
    }
  }
  return { functions, imports, components, propsByName, globalFunctions, hasFile: (p) => absPaths.has(p) };
}

/**
 * Follow a handler body to everything it can reach: Tauri commands, named UI
 * effects, and the setters and callbacks that prove it does anything at all.
 *
 * Resolution order for a called name: a function in the same file, then a JSX
 * prop bound on this component by its parent, then an import, then a name that
 * is unique across the tree. Bounded by depth and a visited set.
 */
export function resolveEffects(index, file, body, depth = 5) {
  const commands = new Set();
  const effects = new Set();
  const seen = new Set();
  const queue = [{ file, body, depth }];
  // A control can be desktop-only without the walk reaching its invoke: the
  // handler bails out with `if (!isTauri) return` long before. Browser-test
  // must not offer it either way.
  let tauri = false;

  while (queue.length) {
    const cur = queue.shift();
    if (!cur.body || cur.depth < 0) continue;
    for (const cmd of invokesIn(cur.body)) commands.add(cmd);
    for (const [re, label] of UI_EFFECTS) if (re.test(cur.body)) effects.add(label);
    if (/@tauri-apps\/plugin-dialog|@tauri-apps\/plugin-fs/.test(cur.body)) effects.add('native file dialog');
    if (/\bisTauri\b|@tauri-apps\//.test(cur.body)) tauri = true;
    if (cur.depth === 0) continue;

    // A panel that delegates to <EncryptDecryptControls /> does its work in
    // that child; without this edge the panel reads as inert.
    for (const m of cur.body.matchAll(/<([A-Z][\w]*)/g)) {
      const key = `${cur.file}#<${m[1]}`;
      if (seen.has(key)) continue;
      const child = index.functions.get(cur.file)?.get(m[1]);
      if (!child) continue;
      seen.add(key);
      queue.push({ file: cur.file, body: child, depth: cur.depth - 1 });
      effects.add(`<${m[1]}>`);
    }

    for (const [name, literal] of calleeCalls(cur.body)) {
      const key = `${cur.file}#${name}#${literal ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Following into a function is itself recorded as an effect, so a call
      // that reaches an empty branch must not be followed at all -- otherwise
      // the dispatcher's name alone makes a dead control look like it does
      // something.
      const follow = (file, body, label) => {
        const branch = dispatchBranch(body, literal);
        if (!branch.trim()) return;
        queue.push({ file, body: branch, depth: cur.depth - 1 });
        effects.add(label);
      };

      const local = index.functions.get(cur.file);
      if (local?.has(name)) {
        follow(cur.file, local.get(name), name);
        continue;
      }

      // Only a prop that a parent binds on a component *this file declares*:
      // resolving by prop name alone crosses into unrelated components.
      const mine = index.components.get(cur.file) ?? new Set();
      let followed = false;
      for (const b of index.propsByName.get(name) ?? []) {
        if (!mine.has(b.component)) continue;
        // Resolve the bound expression in the parent's file rather than
        // requiring a function there: `onRunOcr={props.onRunOcr}` hands the
        // question one level further up, and stopping here loses the command
        // at the end of that chain. The action travels with it: a menu item
        // calls its `onMoreTool` prop, and the parent binds the dispatcher.
        const bare = /^(?:props\.)?([A-Za-z_$][\w$]*)$/.exec(b.expr);
        followed = true;
        if (bare && literal) {
          const target = index.functions.get(b.file)?.get(bare[1]);
          if (target && !dispatchBranch(target, literal).trim()) continue;
        }
        queue.push({
          file: b.file,
          body: bare ? `${bare[1]}(${literal ? `'${literal}'` : ''})` : b.expr,
          depth: cur.depth - 1,
        });
        effects.add(`${name} → ${bare ? bare[1] : 'inline'}`);
      }
      if (followed) continue;

      const spec = index.imports.get(cur.file)?.get(name);
      const mod = spec ? resolveModule(join(REPO, cur.file), spec, index.hasFile) : null;
      if (mod) {
        const rel = relative(REPO, mod);
        const target = index.functions.get(rel)?.get(name);
        if (target) {
          follow(rel, target, name);
          continue;
        }
      }

      const global = index.globalFunctions.get(name);
      if (global && global.length === 1) {
        follow(global[0].file, global[0].body, name);
      } else if (EFFECTFUL_NAME.test(name)) {
        // A state setter or an unresolved callback prop is still an effect: the
        // control does something, we just cannot see through it from here.
        effects.add(name);
      }
    }
  }
  return { commands: [...commands].sort(), effects: [...effects], tauri: tauri || commands.size > 0 };
}

// ---------------------------------------------------------------------------
// What the running app actually loads and renders
// ---------------------------------------------------------------------------

/** Files the app loads, following value imports (static and lazy) from the entry. */
export function reachableFiles(sources, entry = 'src/main.tsx') {
  const hasFile = (p) => sources.has(relative(REPO, p));
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file) || !sources.has(file)) continue;
    seen.add(file);
    const text = sources.get(file);
    const re = /from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
      // `import type { X }` pulls in no code, and this walk is about whether a
      // file's code runs; a type-only edge would make a dead component look
      // alive, which is the exact mistake being corrected here.
      const stmtStart = text.lastIndexOf('import', m.index);
      if (stmtStart >= 0 && /^import\s+type\b/.test(text.slice(stmtStart, m.index))) continue;
      const target = resolveModule(join(REPO, file), m[1] ?? m[2], hasFile);
      if (target) queue.push(relative(REPO, target));
    }
  }
  return seen;
}

/**
 * A component file is live when the app both loads it and renders it.
 *
 * Loading alone is not enough, and that distinction is the whole point:
 * AllToolsPanel imports getWiredTools from ModeToolbar, so ModeToolbar's module
 * is loaded on every run -- while `<ModeToolbar` appears in no file outside
 * src/legacy. Its 42-tile dispatch has had no renderer for months and the
 * hand-written wired list kept reporting on it.
 */
export function liveSurfaces(sources, reachable) {
  const live = new Set(['src/main.tsx']);
  for (const file of reachable) {
    const names = exportedComponents(sources.get(file) ?? '');
    if (!names.length) { live.add(file); continue; }   // hooks, tables, helpers
    for (const name of names) {
      let rendered = false;
      for (const other of reachable) {
        if (other === file) continue;
        if ((sources.get(other) ?? '').includes(`<${name}`)) { rendered = true; break; }
      }
      if (rendered) { live.add(file); break; }
    }
  }
  return live;
}

// ---------------------------------------------------------------------------
// Affordance extraction
// ---------------------------------------------------------------------------

export const F = {
  tools: 'src/viewer/tools/toolDefinitions.ts',
  allTools: 'src/viewer/components/AllToolsPanel.tsx',
  shell: 'src/viewer/v3/EditorV3Shell.tsx',
  rail: 'src/viewer/components/LeftNavRail.tsx',
  organize: 'src/viewer/components/OrganizeGrid.tsx',
  commands: 'src/viewer/hooks/useCommands.ts',
  palette: 'src/viewer/components/CommandPalette.tsx',
  modes: 'src/viewer/components/ModeSwitcher.tsx',
  shortcutSheet: 'src/viewer/components/ShortcutSheet.tsx',
  keys: 'src/viewer/hooks/useKeyboardShortcuts.ts',
};

/** Tiles in the All-tools panel, each with the claim it makes about itself. */
export function extractTiles(sources) {
  const text = sources.get(F.tools) ?? '';
  const out = [];
  const modeRe = /^\s{2}(read|review|edit|sign|organize|forms|protect|convert):\s*\[/gm;
  let m;
  while ((m = modeRe.exec(text))) {
    const block = sliceBalanced(text, m.index + m[0].length - 1, '[', ']');
    for (const e of block.matchAll(/\{[^{}]*label:\s*'([^']+)'[^{}]*\}/g)) {
      const claim = /fulfilledBy:\s*'([^']+)'/.exec(e[0]);
      out.push({
        kind: 'tile',
        id: e[1],
        mode: m[1],
        claim: claim ? claim[1] : null,
        surface: `${F.allTools}:${lineOf(text, m.index + e.index)}`,
        surfaceFile: F.allTools,
        handlerFile: F.allTools,
      });
    }
  }
  return out;
}

export function extractPaletteCommands(sources) {
  const text = sources.get(F.commands) ?? '';
  const out = [];
  for (const m of text.matchAll(/\{\s*id:\s*'([^']+)'/g)) {
    out.push({
      kind: 'palette',
      id: m[1],
      surface: `${F.commands}:${lineOf(text, m.index)}`,
      surfaceFile: F.palette,
      handlerFile: F.commands,
      body: sliceBalanced(text, text.indexOf('action:', m.index) + 7),
    });
  }
  return out;
}

export function extractRailTools(sources) {
  const text = sources.get(F.shell) ?? '';
  const cases = switchCases(text, 'setRailTool');
  const out = [];
  for (const m of text.matchAll(/<RailButton\s+tool="([a-z]+)"/g)) {
    out.push({
      kind: 'rail-tool',
      id: m[1],
      surface: `${F.shell}:${lineOf(text, m.index)}`,
      surfaceFile: F.shell,
      handlerFile: F.shell,
      body: cases.get(m[1]) ?? '',
    });
  }
  return out;
}

export function extractPanels(sources) {
  const text = sources.get(F.shell) ?? '';
  const out = [];
  for (const m of text.matchAll(/\{panel === '([a-z]+)' && \(/g)) {
    out.push({
      kind: 'panel',
      id: m[1],
      surface: `${F.shell}:${lineOf(text, m.index)}`,
      surfaceFile: F.shell,
      handlerFile: F.shell,
      body: sliceBalanced(text, m.index + m[0].length - 1, '(', ')'),
    });
  }
  return out;
}

/** The mode tabs the v3 topbar renders (not ModeSwitcher, which nothing renders). */
export function extractModeTabs(sources) {
  const text = sources.get(F.shell) ?? '';
  const at = text.indexOf('const modeTabs');
  if (at < 0) return [];
  const block = sliceBalanced(text, at, '[', ']');
  const cases = switchCases(text, 'togglePanel');
  return [...block.matchAll(/\{\s*id:\s*'([a-z]+)'/g)].map((m) => ({
    kind: 'mode-tab',
    id: m[1],
    surface: `${F.shell}:${lineOf(text, at)}`,
    surfaceFile: F.shell,
    handlerFile: F.shell,
    body: cases.get(m[1]) ?? 'onPanelToggle(tab.id)',
  }));
}

export function extractNavPanels(sources) {
  const text = sources.get(F.rail) ?? '';
  const fns = namedFunctions(text);
  const cases = switchCases(text, 'PanelContent');
  const out = [];
  for (const m of text.matchAll(/\{\s*id:\s*'([a-z]+)',\s*icon:/g)) {
    const rendered = /<([A-Z][\w]*)/.exec(cases.get(m[1]) ?? '');
    out.push({
      kind: 'rail-panel',
      id: m[1],
      surface: `${F.rail}:${lineOf(text, m.index)}`,
      surfaceFile: F.rail,
      handlerFile: F.rail,
      body: rendered ? (fns.get(rendered[1]) ?? '') : '',
    });
  }
  return out;
}

export function extractModes(sources) {
  const text = sources.get(F.modes) ?? '';
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(/\{\s*id:\s*'([a-z]+)',\s*labelKey:/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      kind: 'mode',
      id: m[1],
      surface: `${F.modes}:${lineOf(text, m.index)}`,
      surfaceFile: F.modes,
      handlerFile: F.modes,
      body: `onModeChange('${m[1]}')`,
    });
  }
  return out;
}

/**
 * The `onClick={…}` expression of an open tag, as something the resolver can
 * walk. `onClick={props.onUndo}` passes a handler rather than calling it, and
 * reading it literally makes every such button look inert.
 */
export function onClickBody(tag) {
  const at = tag.indexOf('onClick=');
  if (at < 0) return '';
  const expr = sliceBalanced(tag, at).slice(1, -1).trim();
  const bare = /^(?:props\.)?([A-Za-z_$][\w$]*)$/.exec(expr);
  return bare ? `${bare[1]}()` : expr;
}

/**
 * Buttons rendered with a stable test id: the menu items, topbar actions and
 * page-organiser controls. The test id is what a behavioural test can click, so
 * a button without one cannot be proven by anything but a source grep.
 */
export function extractButtons(sources) {
  const out = [];
  for (const file of [F.shell, F.rail, F.organize]) {
    const text = sources.get(file) ?? '';
    for (const m of text.matchAll(/data-testid="([\w-]+)"/g)) {
      const open = text.lastIndexOf('<', m.index);
      if (open < 0) continue;
      if (!/^<button[\s>]/.test(text.slice(open, open + 8))) continue;
      // Scan to the end of the open tag ignoring '>' inside {...}; a naive
      // [^>]* stops at the first arrow function.
      let depth = 0;
      let end = open;
      for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        else if (text[i] === '>' && depth === 0) { end = i; break; }
      }
      const tag = text.slice(open, end + 1);
      out.push({
        kind: 'button',
        id: m[1],
        surface: `${file}:${lineOf(text, m.index)}`,
        surfaceFile: file,
        handlerFile: file,
        body: onClickBody(tag),
      });
    }
  }
  return out;
}

const KEY_ALIASES = new Map([
  ['←', 'ArrowLeft'], ['→', 'ArrowRight'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'],
  ['Scroll', 'wheel'],
]);

/** The literals a promised shortcut must match in a key handler. */
export function shortcutLiterals(keys) {
  const out = new Set();
  for (let part of keys.split('/')) {
    part = part.trim();
    if (!part) continue;
    const range = /^(\d)\s*[–-]\s*(\d)$/.exec(part);   // "1 – 8" promises both ends
    if (range) { out.add(range[1]); out.add(range[2]); continue; }
    part = part
      .replace(/^(Ctrl|Cmd)\s*\+\s*/i, '')
      .replace(/[⌘⇧⌥⌃]/g, '')
      .replace(/−/g, '-')
      .trim();
    if (!part) continue;
    if (KEY_ALIASES.has(part)) { out.add(KEY_ALIASES.get(part)); continue; }
    out.add(part.length === 1 && /[A-Za-z]/.test(part) ? part.toLowerCase() : part);
  }
  return [...out];
}

/**
 * Does anything in the shipped app answer this key?
 *
 * Searched across every live source and not only the shortcuts hook, because
 * Escape is handled by each dialog. The sheet promised Cmd+S for months and no
 * handler anywhere read `e.key === 's'`.
 */
export function keyIsHandled(literal, haystack) {
  const lit = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    new RegExp(`\\bkey\\s*(===|!==)\\s*['"]${lit}['"]`).test(haystack) ||
    new RegExp(`case\\s+['"]${lit}['"]\\s*:`).test(haystack) ||
    new RegExp(`['"]${lit}['"]\\s*:\\s*['"]`).test(haystack) ||
    new RegExp(`addEventListener\\(\\s*['"]${lit}['"]`).test(haystack)
  );
}

export function extractShortcuts(sources, reachable) {
  const text = sources.get(F.shortcutSheet) ?? '';
  const haystack = [...(reachable ?? sources.keys())]
    .filter((f) => sources.has(f))
    .map((f) => sources.get(f))
    .join('\n');
  const out = [];
  for (const m of text.matchAll(/\{\s*keys:\s*'([^']+)',\s*descriptionKey:\s*'([^']+)'/g)) {
    const literals = shortcutLiterals(m[1]);
    const unbound = literals.filter((lit) => !keyIsHandled(lit, haystack));
    out.push({
      kind: 'shortcut',
      id: `${m[2].replace(/^shortcuts\./, '')} (${m[1]})`,
      literals,
      unbound,
      surface: `${F.shortcutSheet}:${lineOf(text, m.index)}`,
      surfaceFile: F.shortcutSheet,
      handlerFile: F.keys,
      body: unbound.length === 0 ? `keydown ${literals.join(', ')}` : '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Proof: which test names this affordance, and does any job run it
// ---------------------------------------------------------------------------

const VITEST_JOBS = 'quality-gates-fast (push) · quality-gates (tag)';
const PLAYWRIGHT_JOB = 'playwright (push) · native-smoke (smoke spec)';

/**
 * Which CI job executes this test file.
 *
 * Playwright specs answered `null` here, and that was true when it was
 * written: nothing ran Playwright. #395 put a `playwright` job on every push
 * to a release branch, so an e2e spec is proof like any other -- except the
 * quarantined specs under tests/e2e/legacy/, which playwright.config.ts
 * excludes and which cannot pass in browser mode.
 */
export function ciJobFor(testPath) {
  if (testPath.startsWith('tests/e2e/legacy/')) return null;
  if (testPath.startsWith('tests/e2e/') || /\.spec\.tsx?$/.test(testPath)) return PLAYWRIGHT_JOB;
  if (testPath.startsWith('tests/') || testPath.includes('__tests__')) return VITEST_JOBS;
  return null;
}

export function testKind(text) {
  if (/@playwright\/test/.test(text)) return 'e2e';
  if (/readFileSync\(/.test(text)) return 'source-grep';
  return 'unit';
}

/** Literal groups; a test proves the affordance when it contains a whole group. */
export function probesFor(a) {
  const withCommands = (groups) =>
    a.commands?.length ? groups.concat(a.commands.map((c) => [`'${c}'`])) : groups;
  switch (a.kind) {
    case 'tile':       return withCommands([[`'${a.id}'`]]);
    case 'palette':    return withCommands([[`'${a.id}'`]]);
    case 'rail-tool':  return withCommands([[`tool="${a.id}"`], [`setRailTool('${a.id}')`], [`'editorV3.rail.${a.id}'`]]);
    case 'panel':      return withCommands([[`panel === '${a.id}'`], [`activePanel === '${a.id}'`], [`'${a.id}'`, 'EditorV3Shell']]);
    case 'mode-tab':   return withCommands([[`'${a.id}'`, 'EditorV3Shell'], [`togglePanel('${a.id}')`]]);
    case 'rail-panel': return withCommands([[`'${a.id}'`, 'LeftNavRail']]);
    case 'mode':       return withCommands([[`'${a.id}'`, 'ModeSwitcher']]);
    case 'button':     return withCommands([[`'${a.id}'`], [`"${a.id}"`]]);
    case 'shortcut':   return withCommands((a.literals ?? []).map((l) => [`'${l}'`, 'key']));
    default:           return [[`'${a.id}'`]];
  }
}

/**
 * The parts of a test file that actually run, with every skipped test blanked
 * out character for character so offsets still line up.
 *
 * `visual-e2e-beta-blockers.spec.ts` has 23 tests and skips 19 of them with
 * `test.skip(true, 'v3-arch-gap: …')`. Playwright prints the skips and exits 0,
 * so the job was green -- and this walker read the literals inside those bodies
 * as proof. `button:export-btn` was `wired` on the strength of a test that has
 * never run. A skip is a decision to ship without the test; it cannot also be
 * the evidence that shipping is safe.
 */
export function runnableText(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const spans = [];

  /** The balanced call starting at the '(' at or after `from`. */
  const callSpan = (from) => {
    const open = text.indexOf('(', from);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) return [from, i + 1];
    }
    return [from, text.length];
  };

  // test.skip(...) / it.fixme(...) / describe.skip(...) as the declaration.
  const declared = /\b(?:describe|test|it)\s*\.\s*(?:skip|fixme|failing)\s*\(/g;
  let m;
  while ((m = declared.exec(text))) {
    const span = callSpan(m.index);
    if (span) spans.push(span);
  }

  // A plain test(...) whose body calls test.skip(...) / this.skip() at runtime:
  // the declaration reads as a live test and the body never runs.
  const plain = /(?:^|[^.\w])(?:test|it)\s*\(/g;
  while ((m = plain.exec(text))) {
    const at = m.index + m[0].length - 1;
    const span = callSpan(at);
    if (!span) continue;
    const body = text.slice(span[0], span[1]);
    if (/\b(?:test|it)\s*\.\s*skip\s*\(|\bthis\s*\.\s*skip\s*\(/.test(body)) spans.push(span);
  }

  if (!spans.length) return text;
  let out = text;
  for (const [start, end] of spans) {
    out = out.slice(0, start) + blank(out.slice(start, end)) + out.slice(end);
  }
  return dropUnreachableHelpers(out, blank);
}

/**
 * Local helpers nothing live calls any more, blanked as well.
 *
 * Blanking the skipped tests is not enough on its own: `export-btn` appears in
 * this file inside `exportPdfAndAssertValid`, a helper called only from tests
 * that skip. The literal is in a file that runs, in a function that does not,
 * and reading it as proof is the same mistake one level down. Repeated to a
 * fixed point, because dropping one helper can orphan the next.
 *
 * Only unexported, file-local declarations: an exported helper may be used by a
 * spec this walker is not looking at.
 */
function dropUnreachableHelpers(text, blank) {
  const bodySpan = (from) => {
    const open = text.indexOf('{', from);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return i + 1;
    }
    return text.length;
  };

  let out = text;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const decl = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/gm;
    let m;
    while ((m = decl.exec(out))) {
      const name = m[1];
      if (/^\s*export\s/.test(out.slice(Math.max(0, m.index - 10), m.index + 1))) continue;
      const end = bodySpan(m.index);
      if (end === null) continue;
      const outside = out.slice(0, m.index) + out.slice(end);
      if (new RegExp(`\\b${name}\\b`).test(outside)) continue;
      out = out.slice(0, m.index) + blank(out.slice(m.index, end)) + out.slice(end);
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

export function findProof(a, tests) {
  const hits = [];
  for (const [file, text] of tests) {
    const runnable = runnableText(text);
    for (const group of probesFor(a)) {
      if (group.every((lit) => runnable.includes(lit))) {
        hits.push({ file, kind: testKind(text), job: ciJobFor(file) });
        break;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

export const STATES = ['wired', 'UNTESTED', 'NO CI JOB', 'NO ACTION', 'UNREACHABLE'];

function stateOf(a) {
  if (!a.reachable) return 'UNREACHABLE';
  if (!a.hasEffect) return 'NO ACTION';
  if (a.proof.length === 0) return 'UNTESTED';
  if (!a.runInCi) return 'NO CI JOB';
  return 'wired';
}

export function buildRegister(root = REPO) {
  const sources = readSources(root);
  const tests = readTests(root);
  const index = buildIndex(sources);
  const reachable = reachableFiles(sources);
  const live = liveSurfaces(sources, reachable);

  const affordances = [];
  for (const a of [
    ...extractPaletteCommands(sources),
    ...extractRailTools(sources),
    ...extractPanels(sources),
    ...extractModeTabs(sources),
    ...extractNavPanels(sources),
    ...extractModes(sources),
    ...extractButtons(sources),
    ...extractShortcuts(sources, reachable),
  ]) {
    const resolved =
      a.kind === 'shortcut'
        ? { commands: [], effects: a.body ? [a.body] : [], tauri: false }
        : resolveEffects(index, a.handlerFile, a.body);
    affordances.push({
      ...a,
      commands: resolved.commands,
      effects: resolved.effects,
      tauri: resolved.tauri,
      reachable: live.has(a.surfaceFile),
    });
  }

  for (const a of affordances) {
    a.proof = findProof(a, tests);
    a.runInCi = a.proof.some((p) => p.job);
    a.hasEffect = a.commands.length > 0 || a.effects.length > 0;
    a.state = stateOf(a);
  }

  // A tile is a claim that some other affordance performs the tool it names.
  // It can only be as good as what it points at, so it is resolved last.
  const byRef = new Map(affordances.map((a) => [`${a.kind}:${a.id}`, a]));
  for (const t of extractTiles(sources)) {
    const target = t.claim ? byRef.get(t.claim) : null;
    const tile = {
      ...t,
      target,
      claimBroken: Boolean(t.claim) && !target,
      commands: target?.commands ?? [],
      effects: target ? [`${t.claim} (${target.state})`] : [],
      reachable: live.has(t.surfaceFile),
      hasEffect: Boolean(target && target.hasEffect && target.state !== 'UNREACHABLE'),
    };
    tile.proof = findProof(tile, tests);
    tile.runInCi = tile.proof.some((p) => p.job);
    tile.state = stateOf(tile);
    affordances.push(tile);
  }

  affordances.sort((x, y) => (x.kind + x.id).localeCompare(y.kind + y.id));
  const counts = {};
  for (const a of affordances) counts[a.state] = (counts[a.state] ?? 0) + 1;
  return { affordances, counts, deadSurfaces: deadSurfaces(sources, live) };
}

/**
 * Components under src/viewer that no live file renders.
 *
 * Each one is a screen's worth of behaviour that cannot be reached, and each
 * one keeps reading as the product: RightContextPanel is 2,169 lines named by
 * 37 test files and rendered by none, and the plan's own UI audit described
 * panels that live only in there.
 */
export function deadSurfaces(sources, live) {
  const out = [];
  for (const [file, text] of sources) {
    if (!file.startsWith('src/viewer/') || live.has(file)) continue;
    const names = exportedComponents(text);
    if (!names.length) continue;
    out.push({ file, components: names, lines: text.split('\n').length });
  }
  return out.sort((a, b) => b.lines - a.lines);
}

/**
 * Tile labels the All-tools panel may render, split by runtime.
 * A tile whose tool reaches a Tauri command is meaningless in browser-test mode.
 */
export function wiredTiles(register) {
  const both = [];
  const tauriOnly = [];
  for (const a of register.affordances) {
    if (a.kind !== 'tile' || !a.hasEffect) continue;
    (a.commands.length || a.target?.tauri ? tauriOnly : both).push(a.id);
  }
  return { both: both.sort(), tauriOnly: tauriOnly.sort() };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const KIND_TITLE = {
  tile: 'All-tools tiles',
  panel: 'Right-hand panels',
  'mode-tab': 'Mode tabs',
  'rail-tool': 'Left rail tools',
  palette: 'Command palette',
  button: 'Buttons with a test id',
  shortcut: 'Advertised keyboard shortcuts',
  'rail-panel': 'LeftNavRail panels',
  mode: 'ModeSwitcher tabs',
};

const KIND_ORDER = ['tile', 'panel', 'mode-tab', 'rail-tool', 'palette', 'button', 'shortcut', 'rail-panel', 'mode'];

function proofCell(a) {
  if (!a.proof.length) return '—';
  const shown = a.proof.slice(0, 3).map((p) => `\`${p.file}\` (${p.kind})`).join(' · ');
  const more = a.proof.length > 3 ? ` · +${a.proof.length - 3}` : '';
  return shown + more;
}

function effectCell(a) {
  if (a.commands.length) return a.commands.map((c) => `\`${c}\``).join(', ');
  if (a.claimBroken) return `**claims \`${a.claim}\`, which does not exist**`;
  if (a.effects.length) return a.effects.slice(0, 2).map((e) => `\`${e}\``).join(', ');
  return '—';
}

export function renderMarkdown(register) {
  const { affordances, counts } = register;
  const L = [];
  const w = (s = '') => L.push(s);

  w('# UI register');
  w();
  w('**Generated** by `scripts/quality/ui-register.mjs`. Do not edit by hand — the');
  w('`quality:ui-register` job regenerates it and fails the build when this file has');
  w('drifted from the code. That gate is the value: `WORKFLOW_READINESS_MATRIX.md`');
  w('was written by hand in May 2026, was wrong within weeks, and still read as');
  w('authoritative in September.');
  w();
  w('This is the one place to look before claiming that the editor can do something,');
  w('before enabling a tile, and before writing a release note. It is current by');
  w('construction; memory is not.');
  w();
  w('## Summary');
  w();
  w(`- **${affordances.length}** affordances found in the shell.`);
  for (const s of STATES) w(`- **${counts[s] ?? 0}** \`${s}\``);
  w();
  w('| state | meaning |');
  w('|---|---|');
  w('| `wired` | the app renders it, activating it reaches a command or a named UI effect, a test names it, and a CI job runs that test |');
  w('| `UNTESTED` | it works as far as the code shows, and nothing proves it |');
  w('| `NO CI JOB` | a test names it and no job executes that test — this reads as tested and is not |');
  w('| `NO ACTION` | the user can see it and activating it reaches nothing |');
  w('| `UNREACHABLE` | the component that renders it is never rendered by the running app |');
  w();
  w('`NO ACTION` and `UNREACHABLE` are the two that must not exist. Every one of them');
  w('is recorded in `docs/ui_register_exceptions.json` with a reason, and `--gate`');
  w('fails on a new one that is not.');
  w();
  w('## How an affordance is resolved');
  w();
  w('The walker starts at the data that defines each control — `TOOLS_BY_MODE`, the');
  w('`RailButton` tags, the `panel === \'…\'` blocks, `useCommands`, the shortcut sheet —');
  w('and follows its handler through calls, imports, JSX callback props and child');
  w('components to the `invoke(\'…\')` it reaches. A tile carries a `fulfilledBy` claim');
  w('naming the affordance that performs its tool; the claim is checked, not believed.');
  w();

  for (const kind of KIND_ORDER) {
    const rows = affordances.filter((a) => a.kind === kind);
    if (!rows.length) continue;
    w(`## ${KIND_TITLE[kind] ?? kind}`);
    w();
    w('| affordance | state | reaches | seen at | proven by |');
    w('|---|---|---|---|---|');
    for (const a of rows) {
      w(`| \`${a.id}\` | \`${a.state}\` | ${effectCell(a)} | \`${a.surface}\` | ${proofCell(a)} |`);
    }
    w();
  }
  const dead = register.deadSurfaces ?? [];
  if (dead.length) {
    w('## Components nothing renders');
    w();
    w('Loaded or not, no live file puts these on screen. They are counted here');
    w('because a dead panel keeps reading as the product — and because two of the');
    w('descriptions this register replaces were written from them.');
    w();
    w('| file | exports | lines |');
    w('|---|---|---|');
    for (const d of dead) w(`| \`${d.file}\` | ${d.components.join(', ')} | ${d.lines} |`);
    w();
  }
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// The generated tile set
// ---------------------------------------------------------------------------

export function renderGeneratedTs(register) {
  const { both, tauriOnly } = wiredTiles(register);
  const list = (xs) => (xs.length ? xs.map((x) => `  '${x}',`).join('\n') + '\n' : '');
  return `// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// GENERATED by scripts/quality/ui-register.mjs — do not edit.
//
// The All-tools panel renders a tile only when its \`fulfilledBy\` claim resolves
// to an affordance that the shipped shell renders and that reaches something.
// Editing this list by hand is how the previous list came to enable tiles with
// no handler and disable tiles that worked; \`quality:ui-register\` fails when
// this file no longer matches the walk.

/** Tiles whose tool works in every runtime. */
export const WIRED_TILES_ALL_RUNTIMES: readonly string[] = [
${list(both)}];

/** Tiles whose tool reaches a Tauri command, so browser-test cannot run them. */
export const WIRED_TILES_TAURI_ONLY: readonly string[] = [
${list(tauriOnly)}];
`;
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export function loadExceptions(root = REPO) {
  try {
    return JSON.parse(readFileSync(join(root, EXCEPTIONS_PATH), 'utf8'));
  } catch {
    return { accepted: {} };
  }
}

/**
 * Fail on a gap nobody wrote down, and on a recorded gap that has been closed.
 *
 * The second half matters as much as the first: a stale exception is how a list
 * of known problems turns into a list nobody reads.
 */
export function gate(register, exceptions) {
  const problems = [];
  const accepted = exceptions.accepted ?? {};
  const seen = new Set();

  if (register.affordances.length < MIN_AFFORDANCES) {
    problems.push(
      `only ${register.affordances.length} affordances found (expected at least ${MIN_AFFORDANCES}); ` +
      'an extractor has stopped matching and the register is now measuring less than it claims'
    );
  }

  for (const a of register.affordances) {
    const ref = `${a.kind}:${a.id}`;
    if (a.claimBroken) {
      problems.push(`${ref} claims fulfilledBy '${a.claim}', which is not an affordance`);
      continue;
    }
    if (a.state === 'wired') {
      if (accepted[ref]) problems.push(`${ref} is wired now — remove its entry from ${EXCEPTIONS_PATH}`);
      continue;
    }
    if (!accepted[ref]) {
      problems.push(`${ref} is ${a.state} and is not recorded in ${EXCEPTIONS_PATH}`);
      continue;
    }
    seen.add(ref);
    if (!accepted[ref].reason) problems.push(`${ref} is recorded without a reason`);
  }

  for (const dead of register.deadSurfaces ?? []) {
    const ref = `dead-surface:${dead.file}`;
    if (accepted[ref]) { seen.add(ref); continue; }
    problems.push(
      `${dead.file} exports ${dead.components.join(', ')} and nothing renders it ` +
      `(${dead.lines} lines) — delete it, render it, or record it in ${EXCEPTIONS_PATH}`
    );
  }

  for (const ref of Object.keys(accepted)) {
    if (ref.startsWith('dead-surface:')) {
      if (!seen.has(ref)) problems.push(`${ref} is recorded and is rendered again — remove the entry`);
      continue;
    }
    if (!seen.has(ref) && !register.affordances.some((a) => `${a.kind}:${a.id}` === ref)) {
      problems.push(`${ref} is recorded in ${EXCEPTIONS_PATH} and no longer exists — remove it`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const check = argv.includes('--check');
  const doGate = argv.includes('--gate');
  const register = buildRegister();
  const markdown = renderMarkdown(register);
  const generated = renderGeneratedTs(register);

  if (doGate) {
    const problems = gate(register, loadExceptions());
    if (problems.length) {
      console.error('UI register gate: %d problem(s)\n', problems.length);
      for (const p of problems) console.error('  - ' + p);
      console.error(
        '\nFix the affordance, or record it in %s with a reason.\n' +
        'Recording it is a decision, not paperwork: it says the control ships in that state.',
        EXCEPTIONS_PATH
      );
      return 1;
    }
    console.log('UI register gate: no unrecorded gaps (%d affordances).', register.affordances.length);
    return 0;
  }

  if (check) {
    let stale = [];
    for (const [path, want] of [[REGISTER_PATH, markdown], [GENERATED_TS_PATH, generated]]) {
      let have = '';
      try { have = readFileSync(join(REPO, path), 'utf8'); } catch { /* missing counts as stale */ }
      if (have !== want) stale.push(path);
    }
    if (stale.length) {
      console.error(
        'UI register is stale: %s\nRun `node scripts/quality/ui-register.mjs` and commit the result — ' +
        'the diff is the news, and it is worth reading before dismissing it.',
        stale.join(', ')
      );
      return 1;
    }
    console.log('UI register is up to date (%d affordances).', register.affordances.length);
    return 0;
  }

  writeFileSync(join(REPO, REGISTER_PATH), markdown);
  writeFileSync(join(REPO, GENERATED_TS_PATH), generated);
  console.log('Wrote %s and %s (%d affordances): %s',
    REGISTER_PATH, GENERATED_TS_PATH, register.affordances.length, JSON.stringify(register.counts));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('ui-register.mjs')) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error('ui-register could not run:', err);
    process.exit(2);
  }
}
