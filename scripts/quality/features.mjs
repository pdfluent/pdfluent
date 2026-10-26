// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * What the editor promises, and whether this run proved it.
 *
 * WHY THIS EXISTS
 *
 * The website, both store listings and the README promised features that no
 * test exercised, and pages contradicted each other about the same feature:
 * one said the editor exports to Word, the comparison page said it does not.
 * Each page was written from memory, at a different time, by hand. The UI
 * register (docs/UI_REGISTER.md) already keeps the controls honest; nothing
 * kept the promises honest.
 *
 * product/editor-features.json is now the one place a promise is written down.
 * The site and the stores read a copy published from it (--publish), so a page
 * cannot say more than the file. And the file cannot say more than the tests:
 *
 *   --check   the file is well formed, every journey and register reference
 *             exists, every number in the copy carries a CLAIMS.md id, and the
 *             pending-proof ratchet holds (below).
 *
 *   --gate --platform <macos-arm64|windows-x64> --junit <xml>... [--cargo-log <log>]...
 *          [--journey-results <dir>] [--skip-journeys | --only-journeys]
 *             every `promised` or `preview` feature that names platform <p> in
 *             its tests has each of those tests PASS in this run's results.
 *             SKIPPED is not a pass. A test the results do not mention is not a
 *             pass. Each failure names the feature and the test.
 *
 *   --publish <out> [--commit <sha>]
 *             write the copy the website reads: promised, preview,
 *             pending-proof and not-offered features with their copy, status
 *             and limits. Deterministic: the same input writes the same bytes.
 *
 * PENDING-PROOF IS A RATCHET, NOT AN OVERRIDE
 *
 * The owner decided on 17-10-2026 that public promises stay on the site while
 * the tests that prove them are written. Those features are `pending-proof`:
 * promised in public, not gated yet. The set is pinned in
 * `pending_proof_ceiling`, and it can only shrink:
 *   - a feature that is pending-proof and not in the ceiling fails --check
 *     (nothing new may enter, and a promised feature may not fall back);
 *   - an id in the ceiling that is no longer pending-proof fails --check
 *     (the ceiling shrinks in the same change that proves the feature);
 *   - with --base <git-ref>, a ceiling that holds an id the base's ceiling
 *     did not hold fails --check (the list cannot be extended by editing it).
 * There is no environment variable, flag or file that skips any of this.
 *
 * docs/JOURNEY_TESTS.json (written by the e2e stream) adds the tests per
 * journey. When it is absent, only the tests listed in the features file
 * count, and the gate says so on stderr every run. The contract is in
 * product/README.md.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/main-module.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolvePath(HERE, '..', '..');

export const FEATURES_PATH = 'product/editor-features.json';
export const JOURNEYS_PATH = 'product/journeys.json';
export const JOURNEY_TESTS_PATH = 'docs/JOURNEY_TESTS.json';
export const REGISTER_PATH = 'docs/UI_REGISTER.md';
export const EXCLUSIONS_PATH = 'tests/platform-exclusions.json';

export const STATUSES = ['promised', 'preview', 'pending-proof', 'not-offered', 'retired'];
export const PUBLISHED_STATUSES = ['promised', 'preview', 'pending-proof', 'not-offered'];
export const GATED_STATUSES = ['promised', 'preview'];
export const KINDS = ['e2e-real-app', 'rust', 'unit-behaviour', 'playwright-mock'];
/**
 * The platforms a promise is made on. The editor ships on macOS and Windows
 * only (owner decision 18-10-2026: Linux is not supported), so a test may name
 * nothing else and --gate judges nothing else. Linux jobs run their own tests
 * and never feed this gate.
 */
export const PLATFORMS = ['macos-arm64', 'windows-x64'];
/** A promise is proven on both or it is not proven. */
export const SHIPPING_PLATFORMS = PLATFORMS;
export const STREAMS = ['A', 'B', 'C', 'D'];

/** The Node platform name each test platform runs vitest under. */
const NODE_PLATFORM = { 'macos-arm64': 'darwin', 'windows-x64': 'win32' };

const FEATURE_KEYS = ['id', 'group', 'journeys', 'register', 'tests', 'status', 'owner_stream', 'limits', 'copy', 'since', 'note'];
const TEST_KEYS = ['id', 'kind', 'platforms'];
const COPY_KEYS = ['name', 'site', 'store_bullet', 'claims'];
const CLAIM_ID = /^[A-Z][0-9]{2}$/;
const FEATURE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SINCE = /^\d+\.\d+\.\d+$/;

// ─── Reading ────────────────────────────────────────────────────────────────

