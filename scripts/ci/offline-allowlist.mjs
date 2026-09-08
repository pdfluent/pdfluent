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
// What this checks, and why it is a scan and not a source assertion: a URL can
// arrive from a transitive dependency, a minifier can inline one, and Rust
// bakes string literals from every crate into the executable. Reading our own
// sources would answer for our own sources only. So this reads what ships --
// the built bundle, and the release executable when one exists.
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
//   node scripts/ci/offline-allowlist.mjs --tree dist
//   node scripts/ci/offline-allowlist.mjs --binary src-tauri/target/release/pdfluent
//   node scripts/ci/offline-allowlist.mjs --tree dist --binary <path> --binary <path>
//
// A missing --binary target is reported as SKIPPED (not a pass). It does not
// fail a run that also scanned a tree -- something was judged -- but a run with
// nothing left to judge exits 3, never 0, so a caller can tell "clean" from
// "did not look". A gate that quietly checks nothing is the thing this
// repository has been burned by three times.
//
// Exit codes: 0 everything scanned is declared, 1 an undeclared origin ships,
// 2 bad arguments, 3 nothing was scanned.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
];

const ALLOWED_ORIGINS = new Set(ALLOWED.map((entry) => entry.origin));

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
    const text = readFileSync(file, 'latin1');
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
  for (const origin of extractOrigins(readFileSync(file, 'latin1'))) {
    found.set(origin, [relative(root, file)]);
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
      process.exit(2);
    }
  }
  if (trees.length === 0 && binaries.length === 0 && !config) {
    trees.push('dist');
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

  for (const tree of trees) {
    const dir = resolve(root, tree);
    if (!existsSync(dir)) {
      console.error(`OFFLINE-ALLOWLIST: ${tree} does not exist -- run npm run build first`);
      process.exit(1);
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
    bad = bad.concat(report(`binary ${binary}`, scanBinary(file)));
    checked++;
  }

  if (checked === 0) {
    // Exit 3, not 0. Every target named was absent, so this run judged
    // nothing, and a caller reading the status has to be able to tell that
    // from a clean scan.
    console.error('SKIPPED (not a pass): nothing to scan');
    process.exit(3);
  }

  if (bad.length > 0) {
    console.error(
      `\nOFFLINE-ALLOWLIST: ${bad.length} undeclared origin(s): ${[...new Set(bad)].join(', ')}\n` +
        'The app promises to work offline and to talk to nothing but pdfluent.com.\n' +
        'If this origin is genuinely inert (a namespace, a documentation link in a\n' +
        'dependency error message), declare it in scripts/ci/offline-allowlist.mjs\n' +
        'and in docs/OUTBOUND_ENDPOINTS.md with the reason. If it is an endpoint,\n' +
        'it does not ship.\n',
    );
    process.exit(1);
  }

  console.log('OFFLINE-ALLOWLIST: every origin that ships is declared.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
