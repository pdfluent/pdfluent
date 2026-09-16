#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Offline gate: every http(s) origin that ships in the product is declared.
//
// "Works 100% offline, no account required" is on the website, in both store
// listings and in the README. Until now the only thing behind it was that
// nobody had added a request. That is not a property, it is a habit, and a
// dependency can break it without anyone writing a line of code.
//
// What this checks, and what it refuses to judge.
//
// BLOCKING, on what this repository writes and ships: the built frontend bundle
// (dist/, where a minifier can inline an origin a dependency brought in) and the
// backend sources (src-tauri/src/, where a fetch is a fetch). An undeclared
// origin in either is a decision somebody made here, and it fails the gate.
//
// ADVISORY, on the linked executable: a release binary carries the string
// literals of every crate in the tree and of the system frameworks it links --
// XML namespace identifiers, Apple's OCSP and CRL hosts, documentation links in
// error messages of crates nothing calls. None of them is a request, and the
// allow-list cannot tell an address the product would dial from a name that
// merely spells like one. Declaring them would grow the allow-list with hosts
// we do not own in order to silence a scan; failing on them would make the gate
// a coin toss that a toolchain bump decides. So the binary is reported and
// never gated (decided 2026-09-10, #543), with a fixed ignore list for the two
// families that are certain to be names rather than addresses.
//
// Two kinds of origin, and the difference matters:
//   endpoint  the app may actually contact it. Only pdfluent.com hosts qualify,
//             and the unit test beside this file enforces that.
//   inert     a string that is never fetched: an XML namespace, a documentation
//             link inside a dependency's error message, a licence URL in a
//             comment. Declared so the gate can tell "known and harmless" from
//             "new and unexplained" -- which is the whole job.
//
// An origin that is in neither list fails the gate. Adding one is a decision:
// put it in ALLOWED with a reason and in docs/OUTBOUND_ENDPOINTS.md, which the
// unit test keeps in step with this file.
//
// usage:
//   node scripts/ci/offline-allowlist.mjs                       (dist + src-tauri/src + config)
//   node scripts/ci/offline-allowlist.mjs --tree dist --tree src-tauri/src
//   node scripts/ci/offline-allowlist.mjs --binary src-tauri/target/release/pdfluent
//
// A missing --binary target is reported as SKIPPED (not a pass). It does not
// fail a run that also scanned a tree -- something was judged -- but a run with
// nothing left to judge exits 3, never 0, so a caller can tell "clean" from
// "did not look". A gate that quietly checks nothing is the thing this
// repository has been burned by three times.
//
// Exit codes: 0 everything the gate judges is declared, 1 an undeclared origin
// ships in a gated target, 2 bad arguments, 3 nothing was scanned. An advisory
// finding never changes the status: it is a line to read, not a verdict.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/main-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every http(s) origin allowed to appear in a shipped artefact.
 *
 * `kind: 'endpoint'` means the app can send a request there. Keep that set
 * exactly as small as the product promise allows.
 */
export const ALLOWED = [
  {
    origin: 'https://pdfluent.com',
    kind: 'endpoint',
    why: 'Updater feed (/releases/latest.json, default on, switchable off in settings), website and licence pages opened in the browser.',
  },
  {
    origin: 'https://report.pdfluent.com',
    kind: 'endpoint',
    why: 'Crash and feedback report POST. Opt-in; both consent switches default off.',
  },
  {
    origin: 'https://feedback.pdfluent.com',
    kind: 'endpoint',
    why: 'Feedback page, opened in the browser through the host-restricted open_external_url command.',
  },
  {
    origin: 'http://www.w3.org',
    kind: 'inert',
    why: 'XML and SVG namespace identifiers. Names, not addresses; never resolved.',
  },
  {
    origin: 'https://www.w3.org',
    kind: 'inert',
    why: 'XML and SVG namespace identifiers, https spelling.',
  },
  {
    origin: 'https://react.dev',
    kind: 'inert',
    why: 'Documentation link inside a React runtime error message.',
  },
  {
    origin: 'https://www.i18next.com',
    kind: 'inert',
    why: 'Documentation link inside an i18next console warning.',
  },
  {
    origin: 'https://locize.com',
    kind: 'inert',
    why: 'Vendor link inside an i18next console message.',
  },
  {
    origin: 'https://rollupjs.org',
    kind: 'inert',
    why: 'Documentation link inside a Rollup/Vite runtime error message.',
  },
  {
    origin: 'https://apps.microsoft.com',
    kind: 'inert',
    why: 'The Store listing, printed in the About box so a user can say which build they have. Never opened: open_external_url refuses every host but pdfluent.com.',
  },
];