export function readJson(rel, repo = REPO) {
  return JSON.parse(readFileSync(resolvePath(repo, rel), 'utf8'));
}

/**
 * The UI register as {`<section>:<id>`: state}.
 *
 * Section prefixes are the ones the website's export already uses, so a
 * reference copied from the site's features file means the same thing here.
 */
export const REGISTER_SECTIONS = {
  'All-tools tiles': 'tiles',
  'Right-hand panels': 'panels',
  'Mode tabs': 'modes',
  'Left rail tools': 'rail',
  'Command palette': 'palette',
  'Buttons with a test id': 'buttons',
  'Advertised keyboard shortcuts': 'shortcuts',
  'LeftNavRail panels': 'nav',
  'ModeSwitcher tabs': 'switcher',
};

export function parseRegister(markdown) {
  const out = {};
  let prefix = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) {
      prefix = REGISTER_SECTIONS[heading[1]] ?? null;
      continue;
    }
    if (!prefix || !line.startsWith('| `')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const id = /^`(.*)`$/.exec(cells[0])?.[1];
    const state = /^`(.*)`$/.exec(cells[1] ?? '')?.[1];
    if (id && state) out[`${prefix}:${id}`] = state;
  }
  return out;
}

// ─── --check ────────────────────────────────────────────────────────────────

function copyStrings(feature) {
  const out = [];
  const copy = feature.copy ?? {};
  if (typeof copy.name === 'string') out.push(['copy.name', copy.name]);
  if (typeof copy.site === 'string') out.push(['copy.site', copy.site]);
  if (typeof copy.store_bullet === 'string') out.push(['copy.store_bullet', copy.store_bullet]);
  for (const [i, limit] of (feature.limits ?? []).entries()) {
    if (typeof limit === 'string') out.push([`limits[${i}]`, limit]);
  }
  return out;
}

function shape(feature, where, problems) {
  for (const key of Object.keys(feature)) {
    if (!FEATURE_KEYS.includes(key)) problems.push(`${where}: unknown key "${key}" (allowed: ${FEATURE_KEYS.join(', ')}).`);
  }
  if (!Array.isArray(feature.journeys)) problems.push(`${where}: "journeys" must be an array of J-ids.`);
  if (!Array.isArray(feature.register)) problems.push(`${where}: "register" must be an array (may be empty).`);
  if (!Array.isArray(feature.tests)) problems.push(`${where}: "tests" must be an array (may be empty).`);
  if (!Array.isArray(feature.limits)) problems.push(`${where}: "limits" must be an array of sentences (may be empty).`);
  if (!feature.copy || typeof feature.copy !== 'object') {
    problems.push(`${where}: "copy" must be an object with name, site, store_bullet and claims.`);
  } else {
    for (const key of Object.keys(feature.copy)) {
      if (!COPY_KEYS.includes(key)) problems.push(`${where}: unknown copy key "${key}".`);
    }
    for (const key of ['name', 'site', 'store_bullet']) {
      const v = feature.copy[key];
      if (v !== null && typeof v !== 'string') problems.push(`${where}: copy.${key} must be a sentence or null.`);
      if (typeof v === 'string' && !v.trim()) problems.push(`${where}: copy.${key} is empty; write null instead.`);
    }
    if (!Array.isArray(feature.copy.claims)) problems.push(`${where}: copy.claims must be an array of CLAIMS.md ids.`);
  }
  if (feature.since !== null && !(typeof feature.since === 'string' && SINCE.test(feature.since))) {
    problems.push(`${where}: "since" must be a version like "1.0.0", or null for a feature that never shipped.`);
  }
}

/**
 * Everything wrong with the features file, as sentences. Takes documents, not
 * paths, so the tests can hand it fixtures.
 *
 * @param {object} doc            product/editor-features.json
 * @param {object} ctx
 * @param {string[]} ctx.journeys the J-ids in the catalogue
 * @param {Record<string,string>} ctx.register  parseRegister() of docs/UI_REGISTER.md
 * @param {Record<string,Record<string,string>>} [ctx.exclusions]  tests/platform-exclusions.json
 * @param {object|null|undefined} [ctx.base]  the features file at --base; null = absent there
 * @param {object|null} [ctx.journeyTests]  docs/JOURNEY_TESTS.json, or null when absent
 */
export function checkFeatures(doc, ctx) {
  const problems = [];
  const journeys = new Set(ctx.journeys);
  const register = ctx.register ?? {};
  const exclusions = ctx.exclusions ?? {};

  if (doc?.schema !== 2) problems.push(`${FEATURES_PATH}: "schema" must be 2.`);
  const groups = new Set((doc?.groups ?? []).map((g) => g.id));
  if (!groups.size) problems.push(`${FEATURES_PATH}: "groups" lists no group.`);
  for (const g of doc?.groups ?? []) {
    if (!g.id || !g.title?.trim()) problems.push(`${FEATURES_PATH}: every group needs an id and a title.`);
  }
  const features = Array.isArray(doc?.features) ? doc.features : [];
  if (!features.length) problems.push(`${FEATURES_PATH}: "features" is empty; an empty file promises nothing and proves nothing.`);
  if (!Array.isArray(doc?.pending_proof_ceiling)) {
    problems.push(`${FEATURES_PATH}: "pending_proof_ceiling" must be an array of feature ids (it may be empty).`);
  }

  const seen = new Set();
  for (const feature of features) {
    const where = `${FEATURES_PATH}: feature "${feature?.id ?? '?'}"`;
    if (!feature || typeof feature !== 'object') {
      problems.push(`${FEATURES_PATH}: a feature entry is not an object.`);
      continue;
    }
    if (!FEATURE_ID.test(feature.id ?? '')) problems.push(`${where}: id must be lower-case kebab-case.`);
    if (seen.has(feature.id)) problems.push(`${where}: id appears twice.`);
    seen.add(feature.id);
    shape(feature, where, problems);
    if (!groups.has(feature.group)) problems.push(`${where}: group "${feature.group}" is not one of the declared groups.`);
    if (!STATUSES.includes(feature.status)) {
      problems.push(`${where}: status "${feature.status}" is not one of ${STATUSES.join(', ')}.`);
    }

    const js = Array.isArray(feature.journeys) ? feature.journeys : [];
    for (const j of js) {
      if (!journeys.has(j)) problems.push(`${where}: journey "${j}" is not in ${JOURNEYS_PATH}.`);
    }
    if (!js.length && !['not-offered', 'retired'].includes(feature.status)) {
      problems.push(`${where}: names no journey. A ${feature.status} feature is something a person does; say which journey.`);
    }

    for (const ref of Array.isArray(feature.register) ? feature.register : []) {
      const state = register[ref];
      if (!state) {
        problems.push(`${where}: register reference "${ref}" is not in ${REGISTER_PATH}. Renamed, or a typo.`);
      } else if (GATED_STATUSES.includes(feature.status) && (state === 'NO ACTION' || state === 'UNREACHABLE')) {
        problems.push(`${where}: is ${feature.status} and points at "${ref}", which is \`${state}\` in the register: a control that does nothing cannot carry a promise.`);
      }
    }

    const tests = Array.isArray(feature.tests) ? feature.tests : [];
    for (const t of tests) {
      for (const key of Object.keys(t ?? {})) {
        if (!TEST_KEYS.includes(key)) problems.push(`${where}: test "${t.id}" has unknown key "${key}".`);
      }
      if (!t?.id?.trim()) problems.push(`${where}: a test has no id.`);
      if (!KINDS.includes(t?.kind)) problems.push(`${where}: test "${t?.id}" kind "${t?.kind}" is not one of ${KINDS.join(', ')}.`);
      if (!Array.isArray(t?.platforms) || !t.platforms.length) {
        problems.push(`${where}: test "${t?.id}" names no platform.`);
      } else {
        for (const p of t.platforms) {
          if (!PLATFORMS.includes(p)) problems.push(`${where}: test "${t.id}" platform "${p}" is not one of ${PLATFORMS.join(', ')}.`);
          // A vitest file left out on a platform cannot pass there.
          const file = String(t.id).split('::')[0];
          const excluded = exclusions[NODE_PLATFORM[p]] ?? {};
          if (t.kind !== 'rust' && Object.prototype.hasOwnProperty.call(excluded, file)) {
            problems.push(`${where}: test "${t.id}" claims ${p}, and ${EXCLUSIONS_PATH} leaves ${file} out on ${NODE_PLATFORM[p]}. It can never pass there.`);
          }
        }
      }
    }

    if (GATED_STATUSES.includes(feature.status)) {
      for (const p of SHIPPING_PLATFORMS) {
        const proving = tests.filter((t) => t.platforms?.includes(p) && t.kind !== 'playwright-mock');
        if (!proving.length) {
          problems.push(`${where}: is ${feature.status} with no test on ${p} that runs the real code (a playwright-mock test alone proves the mock). Add one, or make it pending-proof inside the ceiling.`);
        }
      }
    }
    if (feature.status === 'pending-proof') {
      if (!STREAMS.includes(feature.owner_stream)) {
        problems.push(`${where}: is pending-proof and names no owner_stream (${STREAMS.join(', ')}): who makes it true?`);
      }
    } else if (feature.owner_stream !== undefined) {
      problems.push(`${where}: owner_stream belongs to pending-proof features only.`);
    }
    if (PUBLISHED_STATUSES.includes(feature.status) && (typeof feature.copy?.site !== 'string' || typeof feature.copy?.name !== 'string')) {
      problems.push(`${where}: is ${feature.status} and lacks copy.name or copy.site. A published status needs the name and the sentence the site shows.`);
    }

    const claims = Array.isArray(feature.copy?.claims) ? feature.copy.claims : [];
    for (const c of claims) {
      if (!CLAIM_ID.test(c)) problems.push(`${where}: "${c}" is not a CLAIMS.md id (one capital letter and two digits).`);
    }
    for (const [field, text] of copyStrings(feature)) {
      if (/\d/.test(text) && !claims.length) {
        problems.push(`${where}: ${field} contains a number ("${text}") and copy.claims is empty. A digit in public copy needs a CLAIMS.md id.`);
      }
    }
  }

  // The ratchet.
  const ceiling = Array.isArray(doc?.pending_proof_ceiling) ? doc.pending_proof_ceiling : [];
  const pending = features.filter((f) => f.status === 'pending-proof').map((f) => f.id);
  const ids = new Set(features.map((f) => f.id));
  if (new Set(ceiling).size !== ceiling.length) problems.push(`${FEATURES_PATH}: pending_proof_ceiling lists an id twice.`);
  for (const id of pending) {
    if (!ceiling.includes(id)) {
      problems.push(`pending-proof ratchet: "${id}" is pending-proof and not in pending_proof_ceiling. Nothing new enters pending-proof, and a promised feature does not fall back to it: prove it, or take the promise down.`);
    }
  }
  for (const id of ceiling) {
    if (!ids.has(id)) {
      problems.push(`pending-proof ratchet: pending_proof_ceiling names "${id}", which is not a feature. Remove it from the ceiling.`);
    } else if (!pending.includes(id)) {
      problems.push(`pending-proof ratchet: "${id}" is in pending_proof_ceiling and no longer pending-proof. Remove it from the ceiling in this change, so it cannot fall back later.`);
    }
  }
  if (ctx.base !== undefined && ctx.base !== null) {
    const before = new Set(Array.isArray(ctx.base.pending_proof_ceiling) ? ctx.base.pending_proof_ceiling : []);
    for (const id of ceiling) {
      if (!before.has(id)) {
        problems.push(`pending-proof ratchet: "${id}" was added to pending_proof_ceiling (it is not in the base's ceiling). The ceiling only shrinks.`);
      }
    }
  }

  if (ctx.journeyTests) problems.push(...checkJourneyTests(ctx.journeyTests, journeys));
  return problems;
}