/**
 * Host families the ADVISORY binary scan does not bother a reader with.
 *
 * Both are certainly names rather than addresses, and both arrive without
 * anybody in this repository writing them: XML and RDF namespace identifiers
 * come in with any document toolchain, and Apple's certificate hosts are baked
 * into the system frameworks a signed macOS binary links. An entry here silences
 * a line in a report; it grants nothing, because the binary scan grants nothing.
 */
export const BINARY_IGNORED = [
  { host: 'ns.adobe.com', why: 'XMP namespace identifier.' },
  { host: 'purl.org', why: 'Dublin Core and RDF namespace identifiers.' },
  { host: 'w3.org', why: 'XML, SVG, RDF and XMP namespace identifiers.' },
  { host: 'xmlns.com', why: 'FOAF namespace identifier.' },
  { host: 'iptc.org', why: 'IPTC photo-metadata namespace identifier.' },
  { host: 'aiim.org', why: 'PDF/A namespace identifier.' },
  { host: 'openoffice.org', why: 'ODF namespace identifier.' },
  { host: 'openxmlformats.org', why: 'OOXML namespace identifier.' },
  { host: 'oasis-open.org', why: 'OASIS namespace identifier.' },
  { host: 'apple.com', why: "Apple's OCSP, CRL and certificate-authority hosts, linked in by the system frameworks a signed build uses." },
  { host: 'digicert.com', why: 'Certificate-chain and timestamp hosts carried in the signature material.' },
  { host: 'sectigo.com', why: 'Certificate-chain host carried in the signature material.' },
  { host: 'verisign.com', why: 'Legacy certificate-chain host carried in the signature material.' },
  { host: 'entrust.net', why: 'Legacy certificate-chain host carried in the signature material.' },
];

/** True when `origin`'s host is one of the ignored families, or under it. */
export function ignoredInBinary(origin) {
  const host = String(origin).replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
  return BINARY_IGNORED.some(({ host: h }) => host === h || host.endsWith(`.${h}`));
}

const ALLOWED_ORIGINS = new Set(ALLOWED.map((entry) => entry.origin));

/**
 * What a run with no `--tree` of its own gates: the built frontend and the
 * backend sources. Exported so a test can state the list without depending on
 * which of the two happens to exist on the machine running it -- `dist` is
 * built on one runner and absent on the others, and a test that only ever saw
 * the machine with a build in it is how this list got read as scanned when it
 * was not.
 */
export const DEFAULT_TREES = ['dist', 'src-tauri/src'];

// A host is letters, digits, dots and dashes -- deliberately strict, so an
// interpolated `https://${host}` or a truncated string in a binary does not
// register as a host we then have to explain.
const URL_RE = /\bhttps?:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?/g;