/**
 * docs/JOURNEY_TESTS.json, in the shape the e2e stream writes it:
 *   { schema: 1, platforms: {...}, journeys: { "J-xx": { title, priority,
 *     spec: <test file> | null, platforms: [...], gaps: [{ id, owner, reason, platforms? }] } } }
 * A journey with a spec and no gap on a platform is a real-app test that must
 * pass there; a gap means not proven. Per-run results come from
 * journey-results/<platform>/<J-id>.json (scripts/quality/journey-results.mjs).
 */
export function checkJourneyTests(doc, journeys) {
  const problems = [];
  const where = JOURNEY_TESTS_PATH;
  if (doc?.schema !== 1) problems.push(`${where}: "schema" must be 1.`);
  if (!doc?.journeys || typeof doc.journeys !== 'object' || Array.isArray(doc.journeys)) {
    problems.push(`${where}: "journeys" must be an object keyed by J-id.`);
    return problems;
  }
  for (const [j, entry] of Object.entries(doc.journeys)) {
    if (!journeys.has(j)) problems.push(`${where}: "${j}" is not in ${JOURNEYS_PATH}.`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where}: "${j}" must be an object with spec, platforms and gaps.`);
      continue;
    }
    if (entry.spec !== null && !(typeof entry.spec === 'string' && entry.spec.trim())) {
      problems.push(`${where}: "${j}" spec must be a test file or null.`);
    }
    if (!Array.isArray(entry.platforms) || entry.platforms.some((p) => !PLATFORMS.includes(p))) {
      problems.push(`${where}: "${j}" needs platforms from ${PLATFORMS.join(', ')}.`);
    }
    if (!Array.isArray(entry.gaps)) {
      problems.push(`${where}: "${j}" gaps must be an array (empty when nothing is known to fail).`);
    } else {
      for (const g of entry.gaps) {
        if (!g?.id?.trim() || !g?.owner?.trim()) problems.push(`${where}: "${j}" has a gap without an id or an owner.`);
      }
    }
  }
  return problems;
}

/** The gaps of a journey that apply on one platform. */
export function gapsOn(entry, platform) {
  return (entry?.gaps ?? []).filter((g) => !g.platforms || g.platforms.includes(platform));
}

// ─── Results ────────────────────────────────────────────────────────────────

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : undefined;
}

const RANK = { pass: 0, skipped: 1, fail: 2 };
function worse(a, b) {
  return a === undefined || RANK[b] > RANK[a] ? b : a;
}

/**
 * A JUnit file as [{file, name, status}]. `file` is the testcase classname with
 * forward slashes (vitest writes the spec path there), `name` the full title
 * with " > " between describe blocks, `status` pass | skipped | fail.
 */
export function parseJunit(xml) {
  const out = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const head = m[1];
    const body = m[3] ?? '';
    const file = (attr(head, 'classname') ?? attr(head, 'file') ?? '').replace(/\\/g, '/');
    const name = attr(head, 'name') ?? '';
    let status = 'pass';
    if (/<(failure|error)\b/.test(body)) status = 'fail';
    else if (/<skipped\b/.test(body)) status = 'skipped';
    out.push({ file, name, status });
  }
  return out;
}

/**
 * `cargo test` output as {`<binary>::<test path>`: status}.
 *
 * <binary> is the test executable without its hash, as cargo names it on the
 * "Running" line: `pdfluent_lib` for unit tests in src/lib.rs, the file stem
 * for tests/<name>.rs. With --nocapture a test's own output can land between
 * "test x ... " and its verdict, so a name whose verdict is not on its line is
 * held until a bare verdict line arrives.
 */
export function parseCargoLog(text) {
  return scanCargoLog(text).results;
}

/**
 * parseCargoLog plus what it takes to name why a test is absent:
 * `binaries` (every test executable cargo ran), `named` (every `<binary>::<test>`
 * that has a "test x ..." line) and `unfinished` (named, but no verdict line
 * followed, e.g. the process died mid-test).
 *
 * A test's own output can sit on the same line as "test x ... " (the Windows
 * runner shows `test x ... XFA script metadata: ...`), so any text after the
 * dots that is not a verdict starts a pending test; its bare verdict line comes
 * later.
 */
export function scanCargoLog(text) {
  const results = {};
  const binaries = new Set();
  const named = new Set();
  let binary = null;
  let pendingName = null;
  const verdict = (raw) => (raw === 'ok' ? 'pass' : raw.startsWith('ignored') ? 'skipped' : 'fail');
  const put = (name, raw) => {
    if (!binary) return;
    const key = `${binary}::${name}`;
    results[key] = worse(results[key], verdict(raw));
  };
  const name = (n) => {
    if (binary) named.add(`${binary}::${n}`);
  };
  for (const line of text.split(/\r?\n/)) {
    const running = /^\s*Running (?:unittests )?\S+ \((?:.*[\\/])?([A-Za-z0-9_]+)-[0-9a-f]+(?:\.exe)?\)/.exec(line);
    if (running) {
      binary = running[1];
      binaries.add(binary);
      pendingName = null;
      continue;
    }
    const doc = /^\s*Doc-tests (\S+)/.exec(line);
    if (doc) {
      binary = `doc:${doc[1]}`;
      binaries.add(binary);
      pendingName = null;
      continue;
    }
    const full = /^\s*test (.+?) \.\.\. (ok|FAILED|ignored(?:, .*)?)\s*$/.exec(line);
    if (full) {
      name(full[1]);
      put(full[1], full[2]);
      pendingName = null;
      continue;
    }
    const start = /^\s*test (.+?) \.\.\.(?: .*)?$/.exec(line);
    if (start) {
      name(start[1]);
      pendingName = start[1];
      continue;
    }
    const late = /^(ok|FAILED|ignored(?:, .*)?)\s*$/.exec(line.trim());
    if (late && pendingName) {
      put(pendingName, late[1]);
      pendingName = null;
    }
  }
  const unfinished = [...named].filter((k) => !(k in results));
  return { results, binaries, named, unfinished };
}

/**
 * Why a Rust test id is absent, from what the cargo logs showed. Three causes
 * need three different fixes: the binary never ran (not compiled, cfg-gated,
 * crashed before it, or its --test filter), the binary ran but never listed the
 * test (renamed, moved, cfg-gated off this platform, or filtered by name), or
 * the test started and no verdict followed (killed or output swallowed).
 */
export function explainAbsentRust(id, facts) {
  if (!facts) return '';
  const i = id.indexOf('::');
  const bin = id.slice(0, i);
  if (!facts.binaries.has(bin)) {
    return `. Cause: the test binary "${bin}" never ran in the cargo log (binaries that ran: ${[...facts.binaries].sort().join(', ') || 'none'}); it was not built, not selected by the cargo invocation, or the run died before it`;
  }
  if (facts.unfinished.includes(id)) {
    return '. Cause: the test started but no verdict line followed it (killed or crashed mid-test, or its verdict was swallowed)';
  }
  const rest = id.slice(i + 2);
  const near = [...facts.named].filter((k) => k.startsWith(`${bin}::`) && k.endsWith(`::${rest.split('::').pop()}`));
  const hint = near.length ? `; a test with that final name exists as ${near.join(', ')}: the promise register must follow the move` : '';
  return `. Cause: binary "${bin}" ran but listed no test of that name (renamed or moved, cfg-gated off this platform, or filtered out by name)${hint}`;
}

/**
 * The status of one test id in this run: pass | skipped | fail | absent.
 *
 * Rust ids are `<binary>::<test path>`, looked up in the cargo log. Every other
 * kind is a JUnit id: `<file>` (every case in that file), `<file>::<title>`
 * (that case) or `<file>::<describe>` (every case under that describe). A
 * match on nothing is `absent`; one skipped case makes the whole id `skipped`.
 */
export function resolveTest(test, results) {
  if (test.kind === 'rust') {
    const status = results.cargo?.[test.id];
    return status ?? 'absent';
  }
  const [file, title] = splitId(test.id);
  const cases = (results.junit ?? []).filter(
    (c) => c.file === file && (title === undefined || c.name === title || c.name.startsWith(`${title} > `)),
  );
  if (!cases.length) return 'absent';
  return cases.reduce((acc, c) => worse(acc, c.status), undefined);
}

function splitId(id) {
  const i = id.indexOf('::');
  return i < 0 ? [id, undefined] : [id.slice(0, i), id.slice(i + 2)];
}

// ─── --gate ─────────────────────────────────────────────────────────────────

/**
 * Judge one platform's run.
 *
 * @returns {{failures: string[], passes: string[], pending: string[], notes: string[]}}
 */
export function gate(doc, { platform, results, journeyTests, journeys = 'all' }) {
  const failures = [];
  const passes = [];
  const pending = [];
  const notes = [];
  if (!PLATFORMS.includes(platform)) {
    failures.push(`--platform "${platform}" is not one of ${PLATFORMS.join(', ')}.`);
    return { failures, passes, pending, notes };
  }
  if (!journeyTests) {
    notes.push(`NOTE: ${JOURNEY_TESTS_PATH} is absent, so only the tests listed in ${FEATURES_PATH} count. Journey tests added there will be required here.`);
  }
  for (const feature of doc.features ?? []) {
    if (feature.status === 'pending-proof') {
      pending.push(`PENDING-PROOF (not a pass): ${feature.id} — promised in public, not proven; journeys ${feature.journeys.join(', ')}; stream ${feature.owner_stream}.`);
      continue;
    }
    if (!GATED_STATUSES.includes(feature.status)) continue;

    const required = (feature.tests ?? []).filter((t) => t.platforms.includes(platform));
    let journeyChecks = 0;
    for (const j of feature.journeys ?? []) {
      const entry = journeyTests?.journeys?.[j];
      if (!entry?.spec || !entry.platforms?.includes(platform)) continue;
      journeyChecks++;
      // `skip`: a journey is judged by the journeys job of its platform (--only-journeys
      // there), not by the job that runs the unit and cargo tests; the two jobs do not
      // wait for each other. It still counts as a proof that exists.
      if (journeys === 'skip') continue;
      const via = `journey ${j} (${entry.spec}, e2e-real-app)`;
      const gaps = gapsOn(entry, platform);
      if (gaps.length) {
        failures.push(`FAIL ${feature.id} (${feature.status}) on ${platform}: ${via} has a known gap, which is not a pass: ${gaps.map((g) => `${g.id} (owner ${g.owner})`).join(', ')}.`);
        continue;
      }
      const status = results.journeys?.[j]?.status;
      if (status === 'pass') {
        passes.push(`PASS ${feature.id}: ${via}`);
      } else {
        const why = status === undefined
          ? `no result in the journey results for ${platform} (journey-results/${platform}/${j}.json, passed with --journey-results)`
          : `${String(status).toUpperCase()}, which is not a pass`;
        failures.push(`FAIL ${feature.id} (${feature.status}) on ${platform}: ${via} — ${why}.`);
      }
    }
    if (journeys === 'only') continue;
    if (!required.length && !journeyChecks) {
      if (SHIPPING_PLATFORMS.includes(platform)) {
        failures.push(`FAIL ${feature.id} (${feature.status}): no test names ${platform}. A promise on a shipping platform needs a test there.`);
      }
      continue;
    }
    for (const t of required) {
      const status = resolveTest(t, results);
      const from = t.journey ? ` via ${JOURNEY_TESTS_PATH} ${t.journey}` : '';
      if (status === 'pass') {
        passes.push(`PASS ${feature.id}: ${t.id} (${t.kind})${from}`);
      } else {
        const why = status === 'skipped' ? 'SKIPPED, which is not a pass' : status === 'absent' ? `not in this run's results${t.kind === 'rust' ? explainAbsentRust(t.id, results.cargoFacts) : ''}` : 'FAILED';
        failures.push(`FAIL ${feature.id} (${feature.status}) on ${platform}: test ${t.id} (${t.kind})${from} — ${why}.`);
      }
    }
  }
  return { failures, passes, pending, notes };
}