/** Scheme + host for every URL literal in `text`, de-duplicated, sorted. */
export function extractOrigins(text) {
  const found = new Set();
  for (const match of text.matchAll(URL_RE)) {
    const origin = match[0];
    // A bare "https://x" with a single character host is noise from a binary.
    if (origin.replace(/^https?:\/\//, '').length < 2) continue;
    found.add(origin);
  }
  return [...found].sort();
}

/** The origins from `list` that nothing declared. */
export function violations(list) {
  return [...new Set(list)].filter((origin) => !ALLOWED_ORIGINS.has(origin)).sort();
}

// ── The Rust side, without building it ───────────────────────────────────────
// A release executable carries string literals from every crate in the tree,
// including documentation links in error messages of dependencies we never
// call. Scanning one is worth doing (see --binary below) but it needs a
// reviewed baseline, and a baseline needs a build. These three checks are what
// can be decided from the sources on every push, and they cover the ways the
// backend could actually acquire an address: the updater feed it fetches, the
// policy that decides what the webview may connect to, and whether an HTTP
// client is compiled in at all.

const HTTP_CLIENT_CRATES = [
  'reqwest',
  'ureq',
  'hyper',
  'curl',
  'isahc',
  'attohttpc',
  'surf',
  'awc',
];

/** Origins the updater is configured to fetch that nobody declared. */
export function checkUpdaterEndpoints(config) {
  const endpoints = config?.plugins?.updater?.endpoints ?? [];
  const reachable = new Set(
    ALLOWED.filter((entry) => entry.kind === 'endpoint').map((entry) => entry.origin),
  );
  return endpoints
    .flatMap((url) => extractOrigins(String(url)))
    .filter((origin) => !reachable.has(origin))
    .sort();
}

/**
 * Sources in the webview's `connect-src` that are neither a declared origin nor
 * a local one. `self`, `ipc:` and the localhost dev-server entries are local by
 * definition; anything else is a host the frontend is permitted to reach.
 */
export function checkConnectSrc(csp) {
  const directive = String(csp ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect-src '));
  if (!directive) return ["connect-src is missing from the CSP"];

  const local = /^(?:'self'|ipc:|(?:https?|ws):\/\/(?:localhost|127\.0\.0\.1|ipc\.localhost|asset\.localhost)(?::\d+)?)$/;
  const reachable = new Set(
    ALLOWED.filter((entry) => entry.kind === 'endpoint').map((entry) => entry.origin),
  );
  return directive
    .slice('connect-src '.length)
    .split(/\s+/)
    .filter(Boolean)
    .filter((source) => !local.test(source) && !reachable.has(source))
    .sort();
}

/**
 * HTTP client crates declared as a direct dependency of the desktop app. The
 * updater plugin brings its own transitively and that is the one exception the
 * product makes; a direct dependency here would be a new way out of the
 * machine, added without anyone having to write the word "http".
 */
export function checkNoHttpClient(cargoToml) {
  const found = [];
  let inDeps = false;
  for (const raw of cargoToml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inDeps = /^\[(?:build-)?dependencies(?:\.|])/.test(line) || /^\[target\..*dependencies]$/.test(line);
      const named = line.match(/^\[(?:build-)?dependencies\.([A-Za-z0-9_-]+)]$/);
      if (named && HTTP_CLIENT_CRATES.includes(named[1])) found.push(named[1]);
      continue;
    }
    if (!inDeps) continue;
    const name = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (name && HTTP_CLIENT_CRATES.includes(name[1])) found.push(name[1]);
  }
  return [...new Set(found)].sort();
}

/**
 * A Rust source with its `#[cfg(test)]` modules removed.
 *
 * Test code is not shipped code, and backend tests name hosts on purpose: the
 * case that proves `open_external_url` refuses everything but pdfluent.com has
 * to write down a host it refuses. Scanning those as origins the product
 * carries would force the allow-list to declare `https://evil.com` -- and an
 * allow-list that declares it stops failing when it turns up in dist/, which is
 * the one place it would matter.
 *
 * Brace counting, skipping string literals and line comments so a brace inside
 * a string does not end the module early.
 */
export function stripRustTestModules(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf('#[cfg(test)]', i);
    if (at === -1) { out += source.slice(i); break; }
    out += source.slice(i, at);
    // From the attribute to the `{` that opens the item it guards.
    let j = source.indexOf('{', at);
    if (j === -1) { out += source.slice(at); break; }
    let depth = 0;
    for (; j < source.length; j++) {
      const c = source[j];
      if (c === '"') {
        j++;
        while (j < source.length && source[j] !== '"') { if (source[j] === '\\') j++; j++; }
        continue;
      }
      if (c === '/' && source[j + 1] === '/') {
        const nl = source.indexOf('\n', j);
        if (nl === -1) { j = source.length; break; }
        j = nl;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    i = j;
  }
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Scan every file under `dir`. Returns origin -> the files it was found in,
 * paths relative to `dir` so the message is readable and machine-independent.
 */
export function scanTree(dir) {
  const found = new Map();
  for (const file of walk(dir)) {
    const raw = readFileSync(file, 'latin1');
    const text = file.endsWith('.rs') ? stripRustTestModules(raw) : raw;
    for (const origin of extractOrigins(text)) {
      const where = found.get(origin) ?? [];
      where.push(relative(dir, file));
      found.set(origin, where);
    }
  }
  return found;
}

/**
 * Scan one executable. Read as latin1 so every byte maps to a character and a
 * URL between two unprintable bytes still matches.
 */
export function scanBinary(file) {
  const found = new Map();
  // Named relative to the repository, or by its basename when it is outside
  // one: a report that quotes an absolute path quotes the machine it ran on.
  const rel = relative(root, file);
  const where = rel.startsWith('..') ? file.split('/').pop() : rel;
  for (const origin of extractOrigins(readFileSync(file, 'latin1'))) {
    found.set(origin, [where]);
  }
  return found;
}

function report(label, found) {
  const bad = violations([...found.keys()]);
  const declared = [...found.keys()].filter((o) => ALLOWED_ORIGINS.has(o));
  console.log(`${label}: ${found.size} origins, ${declared.length} declared, ${bad.length} undeclared`);
  for (const origin of [...found.keys()].sort()) {
    const mark = ALLOWED_ORIGINS.has(origin) ? '  ok  ' : ' FAIL ';
    console.log(`${mark}${origin}  (${[...new Set(found.get(origin))].slice(0, 3).join(', ')})`);
  }
  return bad;
}

/**
 * The binary, reported and not judged. Nothing here reaches the exit code: the
 * word on each line is ADVISORY, never FAIL, so a reader is not invited to
 * treat it as a verdict somebody forgot to act on.
 */
function reportAdvisory(label, found) {
  const origins = [...found.keys()].sort();
  const undeclared = origins.filter((o) => !ALLOWED_ORIGINS.has(o) && !ignoredInBinary(o));
  const ignored = origins.filter((o) => ignoredInBinary(o));
  console.log(
    `ADVISORY ${label}: ${origins.length} origins, ` +
      `${origins.length - undeclared.length - ignored.length} declared, ` +
      `${ignored.length} known-inert, ${undeclared.length} undeclared (not gating)`,
  );
  for (const origin of undeclared) {
    console.log(`  ADVISORY  ${origin}  (${[...new Set(found.get(origin))].slice(0, 3).join(', ')})`);
  }
  if (undeclared.length) {
    console.log(
      '  A binary carries the string literals of every crate and framework it links.\n' +
        '  These are worth a look and nothing more; the gate is the dist/ and\n' +
        '  src-tauri/src/ scan above.',
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const trees = [];
  const binaries = [];
  let config = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tree') trees.push(argv[++i]);
    else if (argv[i] === '--binary') binaries.push(argv[++i]);
    else if (argv[i] === '--config') config = true;
    else {
      console.error(`OFFLINE-ALLOWLIST: unknown argument ${argv[i]}`);
      return 2;
    }
  }
  if (trees.length === 0 && binaries.length === 0 && !config) {
    trees.push(...DEFAULT_TREES);
    config = true;
  }

  let bad = [];
  let checked = 0;

  if (config) {
    const conf = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
    const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');

    const updater = checkUpdaterEndpoints(conf);
    const connect = checkConnectSrc(conf?.app?.security?.csp);
    const clients = checkNoHttpClient(cargo);

    console.log(
      `config: updater endpoints ${updater.length ? 'FAIL' : 'ok'}, ` +
        `connect-src ${connect.length ? 'FAIL' : 'ok'}, ` +
        `no http client ${clients.length ? 'FAIL' : 'ok'}`,
    );
    if (updater.length) console.error(` FAIL updater fetches an undeclared origin: ${updater.join(', ')}`);
    if (connect.length) console.error(` FAIL connect-src permits an undeclared source: ${connect.join(', ')}`);
    if (clients.length) console.error(` FAIL an HTTP client is a direct dependency: ${clients.join(', ')}`);
    bad = bad.concat(updater, connect, clients);
    checked++;
  }

  // Every tree is scanned, and a missing one is remembered rather than thrown.
  //
  // This used to exit on the first absent directory, which made the ORDER of
  // the arguments decide what got looked at: `dist` is built on the frontend
  // runner and absent everywhere else, so on the Linux CI runner the default
  // run stopped at `dist` and the backend sources -- the half that is always
  // present -- were never scanned at all. The run still fails, at the end, and
  // names what it could not reach; what it changes is that everything it CAN
  // reach is judged first. (Trunk run on 1a552cfe, 2026-09-15.)
  const unreachable = [];
  for (const tree of trees) {
    const dir = resolve(root, tree);
    if (!existsSync(dir)) {
      unreachable.push(tree);
      continue;
    }
    bad = bad.concat(report(`tree ${tree}`, scanTree(dir)));
    checked++;
  }

  for (const binary of binaries) {
    const file = resolve(root, binary);
    if (!existsSync(file)) {
      // Only the build stage has an executable. Saying so out loud is the
      // difference between "not checked here" and a silent pass.
      console.error(`SKIPPED (not a pass): no executable at ${binary}`);
      continue;
    }
    // Reported, never gated. `bad` is deliberately not touched here. The label
    // is the name, not the path: a report that quotes an absolute path quotes
    // the machine it ran on.
    reportAdvisory(`binary ${file.split('/').pop()}`, scanBinary(file));
    checked++;
  }

  if (checked === 0 && unreachable.length === 0) {
    // Exit 3, not 0. Every target named was absent, so this run judged
    // nothing, and a caller reading the status has to be able to tell that
    // from a clean scan.
    console.error('SKIPPED (not a pass): nothing to scan');
    return 3;
  }

  // A tree that was named and is not there is a failure, not a skip: somebody
  // asked for it to be gated. `dist` is the usual one, and the answer is
  // usually `npm run build`.
  if (unreachable.length > 0) {
    console.error(
      `\nOFFLINE-ALLOWLIST: ${unreachable.join(', ')} does not exist, so nothing in it was scanned` +
        `${unreachable.includes('dist') ? ' -- run npm run build first' : ''}`,
    );
  }

  if (bad.length > 0) {
    console.error(
      `\nOFFLINE-ALLOWLIST: ${bad.length} undeclared origin(s): ${[...new Set(bad)].join(', ')}\n` +
        'The app promises to work offline and to talk to nothing but pdfluent.com.\n' +
        'This origin is in the built frontend or in the backend sources, so it is\n' +
        'in this repository on purpose. If it is genuinely inert (a namespace, a\n' +
        'documentation link in a dependency error message, copy in a dialog),\n' +
        'declare it in scripts/ci/offline-allowlist.mjs and in\n' +
        'docs/OUTBOUND_ENDPOINTS.md with the reason. If it is an endpoint, it does\n' +
        'not ship.\n',
    );
  }

  if (bad.length > 0 || unreachable.length > 0) return 1;

  console.log('OFFLINE-ALLOWLIST: every origin that ships is declared.');
  return 0;
}

// exitCode, not exit(): a write to a pipe is asynchronous, and process.exit()
// drops whatever libuv has not handed to the kernel yet. See
// tests/ci/guards-flush-before-exit.test.ts.
if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