// ─── --publish ──────────────────────────────────────────────────────────────

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The fields of a published payload that the integrity hash covers, in order. */
export function integrityOf(payload) {
  const { schema, source, groups, features } = payload;
  return sha256(JSON.stringify({ schema, source, groups, features }));
}

export function publish(doc, { sourceText, commit = null }) {
  const features = (doc.features ?? [])
    .filter((f) => PUBLISHED_STATUSES.includes(f.status))
    .map((f) => {
      const out = {
        id: f.id,
        group: f.group,
        status: f.status,
        journeys: f.journeys,
        limits: f.limits,
        copy: { name: f.copy.name, site: f.copy.site, store_bullet: f.copy.store_bullet, claims: f.copy.claims },
        since: f.since,
      };
      if (f.status === 'pending-proof') out.owner_stream = f.owner_stream;
      return out;
    });
  const payload = {
    _: [
      `Published by scripts/quality/features.mjs --publish from ${FEATURES_PATH} in the editor repository.`,
      'Do not edit this file. Change the source and publish again; "integrity" is a sha256 over',
      'schema, source, groups and features, and the site build refuses a file that does not match it.',
    ],
    schema: 2,
    source: { path: FEATURES_PATH, sha256: sha256(sourceText), commit },
    groups: (doc.groups ?? []).map((g) => ({ id: g.id, title: g.title })),
    features,
  };
  payload.integrity = integrityOf(payload);
  return payload;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function argValues(argv, flag) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag && argv[i + 1] !== undefined) out.push(argv[++i]);
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function loadContext({ repo = REPO, base } = {}) {
  const journeys = readJson(JOURNEYS_PATH, repo).journeys.map((j) => j.id);
  const register = parseRegister(readFileSync(resolvePath(repo, REGISTER_PATH), 'utf8'));
  const exclusions = readJson(EXCLUSIONS_PATH, repo);
  const jtPath = resolvePath(repo, JOURNEY_TESTS_PATH);
  const journeyTests = existsSync(jtPath) ? JSON.parse(readFileSync(jtPath, 'utf8')) : null;
  return { journeys, register, exclusions, journeyTests, base };
}

function baseDocument(ref) {
  try {
    git(['rev-parse', '--verify', `${ref}^{commit}`]);
  } catch {
    throw new Error(`--base ${ref}: not a commit in this clone. The ratchet cannot be judged against nothing; fetch the history.`);
  }
  try {
    return JSON.parse(git(['show', `${ref}:${FEATURES_PATH}`]));
  } catch {
    return null;
  }
}

function main(argv = process.argv.slice(2)) {
  const sourceText = readFileSync(resolvePath(REPO, FEATURES_PATH), 'utf8');
  const doc = JSON.parse(sourceText);

  const baseRef = argValues(argv, '--base')[0];
  if (argv.includes('--base') && !baseRef) {
    console.error('features: FAIL — --base was given without a commit. The ratchet is not judged against nothing.');
    return 1;
  }
  let base;
  if (baseRef) {
    try {
      base = baseDocument(baseRef);
    } catch (e) {
      console.error(`features: FAIL — ${e.message}`);
      return 1;
    }
    if (base === null) {
      console.error(`NOTE: ${FEATURES_PATH} does not exist at ${baseRef}: this is the seeding change, and its pending_proof_ceiling is taken as declared.`);
    }
  }
  const ctx = loadContext({ base });
  const problems = checkFeatures(doc, ctx);
  if (problems.length) {
    console.error(`features: FAIL — ${problems.length} problem(s) in ${FEATURES_PATH}\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return 1;
  }

  const counts = Object.fromEntries(STATUSES.map((s) => [s, doc.features.filter((f) => f.status === s).length]));
  const summary = STATUSES.map((s) => `${counts[s]} ${s}`).join(', ');

  if (argv.includes('--gate')) {
    const platform = argValues(argv, '--platform')[0];
    const junitFiles = argValues(argv, '--junit');
    const cargoLogs = argValues(argv, '--cargo-log');
    if (!platform) {
      console.error('features: FAIL — --gate needs --platform <macos-arm64|windows-x64>.');
      return 1;
    }
    if (!junitFiles.length && !cargoLogs.length && !argValues(argv, '--journey-results').length) {
      console.error('features: FAIL — --gate needs at least one --junit or --cargo-log; with no results every test is absent.');
      return 1;
    }
    const results = { junit: [], cargo: {}, journeys: {}, cargoFacts: { binaries: new Set(), named: new Set(), unfinished: [] } };
    const journeyDir = argValues(argv, '--journey-results')[0];
    if (journeyDir) {
      const pdir = resolvePath(journeyDir, platform);
      if (!existsSync(pdir)) {
        console.error(`features: FAIL — --journey-results ${journeyDir}: there is no ${platform} directory in it. The journey run that should have written it did not.`);
        return 1;
      }
      for (const f of readdirSync(pdir)) {
        if (!/^J-[0-9A-Z]{2}\.json$/.test(f)) continue;
        const r = JSON.parse(readFileSync(resolvePath(pdir, f), 'utf8'));
        results.journeys[r.id ?? f.slice(0, -5)] = r;
      }
    }
    for (const f of junitFiles) {
      if (!existsSync(f)) {
        console.error(`features: FAIL — --junit ${f} does not exist. The run that should have written it did not.`);
        return 1;
      }
      results.junit.push(...parseJunit(readFileSync(f, 'utf8')));
    }
    for (const f of cargoLogs) {
      if (!existsSync(f)) {
        console.error(`features: FAIL — --cargo-log ${f} does not exist.`);
        return 1;
      }
      const scan = scanCargoLog(readFileSync(f, 'utf8'));
      for (const [k, v] of Object.entries(scan.results)) results.cargo[k] = worse(results.cargo[k], v);
      for (const b of scan.binaries) results.cargoFacts.binaries.add(b);
      for (const n of scan.named) results.cargoFacts.named.add(n);
      results.cargoFacts.unfinished.push(...scan.unfinished);
    }
    const skipJourneys = argv.includes('--skip-journeys');
    const onlyJourneys = argv.includes('--only-journeys');
    if (skipJourneys && onlyJourneys) {
      console.error('features: FAIL — --skip-journeys and --only-journeys exclude each other.');
      return 1;
    }
    if (onlyJourneys && !journeyDir) {
      console.error('features: FAIL — --only-journeys needs --journey-results <dir>.');
      return 1;
    }
    const verdict = gate(doc, { platform, results, journeyTests: ctx.journeyTests, journeys: skipJourneys ? 'skip' : onlyJourneys ? 'only' : 'all' });
    for (const n of verdict.notes) console.error(n);
    for (const p of verdict.passes) console.log(p);
    for (const p of verdict.pending) console.error(p);
    if (verdict.failures.length) {
      console.error(`\nfeatures --gate ${platform}: FAIL — ${verdict.failures.length} promise(s) not proven by this run\n`);
      for (const f of verdict.failures) console.error(`  ✗ ${f}`);
      return 1;
    }
    console.log(`✓ features --gate ${platform}: ${verdict.passes.length} test result(s) prove every promised and preview feature on this platform (${summary}).`);
    return 0;
  }

  const out = argValues(argv, '--publish')[0];
  if (out) {
    let commit = argValues(argv, '--commit')[0] ?? null;
    if (!commit) {
      try {
        commit = git(['log', '-1', '--format=%H', '--', FEATURES_PATH]).trim() || null;
        const dirty = git(['status', '--porcelain', '--', FEATURES_PATH]).trim();
        if (dirty) {
          console.error(`NOTE: ${FEATURES_PATH} has uncommitted changes; the published source.commit is recorded as null.`);
          commit = null;
        }
      } catch {
        commit = null;
      }
    }
    const payload = publish(doc, { sourceText, commit });
    mkdirSync(dirname(resolvePath(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`✓ features --publish: ${payload.features.length} feature(s) written to ${out} (integrity ${payload.integrity.slice(0, 12)}).`);
    return 0;
  }

  if (!ctx.journeyTests) console.error(`NOTE: ${JOURNEY_TESTS_PATH} is absent; only the tests in ${FEATURES_PATH} count.`);
  console.log(`✓ features --check: ${doc.features.length} features (${summary}); pending-proof ceiling ${doc.pending_proof_ceiling.length}.`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main();
